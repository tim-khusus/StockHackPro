// api/debug.js — test fundamental sources yang masih bisa diakses
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { ticker = 'BBCA' } = req.query;
  const sym = ticker.toUpperCase().replace(/\.JK$/i,'') + '.JK';
  const bare = sym.replace('.JK','');
  const H = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json',
    'Referer': 'https://finance.yahoo.com/',
  };
  const out = { ticker: sym, time: new Date().toISOString() };

  const t = async (label, url, hdrs=H) => {
    try {
      const r = await fetch(url, { headers: hdrs });
      out[label+'_s'] = r.status;
      const txt = await r.text();
      out[label+'_p'] = txt.slice(0,250);
      try { return JSON.parse(txt); } catch { return null; }
    } catch(e) { out[label+'_e'] = e.message; return null; }
  };

  // 1. Yahoo chart dengan modules parameter
  await t('chart_modules',
    `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1d&modules=defaultKeyStatistics,financialData,summaryDetail`);

  // 2. Yahoo quoteSummary v8 (versi berbeda)
  await t('v8_summary',
    `https://query1.finance.yahoo.com/v8/finance/quoteSummary/${sym}?modules=defaultKeyStatistics,financialData`);

  // 3. IDN Financials — sumber data IDX Indonesia publik
  await t('idn',
    `https://idn.financials.com/api/v1/company/${bare}?source=idx`);

  // 4. IDX official API
  await t('idx_official',
    `https://idx.co.id/umbraco/Surface/StockData/GetStockSummary?code=${bare}`);

  // 5. IDX API v2
  await t('idx_v2',
    `https://idx.co.id/api/StockSummary?code=${bare}`);

  // 6. Stockbit public API
  await t('stockbit',
    `https://api.stockbit.com/v2.4/summary/${bare}`, {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'application/json',
    });

  // 7. IPOT / Indo Premier public
  await t('ipot',
    `https://api.ipot.co.id/stockDetail/${bare}`);

  // 8. Yahoo Finance screener / insights (terkadang buka)
  await t('insights',
    `https://query1.finance.yahoo.com/v1/finance/insights?symbol=${sym}`);

  // 9. Yahoo recommendations summary (tidak perlu crumb)
  await t('rec_summary',
    `https://query2.finance.yahoo.com/v1/finance/recommendationsbysymbol/${sym}`);

  // 10. Open source yfinance proxy — public instances
  await t('yfinance_proxy',
    `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${sym}?modules=financialData&formatted=false&lang=en-US&region=US`);

  return res.status(200).json(out);
}
