export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { ticker } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(200).json({ summary: "Error: API Key belum dipasang di Vercel!" });
  }

  try {
    // Pakai endpoint v1 (Stable) agar tidak rewel
    const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Analisis saham IDX: ${ticker}. Berikan hasil dalam format JSON murni: 
            {"price": 1000, "change": 1.5, "signal": "BUY", "fair_value": 1100, "vol_ratio": 1.2, "summary": "Analisis singkat", "support": 900, "resistance": 1200, "phase": "Markup"}. 
            Hanya balas dengan JSON saja tanpa kata-kata lain dan tanpa tanda kutip tiga (backticks).`
          }]
        }]
      })
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message);
    }

    if (!data.candidates || !data.candidates[0].content) {
      throw new Error("Respon AI kosong.");
    }

    let rawText = data.candidates[0].content.parts[0].text;
    
    // TRICK: Cari karakter { pertama dan } terakhir untuk ambil JSON-nya saja
    const jsonStart = rawText.indexOf('{');
    const jsonEnd = rawText.lastIndexOf('}') + 1;
    
    if (jsonStart === -1) throw new Error("Format JSON tidak ditemukan dalam respon AI");
    
    const cleanJson = rawText.substring(jsonStart, jsonEnd);
    
    // Kirim hasil ke browser
    res.status(200).json(JSON.parse(cleanJson));

  } catch (error) {
    console.error("LOG_ERROR:", error.message);
    res.status(200).json({
      price: 0, change: 0, signal: "ERR", fair_value: 0, vol_ratio: 0,
      summary: `Sistem: ${error.message}. Coba lagi dalam 1 menit.`,
      support: 0, resistance: 0, phase: "N/A"
    });
  }
}
