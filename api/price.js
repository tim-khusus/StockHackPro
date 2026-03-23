// api/price.js — Fetch harga REAL dari Yahoo Finance API
// Dipanggil dari frontend, return data market aktual tanpa melibatkan Claude

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { ticker } = req.query;
  if (!ticker) return res.status(400).json({ error: 'Ticker diperlukan' });

  const symbol = ticker.toUpperCase().replace('.JK', '') + '.JK';

  try {
    // ── 1. Quote (harga real-time) ──────────────────────────────
    const quoteUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
    const quoteRes = await fetch(quoteUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
      }
    });

    if (!quoteRes.ok) {
      return res.status(404).json({ found: false, reason: `Saham ${ticker} tidak ditemukan di Yahoo Finance` });
    }

    const quoteData = await quoteRes.json();
    const result = quoteData?.chart?.result?.[0];
    if (!result) return res.status(404).json({ found: false, reason: 'Data tidak tersedia' });

    const meta = result.meta;

    // ── 2. Summary (fundamental + info) ────────────────────────
    const summaryUrl = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=summaryDetail,defaultKeyStatistics,financialData,assetProfile,incomeStatementHistory,balanceSheetHistory`;
    let summary = {};
    try {
      const summaryRes = await fetch(summaryUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
      });
      if (summaryRes.ok) {
        const summaryData = await summaryRes.json();
        summary = summaryData?.quoteSummary?.result?.[0] || {};
      }
    } catch(e) { /* summary optional */ }

    const sd  = summary.summaryDetail       || {};
    const ks  = summary.defaultKeyStatistics || {};
    const fd  = summary.financialData        || {};
    const ap  = summary.assetProfile         || {};
    const isl = summary.incomeStatementHistory?.incomeStatementHistory?.[0] || {};
    const bsl = summary.balanceSheetHistory?.balanceSheetHistory?.[0]       || {};

    // ── 3. Historical volume (10 sesi) ──────────────────────────
    const histUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1mo`;
    let sessions = [];
    try {
      const histRes = await fetch(histUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
      });
      if (histRes.ok) {
        const histData = await histRes.json();
        const hr = histData?.chart?.result?.[0];
        if (hr) {
          const ts        = hr.timestamp || [];
          const closes    = hr.indicators?.quote?.[0]?.close  || [];
          const volumes   = hr.indicators?.quote?.[0]?.volume || [];
          const opens     = hr.indicators?.quote?.[0]?.open   || [];

          // Ambil 10 sesi terakhir, urutkan terbaru dulu
          const allSessions = ts.map((t, i) => ({
            date: new Date(t * 1000).toLocaleDateString('id-ID', { day:'2-digit', month:'2-digit' }),
            vol:  Math.round(volumes[i] || 0),
            price: Math.round(closes[i] || 0),
            change_pct: i > 0 && closes[i-1]
              ? parseFloat(((closes[i] - closes[i-1]) / closes[i-1] * 100).toFixed(2))
              : 0,
          })).filter(s => s.price > 0 && s.vol > 0);

          const recent = allSessions.slice(-10).reverse();
          sessions = recent.map((s, i) => ({
            session:      i === 0 ? 'T' : `T-${i}`,
            date:         s.date,
            vol:          s.vol,
            price:        s.price,
            change_pct:   s.change_pct,
            is_estimated: false,
          }));
        }
      }
    } catch(e) { /* history optional */ }

    // ── Helper: safely get Yahoo raw value ──────────────────────
    const v = (obj, key) => obj?.[key]?.raw ?? obj?.[key] ?? null;

    // Hitung avg volume dari sessions
    const avgVol30 = sessions.length > 1
      ? Math.round(sessions.slice(1).reduce((s,x) => s + x.vol, 0) / (sessions.length - 1))
      : (v(sd, 'averageVolume') || null);

    // Shares outstanding untuk market cap string
    const shares = v(ks, 'sharesOutstanding') || v(ks, 'impliedSharesOutstanding');
    const price  = meta.regularMarketPrice || meta.previousClose;
    const mcap   = shares && price ? shares * price : null;
    const mcapStr = mcap
      ? mcap >= 1e15 ? `Rp ${(mcap/1e15).toFixed(1)} T`
        : mcap >= 1e12 ? `Rp ${(mcap/1e12).toFixed(1)} T`
        : `Rp ${(mcap/1e9).toFixed(0)} M`
      : null;

    // Cost of equity: CAPM = Rf 6.5% + beta * 5.5%
    const beta = v(ks, 'beta');
    const costOfEquity = beta ? parseFloat((6.5 + beta * 5.5).toFixed(2)) : 11.0;

    // EPS & Book Value
    const eps        = v(ks, 'trailingEps') || v(fd, 'revenuePerShare') || null;
    const bvps       = v(ks, 'bookValue') || null;
    const totalEquity = v(bsl, 'totalStockholderEquity') || null;
    const totalShares = shares || null;
    const bvpsCalc   = totalEquity && totalShares ? totalEquity / totalShares : bvps;

    // Dividend
    const dps        = v(sd, 'dividendRate') || null;
    const divYield   = v(sd, 'dividendYield') ? v(sd, 'dividendYield') * 100 : null;
    const divGrowth  = null; // Yahoo tidak provide ini secara langsung

    // Growth rates
    const epsGrowth  = v(ks, 'earningsQuarterlyGrowth')
      ? v(ks, 'earningsQuarterlyGrowth') * 100
      : v(fd, 'earningsGrowth') ? v(fd, 'earningsGrowth') * 100 : null;
    const revGrowth  = v(fd, 'revenueGrowth') ? v(fd, 'revenueGrowth') * 100 : null;

    return res.status(200).json({
      found: true,
      // ── Harga Market (REAL dari Yahoo Finance API) ──
      ticker:          symbol.replace('.JK',''),
      price:           Math.round(meta.regularMarketPrice || meta.previousClose),
      change:          Math.round(meta.regularMarketChange || 0),
      change_pct:      parseFloat((meta.regularMarketChangePercent || 0).toFixed(2)),
      open:            Math.round(meta.regularMarketOpen || 0),
      high:            Math.round(meta.regularMarketDayHigh || 0),
      low:             Math.round(meta.regularMarketDayLow || 0),
      volume:          meta.regularMarketVolume || 0,
      avg_volume:      v(sd, 'averageVolume') || avgVol30,
      prev_close:      Math.round(meta.previousClose || 0),
      week52_high:     Math.round(meta.fiftyTwoWeekHigh || v(sd,'fiftyTwoWeekHigh') || 0),
      week52_low:      Math.round(meta.fiftyTwoWeekLow  || v(sd,'fiftyTwoWeekLow')  || 0),
      market_cap_str:  mcapStr,
      company_name:    meta.longName || meta.shortName || symbol,
      sector:          ap.sector   || 'N/A',
      industry:        ap.industry || 'N/A',
      // ── Data Historis (REAL dari Yahoo Finance API) ──
      sessions,
      avg_vol_30d:     avgVol30,
      // ── Fundamental (dari Yahoo Finance) ──
      eps_ttm:         eps,
      eps_growth_rate: epsGrowth,
      book_value_per_share: bvpsCalc || bvps,
      dps,
      dividend_yield:  divYield,
      dividend_growth_rate: divGrowth,
      roe:             v(fd,'returnOnEquity')  ? v(fd,'returnOnEquity')  * 100 : null,
      roa:             v(fd,'returnOnAssets')  ? v(fd,'returnOnAssets')  * 100 : null,
      net_margin:      v(fd,'profitMargins')   ? v(fd,'profitMargins')   * 100 : null,
      revenue_growth:  revGrowth,
      debt_to_equity:  v(fd,'debtToEquity'),
      current_ratio:   v(fd,'currentRatio'),
      pe_ratio:        v(sd,'trailingPE') || v(ks,'trailingPE') || null,
      pb_ratio:        v(ks,'priceToBook') || null,
      ps_ratio:        v(ks,'priceToSalesTrailing12Months') || null,
      beta,
      cost_of_equity:  costOfEquity,
    });

  } catch (err) {
    console.error('Price fetch error:', err);
    return res.status(500).json({ found: false, reason: 'Gagal fetch data: ' + err.message });
  }
}
