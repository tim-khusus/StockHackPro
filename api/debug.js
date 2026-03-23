// api/debug.js — Endpoint debug sementara
// Akses: https://yourdomain.vercel.app/api/debug?ticker=BBCA
// HAPUS file ini setelah selesai debug!

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { ticker = 'BBCA' } = req.query;
  const sym = ticker.toUpperCase().replace(/\.JK$/i, '') + '.JK';

  const YF = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json',
    'Referer': 'https://finance.yahoo.com/',
  };

  const report = {};

  // Test 1: Chart v8
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=5d`, { headers: YF });
    report.chart_v8_status = r.status;
    if (r.ok) {
      const j = await r.json();
      const meta = j?.chart?.result?.[0]?.meta || {};
      report.chart_v8_price    = meta.regularMarketPrice;
      report.chart_v8_name     = meta.longName || meta.shortName;
      report.chart_v8_52whi    = meta.fiftyTwoWeekHigh;
      const closes = j?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [];
      report.chart_v8_closes   = closes.slice(-3).map(v => v ? Math.round(v) : null);
    } else {
      report.chart_v8_body = await r.text().then(t => t.slice(0, 200));
    }
  } catch(e) { report.chart_v8_error = e.message; }

  // Test 2: quoteSummary v11
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v11/finance/quoteSummary/${sym}?modules=summaryDetail,defaultKeyStatistics,financialData,assetProfile&formatted=false`,
      { headers: YF }
    );
    report.summary_v11_status = r.status;
    if (r.ok) {
      const j = await r.json();
      const result = j?.quoteSummary?.result?.[0];
      const fd = result?.financialData || {};
      const ks = result?.defaultKeyStatistics || {};
      const sd = result?.summaryDetail || {};
      const ap = result?.assetProfile || {};
      report.summary_v11_ok       = !!result;
      report.summary_v11_sector   = ap.sector;
      report.summary_v11_roe      = fd.returnOnEquity;
      report.summary_v11_eps      = ks.trailingEps;
      report.summary_v11_bvps     = ks.bookValue;
      report.summary_v11_pe       = sd.trailingPE || ks.trailingPE;
      report.summary_v11_pb       = ks.priceToBook;
      report.summary_v11_beta     = ks.beta;
      report.summary_v11_divRate  = sd.dividendRate;
      report.summary_v11_netMargin = fd.profitMargins;
      report.summary_v11_de       = fd.debtToEquity;
    } else {
      report.summary_v11_body = await r.text().then(t => t.slice(0, 300));
    }
  } catch(e) { report.summary_v11_error = e.message; }

  // Test 3: quoteSummary v10
  try {
    const r = await fetch(
      `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${sym}?modules=defaultKeyStatistics,financialData`,
      { headers: YF }
    );
    report.summary_v10_status = r.status;
    if (r.ok) {
      const j = await r.json();
      const result = j?.quoteSummary?.result?.[0];
      const fd = result?.financialData || {};
      const ks = result?.defaultKeyStatistics || {};
      report.summary_v10_ok   = !!result;
      report.summary_v10_roe  = fd.returnOnEquity?.raw ?? fd.returnOnEquity;
      report.summary_v10_eps  = ks.trailingEps?.raw ?? ks.trailingEps;
      report.summary_v10_bvps = ks.bookValue?.raw ?? ks.bookValue;
    } else {
      report.summary_v10_body = await r.text().then(t => t.slice(0, 300));
    }
  } catch(e) { report.summary_v10_error = e.message; }

  // Test 4: Yahoo Finance v7 quote (alternatif)
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${sym}&fields=regularMarketPrice,trailingPE,priceToBook,trailingEps,bookValue,returnOnEquity,beta`,
      { headers: YF }
    );
    report.quote_v7_status = r.status;
    if (r.ok) {
      const j = await r.json();
      const q = j?.quoteResponse?.result?.[0] || {};
      report.quote_v7_price = q.regularMarketPrice;
      report.quote_v7_pe    = q.trailingPE;
      report.quote_v7_pb    = q.priceToBook;
      report.quote_v7_eps   = q.trailingEps;
      report.quote_v7_bvps  = q.bookValue;
      report.quote_v7_roe   = q.returnOnEquity;
      report.quote_v7_beta  = q.beta;
    } else {
      report.quote_v7_body = await r.text().then(t => t.slice(0, 300));
    }
  } catch(e) { report.quote_v7_error = e.message; }

  return res.status(200).json({ ticker: sym, timestamp: new Date().toISOString(), ...report });
}
