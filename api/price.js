// api/price.js
// Yahoo Finance memerlukan crumb untuk endpoint fundamental.
// Flow: 1) GET crumb  2) GET chart (harga+historis)  3) GET quoteSummary pakai crumb

const BASE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Origin': 'https://finance.yahoo.com',
  'Referer': 'https://finance.yahoo.com/',
};

// Extract nilai dari format Yahoo {raw: x} atau angka biasa
const yv = (obj, key) => {
  if (!obj || !key) return null;
  const val = obj[key];
  if (val === null || val === undefined) return null;
  if (typeof val === 'object' && val !== null && 'raw' in val) return val.raw ?? null;
  if (typeof val === 'number') return val;
  return null;
};

const fmtMcap = (n) => {
  if (!n || n <= 0) return null;
  if (n >= 1e15) return `Rp ${(n/1e15).toFixed(1)} T`;
  if (n >= 1e12) return `Rp ${(n/1e12).toFixed(1)} T`;
  if (n >= 1e9)  return `Rp ${(n/1e9).toFixed(0)} M`;
  return null;
};

// Ambil crumb + cookie dari Yahoo Finance
async function getYahooCrumb() {
  // Step 1: Hit consent/home untuk dapat cookie A3
  const cookieRes = await fetch('https://finance.yahoo.com/', {
    headers: {
      ...BASE_HEADERS,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    redirect: 'follow',
  });

  // Kumpulkan semua cookie
  const rawCookies = cookieRes.headers.getSetCookie?.() || [];
  let cookieStr = '';
  if (rawCookies.length > 0) {
    cookieStr = rawCookies.map(c => c.split(';')[0].trim()).filter(Boolean).join('; ');
  } else {
    // Fallback untuk Node versi lama
    const rawHeader = cookieRes.headers.get('set-cookie') || '';
    cookieStr = rawHeader.split(/,(?=[^ ])/).map(c => c.split(';')[0].trim()).filter(Boolean).join('; ');
  }

  // Step 2: Ambil crumb dengan cookie
  const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: { ...BASE_HEADERS, 'Cookie': cookieStr },
  });

  if (!crumbRes.ok) throw new Error(`Crumb HTTP ${crumbRes.status}`);
  const crumb = (await crumbRes.text()).trim();
  if (!crumb || crumb.length < 5 || crumb.startsWith('{')) {
    throw new Error('Crumb tidak valid: ' + crumb.slice(0, 80));
  }

  return { crumb, cookieStr };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { ticker } = req.query;
  if (!ticker) return res.status(400).json({ error: 'Ticker diperlukan' });

  const sym = ticker.toUpperCase().replace(/\.JK$/i, '') + '.JK';

  try {

    // ═══════════════════════════════════════════════════
    // 1. CHART — harga + historis (tidak perlu crumb)
    // ═══════════════════════════════════════════════════
    const chartRes = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=3mo&includePrePost=false`,
      { headers: BASE_HEADERS }
    );
    if (!chartRes.ok) {
      return res.status(404).json({ found: false, reason: `${sym} tidak ditemukan (HTTP ${chartRes.status})` });
    }

    const chartJson = await chartRes.json();
    const cr = chartJson?.chart?.result?.[0];
    if (!cr) return res.status(404).json({ found: false, reason: 'Data chart kosong' });

    const meta    = cr.meta || {};
    const ts      = cr.timestamp || [];
    const qd      = cr.indicators?.quote?.[0] || {};
    const closes  = qd.close  || [];
    const volumes = qd.volume || [];
    const opens   = qd.open   || [];
    const highs   = qd.high   || [];
    const lows    = qd.low    || [];

    // 10 sesi historis real
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

    // ═══════════════════════════════════════════════════
    // 2. CRUMB — untuk akses endpoint fundamental
    // ═══════════════════════════════════════════════════
    let crumb = '', cookieStr = '';
    try {
      const cd = await getYahooCrumb();
      crumb     = cd.crumb;
      cookieStr = cd.cookieStr;
    } catch(e) {
      console.log('[price.js] crumb gagal:', e.message);
    }

    // ═══════════════════════════════════════════════════
    // 3. QUOTESUMMARY — dengan crumb & cookie
    // ═══════════════════════════════════════════════════
    const MODULES = 'summaryDetail,defaultKeyStatistics,financialData,assetProfile,incomeStatementHistory,balanceSheetHistory';
    let sd={}, ks={}, fd={}, ap={}, isl={}, bsl={}, summaryOk=false;

    if (crumb) {
      const sHeaders = { ...BASE_HEADERS, 'Cookie': cookieStr };
      const crumbEnc = encodeURIComponent(crumb);
      const urls = [
        `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${sym}?modules=${MODULES}&crumb=${crumbEnc}&formatted=false`,
        `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${sym}?modules=${MODULES}&crumb=${crumbEnc}&formatted=false`,
      ];
      for (const url of urls) {
        if (summaryOk) break;
        try {
          const r = await fetch(url, { headers: sHeaders });
          if (r.ok) {
            const j    = await r.json();
            const rslt = j?.quoteSummary?.result?.[0];
            if (rslt) {
              sd  = rslt.summaryDetail           || {};
              ks  = rslt.defaultKeyStatistics    || {};
              fd  = rslt.financialData           || {};
              ap  = rslt.assetProfile            || {};
              isl = rslt.incomeStatementHistory?.incomeStatementHistory?.[0] || {};
              bsl = rslt.balanceSheetHistory?.balanceSheetHistory?.[0]       || {};
              summaryOk = true;
            }
          }
        } catch(e) { /* coba url berikutnya */ }
      }
    }

    // ═══════════════════════════════════════════════════
    // 4. Kalkulasi semua nilai
    // ═══════════════════════════════════════════════════
    const price  = meta.regularMarketPrice || meta.previousClose || 0;
    const shares = yv(ks,'sharesOutstanding') || yv(ks,'impliedSharesOutstanding') || null;
    const mcap   = shares && price ? shares * price : null;

    const wk52hi = meta.fiftyTwoWeekHigh || yv(sd,'fiftyTwoWeekHigh') || 0;
    const wk52lo = meta.fiftyTwoWeekLow  || yv(sd,'fiftyTwoWeekLow')  || 0;

    const netIncome = yv(isl,'netIncome') || yv(isl,'netIncomeApplicableToCommonShares') || null;
    const eps  = yv(ks,'trailingEps') || (netIncome && shares && shares > 0 ? netIncome/shares : null);
    const equity = yv(bsl,'totalStockholderEquity') || yv(bsl,'stockholdersEquity') || null;
    const bvps = yv(ks,'bookValue') || (equity && shares && shares > 0 ? equity/shares : null);

    const beta = yv(ks,'beta') || null;
    const coe  = beta != null ? parseFloat((6.5 + beta*5.5).toFixed(2)) : 11.0;

    const roeRaw = yv(fd,'returnOnEquity');
    const roe  = roeRaw != null ? roeRaw*100 : (netIncome && equity && equity>0 ? netIncome/equity*100 : null);
    const pe   = yv(sd,'trailingPE') || yv(ks,'trailingPE') || (eps&&eps>0&&price ? parseFloat((price/eps).toFixed(2)) : null);
    const pb   = yv(ks,'priceToBook') || (bvps&&bvps>0&&price ? parseFloat((price/bvps).toFixed(2)) : null);
    const epsGrowth = yv(ks,'earningsQuarterlyGrowth') != null
      ? yv(ks,'earningsQuarterlyGrowth')*100
      : yv(fd,'earningsGrowth') != null ? yv(fd,'earningsGrowth')*100 : null;
    const avgVol = yv(sd,'averageVolume') || avgVol30;

    const lastOpen  = opens.length  ? opens[opens.length-1]   : 0;
    const lastHigh  = highs.length  ? highs[highs.length-1]   : 0;
    const lastLow   = lows.length   ? lows[lows.length-1]     : 0;
    const lastVol   = volumes.length? volumes[volumes.length-1]: 0;
    const prevClose = closes.length > 1 ? closes[closes.length-2] : 0;

    return res.status(200).json({
      found: true,
      summary_ok: summaryOk,

      ticker:         sym.replace('.JK',''),
      price:          Math.round(price),
      change:         Math.round(meta.regularMarketChange || 0),
      change_pct:     parseFloat((meta.regularMarketChangePercent || 0).toFixed(2)),
      open:           Math.round(meta.regularMarketOpen    || lastOpen  || 0),
      high:           Math.round(meta.regularMarketDayHigh || lastHigh  || 0),
      low:            Math.round(meta.regularMarketDayLow  || lastLow   || 0),
      volume:         meta.regularMarketVolume || lastVol || 0,
      avg_volume:     avgVol,
      prev_close:     Math.round(meta.previousClose || prevClose || 0),
      week52_high:    Math.round(wk52hi),
      week52_low:     Math.round(wk52lo),
      market_cap_str: fmtMcap(mcap),
      company_name:   meta.longName || meta.shortName || sym,
      sector:         ap.sector   || 'N/A',
      industry:       ap.industry || 'N/A',

      sessions,
      avg_vol_30d: avgVol30 || avgVol,

      eps_ttm:              eps,
      eps_growth_rate:      epsGrowth,
      book_value_per_share: bvps,
      dps:                  yv(sd,'dividendRate') || null,
      dividend_yield:       yv(sd,'dividendYield') != null ? yv(sd,'dividendYield')*100 : null,
      dividend_growth_rate: null,
      roe,
      roa:           yv(fd,'returnOnAssets')  != null ? yv(fd,'returnOnAssets') *100 : null,
      net_margin:    yv(fd,'profitMargins')   != null ? yv(fd,'profitMargins')  *100 : null,
      revenue_growth:yv(fd,'revenueGrowth')   != null ? yv(fd,'revenueGrowth') *100 : null,
      debt_to_equity:yv(fd,'debtToEquity'),
      current_ratio: yv(fd,'currentRatio'),
      pe_ratio:      pe,
      pb_ratio:      pb,
      beta,
      cost_of_equity:coe,
    });

  } catch (err) {
    console.error('[price.js]', err.message);
    return res.status(500).json({ found: false, reason: 'Server error: ' + err.message });
  }
}
