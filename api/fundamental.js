export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { ticker } = req.query;
  if (!ticker) return res.status(400).json({ error: 'Ticker dibutuhkan' });

  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API Key FMP belum dikonfigurasi' });

  // Format untuk bursa Indonesia. 
  // Misalnya CTRA menjadi CTRA.JK agar dikenali oleh FMP.
  const sym = `${ticker.toUpperCase()}.JK`;

  try {
    // 1. Ambil Profil Perusahaan
    const profileRes = await fetch(`https://financialmodelingprep.com/api/v3/profile/${sym}?apikey=${apiKey}`);
    const profileData = await profileRes.json();
    
    // 2. Ambil Key Metrics TTM (Rasio paling update)
    const metricsRes = await fetch(`https://financialmodelingprep.com/api/v3/key-metrics-ttm/${sym}?apikey=${apiKey}`);
    const metricsData = await metricsRes.json();

    if (!profileData || profileData.length === 0) {
      return res.status(404).json({ error: 'Data fundamental tidak ditemukan' });
    }

    const profile = profileData[0];
    const metrics = metricsData && metricsData.length > 0 ? metricsData[0] : {};

    return res.status(200).json({
      ticker: ticker.toUpperCase(),
      company_name: profile.companyName,
      sector: profile.sector,
      industry: profile.industry,
      market_cap: profile.mktCap,
      eps_ttm: metrics.netIncomePerShareTTM || null,
      pe_ratio_ttm: metrics.peRatioTTM || null,
      pb_ratio_ttm: metrics.pbRatioTTM || null,
      roe_ttm: metrics.roeTTM ? (metrics.roeTTM * 100).toFixed(2) : null,
      dividend_yield_ttm: metrics.dividendYieldPercentageTTM ? metrics.dividendYieldPercentageTTM.toFixed(2) : null
    });

  } catch (err) {
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}
