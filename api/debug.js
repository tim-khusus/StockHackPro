// api/debug.js — test berbagai endpoint alternatif
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { ticker = 'BBCA' } = req.query;
  const sym = ticker.toUpperCase().replace(/\.JK$/i,'') + '.JK';
  const H = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json',
    'Referer': 'https://finance.yahoo.com/',
  };
  const out = { ticker: sym, time: new Date().toISOString() };

  const tryFetch = async (label, url, headers=H) => {
    try {
      const r = await fetch(url, { headers });
      out[label+'_status'] = r.status;
      if (r.ok) {
        const t = await r.text();
        out[label+'_preview'] = t.slice(0, 300);
        try { return JSON.parse(t); } catch { return null; }
      } else {
        out[label+'_err'] = await r.text().then(t=>t.slice(0,150));
      }
    } catch(e) { out[label+'_catch'] = e.message; }
    return null;
  };

  // 1. Chart v8 — sudah terbukti berhasil
  const chart = await tryFetch('chart',
    `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1y&modules=financialData`);
  if (chart?.chart?.result?.[0]?.meta) {
    const meta = chart.chart.result[0].meta;
    out.chart_price = meta.regularMarketPrice;
    out.chart_52whi = meta.fiftyTwoWeekHigh;
    // cek apakah ada financialData di dalam chart
    out.chart_financialData = JSON.stringify(chart.chart.result[0].financialData || 'not in chart').slice(0,100);
  }

  // 2. Yahoo Finance fundamentals via spark endpoint (tidak butuh crumb)
  await tryFetch('spark',
    `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${sym}&range=1y&interval=1mo`);

  // 3. Yahoo v11 quoteSummary (terkadang masih bisa tanpa crumb di beberapa endpoint)
  await tryFetch('v11_nocrumb',
    `https://query1.finance.yahoo.com/v11/finance/quoteSummary/${sym}?modules=defaultKeyStatistics,financialData&formatted=false`);

  // 4. Alpha Vantage — free, no crumb (butuh API key tapi ada free tier)
  // out.alphavantage = 'requires ALPHA_VANTAGE_KEY env var';

  // 5. FMP (Financial Modeling Prep) — free tier 250 req/day
  await tryFetch('fmp_profile',
    `https://financialmodelingprep.com/api/v3/profile/${sym.replace('.JK','')}.JK?apikey=demo`);

  // 6. FMP ratios
  await tryFetch('fmp_ratios',
    `https://financialmodelingprep.com/api/v3/ratios-ttm/${sym.replace('.JK','')}.JK?apikey=demo`);

  // 7. Yahoo quote v6 (mobile endpoint, kadang tidak perlu crumb)
  await tryFetch('quote_v6',
    `https://query2.finance.yahoo.com/v6/finance/quote?symbols=${sym}`);

  // 8. Yahoo Finance search endpoint (public)
  await tryFetch('search',
    `https://query1.finance.yahoo.com/v1/finance/search?q=${sym}&quotesCount=1&newsCount=0`);

  return res.status(200).json(out);
}
