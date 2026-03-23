// api/price.js — Fetch data REAL dari Yahoo Finance
// v11 endpoint + fallback v10 + headers lengkap untuk bypass bot detection

const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Origin': 'https://finance.yahoo.com',
  'Referer': 'https://finance.yahoo.com/',
};

// Safely extract Yahoo Finance value (handles {raw:x} format atau langsung number)
const yv = (obj, key) => {
  if (!obj || key === undefined) return null;
  const val = obj[key];
  if (val === null || val === undefined) return null;
  if (typeof val === 'object' && 'raw' in val) return val.raw ?? null;
  if (typeof val === 'number') return val;
  return null;
};

const fmtMcap = (n) => {
  if (!n) return null;
  if (n >= 1e15) return `Rp ${(n/1e15).toFixed(1)} T`;
  if (n >= 1e12) return `Rp ${(n/1e12).toFixed(1)} T`;
  if (n >= 1e9)  return `Rp ${(n/1e9).toFixed(0)} M`;
  return null;
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { ticker } = req.query;
  if (!ticker) return res.status(400).json({ error: 'Ticker diperlukan' });

  const sym = ticker.toUpperCase().replace(/\.JK$/i, '') + '.JK';

  try {

    // ═══════════════════════════════════════════
    // 1. CHART — harga + historis (paling reliable)
    // ═══════════════════════════════════════════
    const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=3mo&includePrePost=false`;
    const chartRes = await fetch(chartUrl, { headers: YF_HEADERS });

    if (!chartRes.ok) {
      // Coba query2
      const chartRes2 = await fetch(
        `https://query2.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=3mo`,
        { headers: YF_HEADERS }
      );
      if (!chartRes2.ok) {
        return res.status(404).json({ found: false, reason: `${ticker} tidak ditemukan di Yahoo Finance` });
      }
    }

    const chartJson = await (chartRes.ok ? chartRes : await fetch(`https://query2.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=3mo`, { headers: YF_HEADERS })).json();
    const cr = chartJson?.chart?.result?.[0];
    if (!cr) return res.status(404).json({ found: false, reason: 'Data tidak tersedia' });

    const meta    = cr.meta || {};
    const ts      = cr.timestamp || [];
    const qd      = cr.indicators?.quote?.[0] || {};
    const closes  = qd.close  || [];
    const volumes = qd.volume || [];
    const opens   = qd.open   || [];
    const highs   = qd.high   || [];
    const lows    = qd.low    || [];

    // Sessions historis REAL dari chart
    const allSess = ts.map((t, i) => ({
      date:       new Date(t * 1000).toLocaleDateString('id-ID', { day:'2-digit', month:'2-digit' }),
      vol:        Math.round(volumes[i] || 0),
      price:      closes[i] ? Math.round(closes[i]) : 0,
      change_pct: i > 0 && closes[i-1] && closes[i]
        ? parseFloat(((closes[i] - closes[i-1]) / closes[i-1] * 100).toFixed(2))
        : 0,
    })).filter(s => s.price > 0 && s.vol > 0);

    const sessions = allSess.slice(-10).reverse().map((s, i) => ({
      session: i === 0 ? 'T' : `T-${i}`,
      date:    s.date, vol: s.vol, price: s.price,
      change_pct: s.change_pct, is_estimated: false,
    }));

    const avgVol30real = allSess.length > 0
      ? Math.round(allSess.slice(-30).reduce((s,x) => s + x.vol, 0) / Math.min(30, allSess.length))
      : null;

    // ═══════════════════════════════════════════
    // 2. QUOTE SUMMARY — coba v11 lalu fallback v10
    // ═══════════════════════════════════════════
    const modules = 'summaryDetail,defaultKeyStatistics,financialData,assetProfile,incomeStatementHistory,balanceSheetHistory';

    let sd={}, ks={}, fd={}, ap={}, isl={}, bsl={};
    let summaryOk = false;

    const tryFetch = async (url) => {
      try {
        const r = await fetch(url, { headers: YF_HEADERS });
        if (!r.ok) return null;
        const j = await r.json();
        return j?.quoteSummary?.result?.[0] || null;
      } catch { return null; }
    };

    // v11 — formatted=false untuk dapat angka langsung (bukan object {raw,fmt})
    let summaryResult = await tryFetch(
      `https://query1.finance.yahoo.com/v11/finance/quoteSummary/${sym}?modules=${modules}&formatted=false&corsDomain=finance.yahoo.com`
    );

    // Fallback v10 query1
    if (!summaryResult) {
      summaryResult = await tryFetch(
        `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${sym}?modules=${modules}&formatted=false`
      );
    }

    // Fallback v10 query2
    if (!summaryResult) {
      summaryResult = await tryFetch(
        `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${sym}?modules=${modules}`
      );
    }

    if (summaryResult) {
      sd  = summaryResult.summaryDetail           || {};
      ks  = summaryResult.defaultKeyStatistics    || {};
      fd  = summaryResult.financialData           || {};
      ap  = summaryResult.assetProfile            || {};
      isl = summaryResult.incomeStatementHistory?.incomeStatementHistory?.[0] || {};
      bsl = summaryResult.balanceSheetHistory?.balanceSheetHistory?.[0]       || {};
      summaryOk = true;
    }

    // ═══════════════════════════════════════════
    // 3. Kalkulasi semua nilai
    // ═══════════════════════════════════════════
    const price   = meta.regularMarketPrice || meta.previousClose || 0;
    const shares  = yv(ks,'sharesOutstanding') || yv(ks,'impliedSharesOutstanding') || null;
    const mcap    = shares && price ? shares * price : null;

    // 52W — dari meta chart (selalu ada) atau summary
    const wk52hi = meta.fiftyTwoWeekHigh || yv(sd,'fiftyTwoWeekHigh')
      || (closes.length ? Math.max(...closes.filter(Boolean)) : 0);
    const wk52lo = meta.fiftyTwoWeekLow  || yv(sd,'fiftyTwoWeekLow')
      || (closes.length ? Math.min(...closes.filter(Boolean).filter(v=>v>0)) : 0);

    // EPS TTM — dari beberapa sumber
    const netIncome = yv(isl,'netIncome') || yv(isl,'netIncomeApplicableToCommonShares') || null;
    const eps = yv(ks,'trailingEps')
      || (netIncome && shares && shares > 0 ? netIncome / shares : null);

    // Book Value Per Share
    const equity = yv(bsl,'totalStockholderEquity') || yv(bsl,'stockholdersEquity') || null;
    const bvps   = yv(ks,'bookValue')
      || (equity && shares && shares > 0 ? equity / shares : null);

    // EPS Growth
    const epsGrowth = yv(ks,'earningsQuarterlyGrowth') != null
      ? yv(ks,'earningsQuarterlyGrowth') * 100
      : yv(fd,'earningsGrowth') != null ? yv(fd,'earningsGrowth') * 100 : null;

    // Beta & CoE
    const beta = yv(ks,'beta') || null;
    const coe  = beta != null ? parseFloat((6.5 + beta * 5.5).toFixed(2)) : 11.0;

    // ROE — dari financialData atau hitung manual
    const roeRaw = yv(fd,'returnOnEquity');
    const roe = roeRaw != null ? roeRaw * 100
      : (netIncome && equity && equity > 0 ? netIncome / equity * 100 : null);

    // P/E — dari summary atau hitung manual
    const pe = yv(sd,'trailingPE') || yv(ks,'trailingPE')
      || (eps && eps > 0 && price ? parseFloat((price/eps).toFixed(2)) : null);

    // P/B — dari summary atau hitung manual
    const pb = yv(ks,'priceToBook')
      || (bvps && bvps > 0 && price ? parseFloat((price/bvps).toFixed(2)) : null);

    // Avg volume
    const avgVol = yv(sd,'averageVolume') || yv(sd,'averageVolume10days') || avgVol30real;

    return res.status(200).json({
      found:       true,
      summary_ok:  summaryOk,

      // ── Market Data (REAL) ─────────────────────────────────
      ticker:         sym.replace('.JK',''),
      price:          Math.round(price),
      change:         Math.round(meta.regularMarketChange || 0),
      change_pct:     parseFloat((meta.regularMarketChangePercent || 0).toFixed(2)),
      open:           Math.round(meta.regularMarketOpen    || opens.at(-1)  || 0),
      high:           Math.round(meta.regularMarketDayHigh || highs.at(-1)  || 0),
      low:            Math.round(meta.regularMarketDayLow  || lows.at(-1)   || 0),
      volume:         meta.regularMarketVolume || volumes.at(-1) || 0,
      avg_volume:     avgVol,
      prev_close:     Math.round(meta.previousClose || closes.at(-2) || 0),
      week52_high:    Math.round(wk52hi),
      week52_low:     Math.round(wk52lo),
      market_cap_str: fmtMcap(mcap),
      company_name:   meta.longName || meta.shortName || sym,
      sector:         ap.sector   || 'N/A',
      industry:       ap.industry || 'N/A',

      // ── Historis REAL ──────────────────────────────────────
      sessions,
      avg_vol_30d: avgVol30real || avgVol,

      // ── Fundamental ────────────────────────────────────────
      eps_ttm:              eps,
      eps_growth_rate:      epsGrowth,
      book_value_per_share: bvps,
      dps:                  yv(sd,'dividendRate') || null,
      dividend_yield:       yv(sd,'dividendYield') != null ? yv(sd,'dividendYield') * 100 : null,
      dividend_growth_rate: null,
      roe,
      roa:                  yv(fd,'returnOnAssets') != null ? yv(fd,'returnOnAssets') * 100 : null,
      net_margin:           yv(fd,'profitMargins')  != null ? yv(fd,'profitMargins')  * 100 : null,
      revenue_growth:       yv(fd,'revenueGrowth')  != null ? yv(fd,'revenueGrowth')  * 100 : null,
      debt_to_equity:       yv(fd,'debtToEquity'),
      current_ratio:        yv(fd,'currentRatio'),
      pe_ratio:             pe,
      pb_ratio:             pb,
      beta,
      cost_of_equity:       coe,
    });

  } catch (err) {
    console.error('[price.js]', err.message);
    return res.status(500).json({ found: false, reason: 'Server error: ' + err.message });
  }
}
