export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { ticker } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(200).json({ summary: "Konfigurasi: API Key belum dipasang di Vercel!" });
  }

  try {
    // UPDATE 2026: Menggunakan gemini-3-flash (Model Terbaru & Didukung)
    const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-3-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Berikan analisis teknikal saham IDX: ${ticker}. 
            Wajib balas HANYA dengan JSON murni: 
            {"price": 1000, "change": 1.5, "signal": "BUY", "fair_value": 1100, "vol_ratio": 1.2, "summary": "Analisis singkat", "support": 900, "resistance": 1200, "phase": "Markup"}. 
            Tanpa teks tambahan, tanpa markdown.`
          }]
        }],
        generationConfig: {
          response_mime_type: "application/json"
        }
      })
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(`Google API: ${data.error.message}`);
    }

    if (!data.candidates || !data.candidates[0].content) {
      throw new Error("Respon AI kosong atau diblokir filter keamanan.");
    }

    const rawText = data.candidates[0].content.parts[0].text;
    
    // Pembersihan teks (antisipasi jika ada karakter aneh)
    const jsonStart = rawText.indexOf('{');
    const jsonEnd = rawText.lastIndexOf('}') + 1;
    const cleanJson = rawText.substring(jsonStart, jsonEnd);
    
    res.status(200).json(JSON.parse(cleanJson));

  } catch (error) {
    console.error("DEBUG_ERROR:", error.message);
    res.status(200).json({
      price: 0, change: 0, signal: "ERR", fair_value: 0, vol_ratio: 0,
      summary: `Pesan Sistem: ${error.message}`,
      support: 0, resistance: 0, phase: "N/A"
    });
  }
}
