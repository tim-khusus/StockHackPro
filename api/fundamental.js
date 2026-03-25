// api/fundamental.js — Ambil data fundamental dari Financial Modeling Prep (FMP)
// Endpoint: /v3/profile + /v3/key-metrics-ttm + /v3/ratios-ttm
// Semua data dalam satuan PER SAHAM (bukan miliar/triliun)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── Validasi input ──────────────────────────────────────────
  const { ticker } = req.query;
  if (!ticker || typeof ticker !== 'string' || ticker.trim() === '') {
    return res.status(400).json({ error: 'Ticker diperlukan' });
  }

  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'FMP_API_KEY tidak dikonfigurasi di Vercel' });
  }

  const sym = ticker.toUpperCase().replace(/\.JK$/i, '') + '.JK';
  const base = 'https://financialmodelingprep.com/api/v3';

  try {
    // ── Fetch 3 endpoint paralel ────────────────────────────────
    const [profileRes, metricsRes, ratiosRes] = await Promise.all([
      fetch(`${base}/profile/${sym}?apikey=${apiKey}`),
      fetch(`${base}/key-metrics-ttm/${sym}?apikey=${apiKey}`),
      fetch(`${base}/ratios-ttm/${sym}?apikey=${apiKey}`),
    ]);

    // Parse semua response (tidak throw jika satu gagal)
    const profileData = profileRes.ok  ? await profileRes.json()  : [];
    const metricsData = metricsRes.ok  ? await metricsRes.json()  : [];
    const ratiosData  = ratiosRes.ok   ? await ratiosRes.json()   : [];

    // Ambil object pertama dari array, fallback ke {}
    const profile = Array.isArray(profileData) && profileData.length > 0 ? profileData[0] : {};
    const metrics = Array.isArray(metricsData) && metricsData.length > 0 ? metricsData[0] : {};
    const ratios  = Array.isArray(ratiosData)  && ratiosData.length  > 0 ? ratiosData[0]  : {};

    // ── Helper: parse angka, null jika tidak valid ──────────────
    const n = (v) => {
      const x = parseFloat(v);
      return isNaN(x) || !isFinite(x) ? null : x;
    };

    // ── EPS: FMP pakai earningsPerShareTTM di key-metrics ──────
    // Untuk saham IDX, nilainya sudah dalam Rupiah per saham
    const eps_ttm = n(metrics.earningsPerShareTTM ?? ratios.netProfitMarginTTM);

    // ── Book Value per share ────────────────────────────────────
    const book_value = n(metrics.bookValuePerShareTTM);

    // ── ROE: FMP kirim sebagai desimal (0.17 = 17%) → kali 100 ─
    const roe_raw = n(metrics.roeTTM ?? ratios.returnOnEquityTTM);
    const roe_ttm = roe_raw !== null
      ? parseFloat((roe_raw * 100).toFixed(2))
      : null;

    // ── ROA: sama, desimal → persen ─────────────────────────────
    const roa_raw = n(metrics.returnOnAssetsTTM ?? ratios.returnOnAssetsTTM);
    const roa_ttm = roa_raw !== null
      ? parseFloat((roa_raw * 100).toFixed(2))
      : null;

    // ── Net Margin: desimal → persen ───────────────────────────
    const nm_raw = n(ratios.netProfitMarginTTM ?? metrics.netIncomePerShareTTM);
    const net_margin = nm_raw !== null && nm_raw > -1 && nm_raw < 1
      ? parseFloat((nm_raw * 100).toFixed(2))
      : n(ratios.netProfitMarginTTM); // sudah persen jika > 1

    // ── Debt to Equity ──────────────────────────────────────────
    const debt_to_equity = n(metrics.debtToEquityTTM ?? ratios.debtEquityRatioTTM);

    // ── Current Ratio ───────────────────────────────────────────
    const current_ratio = n(ratios.currentRatioTTM ?? metrics.currentRatioTTM);

    // ── Beta ────────────────────────────────────────────────────
    const beta = n(profile.beta);

    // ── DPS: FMP pakai dividendPerShareTTM ─────────────────────
    const dps = n(metrics.dividendPerShareTTM);

    // ── Dividend Yield: FMP kirim sebagai desimal → persen ─────
    const dy_raw = n(metrics.dividendYieldTTM ?? ratios.dividendYieldTTM);
    const dividend_yield = dy_raw !== null
      ? parseFloat((dy_raw * 100).toFixed(2))
      : null;

    // ── PER dan PBV: jangan percaya nilai FMP langsung ──────────
    // Frontend akan hitung ulang dari harga real Yahoo Finance
    // Tapi kita tetap kirim sebagai referensi
    const pe_ratio_ttm = n(ratios.priceEarningsRatioTTM ?? metrics.peRatioTTM);
    const pb_ratio_ttm = n(ratios.priceToBookRatioTTM   ?? metrics.pbRatioTTM);

    // ── EPS growth (YoY dari income statement jika ada) ────────
    const eps_growth_rate = n(metrics.epsGrowthTTM ?? null);

    // ── Company info dari profile ───────────────────────────────
    const company_name = profile.companyName || null;
    const sector       = profile.sector      || null;
    const industry     = profile.industry    || null;

    // ── Cek apakah data meaningful (bukan semua null) ──────────
    const hasData = eps_ttm !== null || book_value !== null || roe_ttm !== null;
    if (!hasData) {
      return res.status(200).json({
        found: false,
        reason: `Data FMP untuk ${sym} tidak tersedia atau ticker tidak dikenal`,
        ticker: sym,
      });
    }

    return res.status(200).json({
      found:           true,
      ticker:          sym,
      company_name,
      sector,
      industry,

      // Fundamental per saham
      eps_ttm,
      eps_growth_rate,
      book_value,
      roe_ttm,
      roa_ttm,
      net_margin,
      debt_to_equity,
      current_ratio,
      beta,
      dps,
      dividend_yield,

      // Rasio (referensi — frontend hitung ulang dari harga real)
      pe_ratio_ttm,
      pb_ratio_ttm,
    });

  } catch (err) {
    console.error('[fundamental.js]', err.message);
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}
