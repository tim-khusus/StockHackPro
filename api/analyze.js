export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { ticker } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) return res.status(500).json({ error: 'API Key Belum Terpasang di Vercel' });

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Analisis mendalam saham IDX: ${ticker}. Berikan hasil HANYA dalam format JSON murni tanpa kata-kata lain dan tanpa markdown: 
            {"price": 1000, "change": 2.5, "signal": "BUY", "fair_value": 1200, "vol_ratio": 1.5, "summary": "Tulis analisis singkat di sini", "support": 950, "resistance": 1100, "phase": "Accumulation"}`
          }]
        }]
      })
    });

    const data = await response.json();
    
    if (!data.candidates || !data.candidates[0].content) {
      throw new Error("Respon AI Kosong");
    }

    const rawText = data.candidates[0].content.parts[0].text;
    
    // Pembersihan teks agar JSON tidak rusak oleh 'curhatan' AI
    const jsonStart = rawText.indexOf('{');
    const jsonEnd = rawText.lastIndexOf('}') + 1;
    const cleanJson = rawText.substring(jsonStart, jsonEnd);
    
    res.status(200).json(JSON.parse(cleanJson));

  } catch (error) {
    console.error(error);
    // Kirim data dummy jika gagal agar UI tidak crash
    res.status(200).json({
      price: 0, change: 0, signal: "ERROR", fair_value: 0, vol_ratio: 0, 
      summary: "Gagal memproses data. Coba lagi nanti.", support: 0, resistance: 0, phase: "N/A"
    });
  }
}
