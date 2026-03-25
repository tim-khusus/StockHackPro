// api/fundamental.js — Ambil data fundamental dari Financial Modeling Prep (FMP)
// Versi dengan debug output + support endpoint v3 dan stable

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { ticker } = req.query;
  if (!ticker || ticker.trim() === '') {
    return res.status(400).json({ error: 'Ticker diperlukan' });
  }

  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'FMP_API_KEY tidak dikonfigurasi di Vercel' });
  }

  const sym = ticker.toUpperCase().replace(/\.JK$/i, '') + '.JK';

  // Helper: fetch dan parse JSON, kembalikan null jika gagal
  const safeFetch = async (url) => {
    try {
      const r = await fetch(url);
      if (!r.ok) return { _status: r.status, _error: `HTTP ${r.status}` };
      return await r.json();
    } catch (e) {
      return { _error: e.message };
    }
  };

  // Helper parse number
  const n = (v) => { const x = parseFloat(v); return isNaN(x) || !isFinite(x) ? null : x; };

  // ── Coba endpoint v3 dulu, fallback ke /stable/ ────────────
  const v3Base     = 'https://financialmodelingprep.com/api/v3';
  const stableBase = 'https://financialmodelingprep.com/stable';

  const [profileData, metricsData, ratiosData] = await Promise.all([
    safeFetch(`${v3Base}/profile/${sym}?apikey=${apiKey}`),
    safeFetch(`${v3Base}/key-metrics-ttm/${sym}?apikey=${apiKey}`),
    safeFetch(`${v3Base}/ratios-ttm/${sym}?apikey=${apiKey}`),
  ]);

  // Log ke Vercel Functions logs untuk debugging
  console.log(`[fundamental.js] ${sym}`);
  console.log('profile:', JSON.stringify(profileData).slice(0, 200));
  console.log('metrics:', JSON.stringify(metricsData).slice(0, 200));
  console.log('ratios:',  JSON.stringify(ratiosData).slice(0, 200));

  const profile = Array.isArray(profileData) && profileData.length > 0 ? profileData[0] : {};
  const metrics = Array.isArray(metricsData) && metricsData.length > 0 ? metricsData[0] : {};
  const ratios  = Array.isArray(ratiosData)  && ratiosData.length  > 0 ? ratiosData[0]  : {};

  // ── Parse semua field ───────────────────────────────────────
  const eps_ttm              = n(metrics.earningsPerShareTTM ?? metrics.netIncomePerShareTTM);
  const book_value           = n(metrics.bookValuePerShareTTM);
  const roe_raw              = n(metrics.roeTTM ?? ratios.returnOnEquityTTM);
  const roe_ttm              = roe_raw !== null ? parseFloat((roe_raw > 1 ? roe_raw : roe_raw * 100).toFixed(2)) : null;
  const roa_raw              = n(metrics.returnOnAssetsTTM ?? ratios.returnOnAssetsTTM);
  const roa_ttm              = roa_raw !== null ? parseFloat((roa_raw > 1 ? roa_raw : roa_raw * 100).toFixed(2)) : null;
  const nm_raw               = n(ratios.netProfitMarginTTM);
  const net_margin           = nm_raw !== null ? parseFloat((nm_raw > 1 ? nm_raw : nm_raw * 100).toFixed(2)) : null;
  const debt_to_equity       = n(metrics.debtToEquityTTM ?? ratios.debtEquityRatioTTM);
  const current_ratio        = n(ratios.currentRatioTTM  ?? metrics.currentRatioTTM);
  const beta                 = n(profile.beta);
  const dps                  = n(metrics.dividendPerShareTTM);
  const dy_raw               = n(metrics.dividendYieldTTM ?? metrics.dividendYieldPercentageTTM);
  const dividend_yield       = dy_raw !== null ? parseFloat((dy_raw > 1 ? dy_raw : dy_raw * 100).toFixed(2)) : null;
  const pe_ratio_ttm         = n(ratios.priceEarningsRatioTTM ?? metrics.peRatioTTM);
  const pb_ratio_ttm         = n(ratios.priceToBookRatioTTM   ?? metrics.pbRatioTTM);
  const eps_growth_rate      = n(metrics.epsGrowthTTM ?? null);

  // ── Cek apakah ada data sama sekali ────────────────────────
  const hasData = eps_ttm !== null || book_value !== null || roe_ttm !== null;

  if (!hasData) {
    // Kembalikan _debug supaya bisa dilihat di DevTools console
    return res.status(200).json({
      found: false,
      ticker: sym,
      reason: `Data FMP untuk ${sym} tidak tersedia. Kemungkinan: (1) saham IDX tidak di-cover plan gratis FMP, atau (2) ticker tidak dikenal FMP.`,
      _debug: {
        profile_raw:  Array.isArray(profileData) ? (profileData[0] ?? 'array kosong') : profileData,
        metrics_raw:  Array.isArray(metricsData) ? (metricsData[0] ?? 'array kosong') : metricsData,
        ratios_raw:   Array.isArray(ratiosData)  ? (ratiosData[0]  ?? 'array kosong') : ratiosData,
      }
    });
  }

  return res.status(200).json({
    found:          true,
    ticker:         sym,
    company_name:   profile.companyName   || null,
    sector:         profile.sector        || null,
    industry:       profile.industry      || null,
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
    pe_ratio_ttm,
    pb_ratio_ttm,
  });
}
