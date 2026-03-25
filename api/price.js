export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { ticker } = req.query;
  if (!ticker) return res.status(400).json({ error: 'Ticker diperlukan' });

  const sym = `${ticker.toUpperCase()}.JK`;
  const H = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };

  try {
    // ── 1. MENGAMBIL DATA GRAFIK HISTORIS (Untuk Harga & Indikator Teknikal) ──
    // Mengambil 3 bulan ke belakang untuk menghitung MA50 dan RSI
    const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=3mo&interval=1d&events=div,splits`;
    const chartRes = await fetch(chartUrl, { headers: H });
    if (!chartRes.ok) throw new Error(`Yahoo Chart HTTP ${chartRes.status}`);
    const chartData = await chartRes.json();
    
    const result = chartData.chart?.result?.[0];
    if (!result) return res.status(200).json({ found: false });

    const meta = result.meta;
    const quotes = result.indicators?.quote?.[0] || {};
    const timestamps = result.timestamp || [];
    
    const closes = quotes.close || [];
    const highs = quotes.high || [];
    const lows = quotes.low || [];
    const volumes = quotes.volume || [];

    // Membersihkan data kosong (null) yang bisa merusak perhitungan matematika
    const cleanCloses = closes.filter(x => x !== null && x > 0);
    const cleanHighs = highs.filter(x => x !== null && x > 0);
    const cleanLows = lows.filter(x => x !== null && x > 0);

    // ── 2. KALKULATOR INDIKATOR TEKNIKAL MATEMATIS ──
    // A. Fungsi RSI (Relative Strength Index) 14-Hari
    function calcRSI(arr, period = 14) {
      if (arr.length <= period) return null;
      let gains = 0, losses = 0;
      for (let i = 1; i <= period; i++) {
        let diff = arr[i] - arr[i - 1];
        if (diff > 0) gains += diff; else losses -= diff;
      }
      let avgGain = gains / period;
      let avgLoss = losses / period;
      for (let i = period + 1; i < arr.length; i++) {
        let diff = arr[i] - arr[i - 1];
        let gain = diff > 0 ? diff : 0;
        let loss = diff < 0 ? -diff : 0;
        avgGain = (avgGain * 13 + gain) / 14;
        avgLoss = (avgLoss * 13 + loss) / 14;
      }
      if (avgLoss === 0) return 100;
      let rs = avgGain / avgLoss;
      return 100 - (100 / (1 + rs));
    }

    // B. Fungsi Moving Average (MA)
    function calcMA(arr, period) {
      if (arr.length < period) return null;
      let sum = 0;
      for (let i = arr.length - period; i < arr.length; i++) sum += arr[i];
      return sum / period;
    }

    // Menghitung Angka Real Teknikal
    const rsi14 = calcRSI(cleanCloses, 14);
    const ma20 = calcMA(cleanCloses, 20);
    const ma50 = calcMA(cleanCloses, 50);
    
    // Support & Resistance (Nilai Terendah/Tertinggi dalam 30 Hari Terakhir)
    let supp30 = null, res30 = null;
    if (cleanLows.length >= 30) supp30 = Math.min(...cleanLows.slice(-30));
    if (cleanHighs.length >= 30) res30 = Math.max(...cleanHighs.slice(-30));

    let currentPrice = meta.regularMarketPrice || cleanCloses[cleanCloses.length - 1];
    
    // Penentu Tren Berdasarkan Moving Average
    let trend = "Sideways";
    if (ma20 && ma50) {
      if (currentPrice > ma20 && ma20 > ma50) trend = "Bullish Kuat";
      else if (currentPrice > ma20) trend = "Bullish";
      else if (currentPrice < ma20 && ma20 < ma50) trend = "Bearish Kuat";
      else if (currentPrice < ma20) trend = "Bearish";
    }

    // Penentu Momentum Berdasarkan RSI
    let momentum = "Netral";
    if (rsi14 > 70) momentum = "Overbought (Jenuh Beli)";
    else if (rsi14 < 30) momentum = "Oversold (Jenuh Jual)";
    else if (rsi14 >= 50) momentum = "Positif (Bullish Bias)";
    else momentum = "Negatif (Bearish Bias)";

    // Mengambil riwayat 10 sesi terakhir untuk Volume dan Tren Jangka Pendek
    const sessions = [];
    let volSum30 = 0, days30 = 0;
    
    for (let i = timestamps.length - 1; i >= 0; i--) {
      if (timestamps.length - i <= 30 && volumes[i] !== null) {
        volSum30 += volumes[i];
        days30++;
      }
      if (sessions.length < 10 && closes[i] !== null && timestamps[i]) {
        const prevC = i > 0 ? closes[i-1] : closes[i];
        const chgPct = prevC ? ((closes[i] - prevC) / prevC) * 100 : 0;
        const dObj = new Date(timestamps[i] * 1000);
        sessions.push({
          date: dObj.toLocaleDateString('id-ID', {day:'2-digit', month:'2-digit'}),
          session: sessions.length === 0 ? 'T' : `T-${sessions.length}`,
          price: closes[i],
          change_pct: parseFloat(chgPct.toFixed(2)),
          vol: volumes[i] || 0
        });
      }
    }
    const avgVol30 = days30 > 0 ? Math.floor(volSum30 / days30) : 0;

    // ── 3. MENGAMBIL DATA FUNDAMENTAL (quoteSummary) ──
    let fundamental = {};
    try {
      const fundUrl = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${sym}?modules=defaultKeyStatistics,financialData,summaryDetail`;
      const fundRes = await fetch(fundUrl, { headers: H });
      if (fundRes.ok) {
        const fundData = await fundRes.json();
        const qs = fundData.quoteSummary?.result?.[0];
        if (qs) {
          const stats = qs.defaultKeyStatistics || {};
          const fin = qs.financialData || {};
          const summ = qs.summaryDetail || {};
          
          const getVal = (obj) => obj?.raw ?? null;
          const pct = (obj) => { 
            const v = getVal(obj); 
            return v !== null ? parseFloat((Math.abs(v) > 1 ? v : v * 100).toFixed(2)) : null; 
          };

          fundamental = {
            eps_ttm: getVal(stats.trailingEps) || getVal(stats.forwardEps),
            pe_ratio_ttm: getVal(summ.trailingPE) || getVal(summ.forwardPE),
            pb_ratio_ttm: getVal(stats.priceToBook),
            book_value: getVal(stats.bookValue),
            roe_ttm: pct(fin.returnOnEquity),
            roa_ttm: pct(fin.returnOnAssets),
            net_margin: pct(fin.profitMargins),
            debt_to_equity: getVal(fin.debtToEquity) !== null ? parseFloat((getVal(fin.debtToEquity) / 100).toFixed(2)) : null,
            current_ratio: getVal(fin.currentRatio) !== null ? parseFloat(getVal(fin.currentRatio).toFixed(2)) : null,
            beta: getVal(stats.beta),
            eps_growth_rate: pct(stats.earningsQuarterlyGrowth ?? fin.earningsGrowth)
          };
        }
      }
    } catch (fErr) {
      console.warn("Fundamental fetch alert:", fErr.message);
    }

    // ── 4. KIRIM SEMUA DATA KE FRONTEND ──
    return res.status(200).json({
      found: true,
      ticker: sym.replace('.JK', ''),
      price: currentPrice,
      change: meta.regularMarketPrice - meta.chartPreviousClose,
      change_pct: parseFloat((((meta.regularMarketPrice - meta.chartPreviousClose) / meta.chartPreviousClose) * 100).toFixed(2)),
      last_updated: meta.regularMarketTime,
      open: meta.regularMarketOpen,
      high: meta.regularMarketDayHigh,
      low: meta.regularMarketDayLow,
      volume: meta.regularMarketVolume,
      avg_volume: avgVol30,
      prev_close: meta.chartPreviousClose,
      week52_high: meta.fiftyTwoWeekHigh || (cleanHighs.length ? Math.max(...cleanHighs) : null),
      week52_low: meta.fiftyTwoWeekLow || (cleanLows.length ? Math.min(...cleanLows) : null),
      company_name: meta.longName || meta.shortName || sym,
      sessions,
      avg_vol_30d: avgVol30,
      
      // Data Teknikal Asli (Matematis)
      rsi_14: rsi14 ? Math.round(rsi14) : null,
      ma_20: ma20 ? Math.round(ma20) : null,
      ma_50: ma50 ? Math.round(ma50) : null,
      support_30d: supp30 ? Math.round(supp30) : null,
      resist_30d: res30 ? Math.round(res30) : null,
      trend_ma: trend,
      momentum_rsi: momentum,

      // Data Fundamental
      ...fundamental
    });

  } catch (err) {
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}
