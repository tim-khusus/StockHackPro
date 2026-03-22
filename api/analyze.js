export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Gunakan POST' });
  const { ticker } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Analisis saham IDX: ${ticker}. Balas HANYA dengan JSON murni: {"price":1000, "change":0, "signal":"HOLD", "fair_value":0, "vol_ratio":0, "summary":"-", "support":0, "resistance":0, "phase":"-"}` }]}]
      })
    });

    const data = await response.json();
    let text = data.candidates[0].content.parts[0].text;
    
    // Mencari bagian JSON di dalam teks (antisipasi jika AI curhat)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const result = JSON.parse(jsonMatch[0]);
    
    res.status(200).json(result);
  } catch (err) {
    // Jika error, kirim data default agar frontend tidak crash
    res.status(200).json({
      price: 0, change: 0, signal: "ERR", fair_value: 0, vol_ratio: 0, summary: "Gagal memuat data. Coba ticker lain.", support: 0, resistance: 0, phase: "N/A"
    });
  }
}
