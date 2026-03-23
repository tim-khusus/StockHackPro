// api/price.js — Yahoo Finance chart v8 (satu-satunya endpoint yang tidak diblokir Vercel)
// Mengambil: harga real-time, OHLCV historis, dividen dari events

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { ticker } = req.query;
  if (!ticker) return res.status(400).json({ error: 'Ticker diperlukan' });

  const sym = ticker.toUpperCase().replace(/\.JK$/i, '') + '.JK';

  try {
    // ── 1. Chart 3 bulan dengan events dividen ──────────────────
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}`
      + `?interval=1d&range=3mo&includePrePost=false&events=dividends%2Csplits`;

    const r = await fetch(url, { headers: H });
    if (!r.ok) {
      return res.status(404).json({ found: false, reason: `${sym} tidak ditemukan (HTTP ${r.status})` });
    }

    const j = await r.json();
    const cr = j?.chart?.result?.[0];
    if (!cr) return res.status(404).json({ found: false, reason: 'Data chart kosong' });

    const meta    = cr.meta || {};
    const ts      = cr.timestamp || [];
    const qd      = cr.indicators?.quote?.[0] || {};
    const closes  = qd.close  || [];
    const volumes = qd.volume || [];
    const opens   = qd.open   || [];
    const highs   = qd.high   || [];
    const lows    = qd.low    || [];

    // ── 2. Bangun data sesi historis ────────────────────────────
    // Yahoo kadang duplikasi hari terakhir (data intraday), deduplikasi berdasar tanggal
    const seenDates = new Set();
    const allSess = [];

    for (let i = 0; i < ts.length; i++) {
      const dateStr = new Date(ts[i] * 1000).toLocaleDateString('id-ID', { day:'2-digit', month:'2-digit' });
      if (seenDates.has(dateStr)) continue; // skip duplikat tanggal
      if (!closes[i] || !volumes[i]) continue;

      const prevClose = i > 0 ? closes[i-1] : null;
      seenDates.add(dateStr);
      allSess.push({
        date:  dateStr,
        vol:   Math.round(volumes[i]),
        price: Math.round(closes[i]),
        change_pct: prevClose && prevClose > 0
          ? parseFloat(((closes[i] - prevClose) / prevClose * 100).toFixed(2))
          : 0,
      });
    }

    // 10 sesi terbaru (terbaru di index 0)
    const recent10 = allSess.slice(-10).reverse();
    const sessions = recent10.map((s, i) => ({
      session:      i === 0 ? 'T' : `T-${i}`,
      date:         s.date,
      vol:          s.vol,
      price:        s.price,
      change_pct:   s.change_pct,
      is_estimated: false,
    }));

    // Avg volume 30 hari terakhir dari historis real
    const last30 = allSess.slice(-30);
    const avgVol30 = last30.length > 0
      ? Math.round(last30.reduce((s,x) => s + x.vol, 0) / last30.length)
      : null;

    // ── 3. Dividen dari events (REAL) ───────────────────────────
    // Format: { "1742522400": { amount: 250, date: 1742522400 }, ... }
    const divEvents = cr.events?.dividends || {};
    const now = Date.now() / 1000;
    const oneYearAgo = now - 365 * 24 * 3600;

    // Ambil dividen 1 tahun terakhir
    const recentDivs = Object.values(divEvents)
      .filter(d => d.date >= oneYearAgo && d.amount > 0)
      .map(d => d.amount);

    const dpsFromChart = recentDivs.length > 0
      ? parseFloat(recentDivs.reduce((a,b) => a+b, 0).toFixed(0))
      : null;

    // ── 4. Harga live dari meta ─────────────────────────────────
    const price     = meta.regularMarketPrice || meta.previousClose || 0;
    const prevClose = meta.previousClose || (closes.length > 1 ? closes[closes.length-2] : 0) || 0;
    const change    = meta.regularMarketChange || (price - prevClose) || 0;
    const changePct = meta.regularMarketChangePercent
      || (prevClose > 0 ? parseFloat(((price - prevClose) / prevClose * 100).toFixed(2)) : 0);

    // Gunakan last candle untuk OHLV jika meta tidak punya
    const lastI = closes.length - 1;

    return res.status(200).json({
      found: true,

      // ── Harga REAL ──────────────────────────────────────────────
      ticker:         sym.replace('.JK',''),
      price:          Math.round(price),
      change:         Math.round(change),
      change_pct:     parseFloat(changePct.toFixed ? changePct.toFixed(2) : changePct),
      open:           Math.round(meta.regularMarketOpen    || (opens[lastI]  ?? 0)),
      high:           Math.round(meta.regularMarketDayHigh || (highs[lastI]  ?? 0)),
      low:            Math.round(meta.regularMarketDayLow  || (lows[lastI]   ?? 0)),
      volume:         meta.regularMarketVolume || (volumes[lastI] ?? 0),
      avg_volume:     avgVol30,
      prev_close:     Math.round(prevClose),
      week52_high:    Math.round(meta.fiftyTwoWeekHigh || 0),
      week52_low:     Math.round(meta.fiftyTwoWeekLow  || 0),
      market_cap_str: null,
      company_name:   meta.longName || meta.shortName || sym,
      sector:         'N/A',
      industry:       'N/A',

      // ── Historis REAL (deduplikasi) ─────────────────────────────
      sessions,
      avg_vol_30d: avgVol30,

      // ── Dividen REAL dari chart events ──────────────────────────
      dps_from_chart:   dpsFromChart,
      dividend_events:  recentDivs,
    });

  } catch (err) {
    console.error('[price.js]', err.message);
    return res.status(500).json({ found: false, reason: 'Server error: ' + err.message });
  }
}
