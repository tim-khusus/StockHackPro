// Debug: ekstrak semua field yang ada di chart v8 dengan berbagai modules
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { ticker = 'BBCA' } = req.query;
  const sym = ticker.toUpperCase().replace(/\.JK$/i,'') + '.JK';
  const H = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json',
    'Referer': 'https://finance.yahoo.com/',
  };

  // Coba semua module combinations di chart v8
  const urls = {
    'chart_all_modules': `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1d&modules=financialData,defaultKeyStatistics,summaryDetail,assetProfile`,
    'chart_range_3mo':   `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=3mo`,
    'chart_events':      `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1y&events=dividends,splits`,
  };

  const out = { ticker: sym };

  for (const [label, url] of Object.entries(urls)) {
    try {
      const r = await fetch(url, { headers: H });
      out[label+'_status'] = r.status;
      if (r.ok) {
        const j = await r.json();
        const result = j?.chart?.result?.[0];
        if (result) {
          // Tampilkan semua keys yang ada di result (selain indicators/timestamp)
          const keys = Object.keys(result).filter(k => !['timestamp','indicators'].includes(k));
          out[label+'_keys'] = keys;
          // Tampilkan meta keys
          out[label+'_meta_keys'] = Object.keys(result.meta || {});
          // Tampilkan events jika ada
          if (result.events) out[label+'_events'] = JSON.stringify(result.events).slice(0,500);
          // Tampilkan full meta (harga + extra fields)
          const meta = result.meta;
          out[label+'_meta'] = {
            price: meta.regularMarketPrice,
            eps: meta.epsTrailingTwelveMonths,
            epsForward: meta.epsForward,
            pe: meta.trailingPE,
            peForward: meta.forwardPE,
            bvps: meta.bookValue,
            dividendRate: meta.dividendRate,
            dividendYield: meta.dividendYield,
            beta: meta.beta,
            shares: meta.sharesOutstanding,
            mcap: meta.marketCap,
            fiftyDayAvg: meta.fiftyDayAverage,
            twoHundredDayAvg: meta.twoHundredDayAverage,
            '52wHi': meta.fiftyTwoWeekHigh,
            '52wLo': meta.fiftyTwoWeekLow,
          };
          // Semua keys di meta
          out[label+'_all_meta_keys'] = Object.keys(meta);
        }
      }
    } catch(e) { out[label+'_error'] = e.message; }
  }

  return res.status(200).json(out);
}
