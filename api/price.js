// api/price.js
// Semua data diambil dari Yahoo Finance chart v8 — TIDAK butuh crumb/cookie
// Chart meta mengandung: harga, EPS, PE, Book Value, Beta, Dividend, dll

const H = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Origin': 'https://finance.yahoo.com',
  'Referer': 'https://finance.yahoo.com/',
};

const fmtMcap = (n) => {
  if (!n || n <= 0) return null;
  if (n >= 1e15) return `Rp ${(n/1e15).toFixed(1)} T`;
  if (n >= 1e12) return `Rp ${(n/1e12).toFixed(1)} T`;
  if (n >= 1e9)  return `Rp ${(n/1e9).toFixed(0)} M`;
  return null;
};

const safe = (v) => (v !== undefined && v !== null && !isNaN(v)) ? v : null;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { ticker } = req.query;
  if (!ticker) return res.status(400).json({ error: 'Ticker diperlukan' });

  const sym = ticker.toUpperCase().replace(/\.JK$/i, '') + '.JK';

  try {
    // ═══════════════════════════════════════════════════════
    // Fetch 1: Chart 3 bulan — historis OHLCV + meta fundamental
    // modules parameter meminta Yahoo sertakan data tambahan di meta
    // ═══════════════════════════════════════════════════════
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}`
      + `?interval=1d&range=3mo&includePrePost=false`
      + `&modules=financialData,defaultKeyStatistics,summaryDetail,assetProfile`;

    const r = await fetch(url, { headers: H });
    if (!r.ok) {
      // Fallback tanpa modules
      const r2 = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=3mo`,
        { headers: H }
      );
      if (!r2.ok) return res.status(404).json({ found: false, reason: `${sym} tidak ditemukan` });
      const j2 = await r2.json();
      return processChart(j2, sym, res);
    }

    const j = await r.json();
    return processChart(j, sym, res);

  } catch (err) {
    console.error('[price.js]', err.message);
    return res.status(500).json({ found: false, reason: err.message });
  }
}

function processChart(j, sym, res) {
  const cr = j?.chart?.result?.[0];
  if (!cr) return res.status(404).json({ found: false, reason: 'Data tidak tersedia' });

  const meta = cr.meta || {};
  const ts   = cr.timestamp || [];
  const qd   = cr.indicators?.quote?.[0] || {};
  const closes  = qd.close  || [];
  const volumes = qd.volume || [];
  const opens   = qd.open   || [];
  const highs   = qd.high   || [];
  const lows    = qd.low    || [];

  // ── Historis 10 sesi terakhir (real dari chart) ───────────────
  const allSess = ts.map((t, i) => ({
    date:  new Date(t * 1000).toLocaleDateString('id-ID', { day:'2-digit', month:'2-digit' }),
    vol:   Math.round(volumes[i] || 0),
    price: closes[i] ? Math.round(closes[i]) : 0,
    change_pct: i > 0 && closes[i-1] && closes[i]
      ? parseFloat(((closes[i] - closes[i-1]) / closes[i-1] * 100).toFixed(2)) : 0,
  })).filter(s => s.price > 0 && s.vol > 0);

  const sessions = allSess.slice(-10).reverse().map((s, i) => ({
    session: i === 0 ? 'T' : `T-${i}`,
    date: s.date, vol: s.vol, price: s.price,
    change_pct: s.change_pct, is_estimated: false,
  }));

  const avgVol30 = allSess.length > 0
    ? Math.round(allSess.slice(-30).reduce((s,x) => s + x.vol, 0) / Math.min(30, allSess.length))
    : null;

  // ── Harga dari meta ───────────────────────────────────────────
  const price = meta.regularMarketPrice || meta.previousClose || 0;

  // ── Fundamental dari meta chart ───────────────────────────────
  // Yahoo menyertakan field-field ini di meta chart:
  const eps    = safe(meta.epsTrailingTwelveMonths);
  const epsF   = safe(meta.epsForward);
  const pe     = safe(meta.trailingPE);
  const peF    = safe(meta.forwardPE);
  const bvps   = safe(meta.bookValue);
  const beta   = safe(meta.beta) || safe(meta.beta3Year);
  const divR   = safe(meta.dividendRate);
  const divY   = safe(meta.dividendYield);
  const shares = safe(meta.sharesOutstanding);
  const mcap   = safe(meta.marketCap) || (shares && price ? shares * price : null);

  // 52W — dari meta (paling akurat)
  const wk52hi = safe(meta.fiftyTwoWeekHigh) || 0;
  const wk52lo = safe(meta.fiftyTwoWeekLow)  || 0;

  // P/B kalkulasi manual jika bvps ada
  const pb = bvps && bvps > 0 && price ? parseFloat((price / bvps).toFixed(2)) : null;

  // PE kalkulasi manual jika eps ada tapi pe tidak ada
  const peCalc = pe || (eps && eps > 0 && price ? parseFloat((price / eps).toFixed(2)) : null);

  // Cost of Equity: CAPM Rf=6.5% + β×5.5%
  const coe = beta ? parseFloat((6.5 + beta * 5.5).toFixed(2)) : 11.0;

  // Sector/industry dari meta atau assetProfile (kalau modules berhasil)
  const ap = cr.assetProfile || {};
  const fd = cr.financialData || {};
  const ks = cr.defaultKeyStatistics || {};
  const sd = cr.summaryDetail || {};

  // Coba ambil dari modules response jika ada (jika Yahoo sertakan)
  const roeRaw  = fd.returnOnEquity?.raw ?? fd.returnOnEquity ?? null;
  const roaRaw  = fd.returnOnAssets?.raw ?? fd.returnOnAssets ?? null;
  const marginRaw = fd.profitMargins?.raw ?? fd.profitMargins ?? null;
  const deRaw   = fd.debtToEquity?.raw ?? fd.debtToEquity ?? null;
  const crRaw   = fd.currentRatio?.raw ?? fd.currentRatio ?? null;
  const revGrow = fd.revenueGrowth?.raw ?? fd.revenueGrowth ?? null;
  const epsGrow = ks.earningsQuarterlyGrowth?.raw ?? ks.earningsQuarterlyGrowth
    ?? fd.earningsGrowth?.raw ?? fd.earningsGrowth ?? null;
  const bvpsAdv = ks.bookValue?.raw ?? ks.bookValue ?? bvps;
  const epsAdv  = ks.trailingEps?.raw ?? ks.trailingEps ?? eps;
  const betaAdv = ks.beta?.raw ?? ks.beta ?? beta;
  const divAdv  = sd.dividendRate?.raw ?? sd.dividendRate ?? divR;
  const divYAdv = sd.dividendYield?.raw ?? sd.dividendYield ?? divY;
  const peAdv   = (sd.trailingPE?.raw ?? sd.trailingPE) || (ks.trailingPE?.raw ?? ks.trailingPE) || peCalc;
  const pbAdv   = ks.priceToBook?.raw ?? ks.priceToBook ?? pb;
  const sector  = ap.sector   || meta.sector   || 'N/A';
  const industry= ap.industry || meta.industry || 'N/A';

  // Avg volume
  const avgVol = sd.averageVolume?.raw ?? sd.averageVolume ?? avgVol30;

  return res.status(200).json({
    found: true,
    modules_in_response: Object.keys(cr).filter(k => !['meta','timestamp','indicators'].includes(k)),

    // ── Market Data ────────────────────────────────────────────
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
    sector,
    industry,

    // ── Historis ───────────────────────────────────────────────
    sessions,
    avg_vol_30d: avgVol30 || avgVol,

    // ── Fundamental dari chart meta ────────────────────────────
    eps_ttm:              epsAdv   || eps,
    eps_growth_rate:      epsGrow  != null ? epsGrow * 100 : null,
    book_value_per_share: bvpsAdv  || bvps,
    dps:                  divAdv,
    dividend_yield:       divYAdv  != null ? (divYAdv < 1 ? divYAdv * 100 : divYAdv) : null,
    dividend_growth_rate: null,
    roe:                  roeRaw   != null ? (Math.abs(roeRaw) < 2 ? roeRaw * 100 : roeRaw) : null,
    roa:                  roaRaw   != null ? (Math.abs(roaRaw) < 2 ? roaRaw * 100 : roaRaw) : null,
    net_margin:           marginRaw!= null ? (Math.abs(marginRaw) < 2 ? marginRaw * 100 : marginRaw) : null,
    revenue_growth:       revGrow  != null ? revGrow * 100 : null,
    debt_to_equity:       deRaw,
    current_ratio:        crRaw,
    pe_ratio:             peAdv,
    pb_ratio:             pbAdv    || pb,
    beta:                 betaAdv  || beta,
    cost_of_equity:       coe,
  });
}
