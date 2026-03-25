export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { ticker } = req.query;
  const apiKey = process.env.FMP_API_KEY;
  const sym = `${ticker.toUpperCase()}.JK`;

  try {
    const profileRes = await fetch(`https://financialmodelingprep.com/api/v3/profile/${sym}?apikey=${apiKey}`);
    const profileData = await profileRes.json();
    
    const metricsRes = await fetch(`https://financialmodelingprep.com/api/v3/key-metrics-ttm/${sym}?apikey=${apiKey}`);
    const metricsData = await metricsRes.json();

    // 👇 TAMENG ANTI-CRASH: Cek apakah data benar-benar ada dan berupa Array
    const profile = (Array.isArray(profileData) && profileData.length > 0) ? profileData[0] : {};
    const metrics = (Array.isArray(metricsData) && metricsData.length > 0) ? metricsData[0] : {};

    return res.status(200).json({
      company_name: profile.companyName || null,
      eps_ttm: metrics.netIncomePerShareTTM || null,
      pe_ratio_ttm: metrics.peRatioTTM || null,
      pb_ratio_ttm: metrics.pbRatioTTM || null,
      roe_ttm: metrics.roeTTM ? (metrics.roeTTM * 100).toFixed(2) : null,
      dividend_yield: metrics.dividendYieldPercentageTTM ? metrics.dividendYieldPercentageTTM.toFixed(2) : null,
      book_value: metrics.bookValuePerShareTTM || null
    });

  } catch (err) {
    // Jika ada error jaringan/API key salah, jangan crash, kembalikan JSON error yang rapi
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}
