export default async function handler(req, res) {
  // Hanya izinkan metode POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { ticker } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  // Proteksi jika API Key belum dipasang di Vercel
  if (!apiKey) {
    return res.status(200).json({
      price: 0, change: 0, signal: "CONFIG_ERR", fair_value: 0, vol_ratio: 0,
      summary: "API Key Belum Terpasang di Vercel Settings!", 
      support: 0, resistance: 0, phase: "N/A"
    });
  }

  try {
    // Memanggil Gemini 3 Flash (Versi Terbaru 2026)
    const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-3-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Analisis teknikal saham IDX: ${ticker}. Berikan data terbaru. 
            Balas HANYA dengan format JSON murni seperti ini: 
            {"price": 1000, "change": 2.5, "signal": "BUY", "fair_value": 1200, "vol_ratio": 1.5, "summary": "Tulis analisis singkat", "support": 950, "resistance": 1100, "phase": "Markup"}`
          }]
        }],
        generationConfig: {
          response_mime_type: "application/json"
        }
      })
    });

    const data = await response.json();

    // Cek jika ada error dari Google
    if (data.error) {
      throw new Error(`Google API: ${data.error.message}`);
    }

    // Ambil teks hasil generate
    if (!data.candidates || !data.candidates[0].content) {
      throw new Error("Respon AI Kosong/Diblokir Safety Filter");
    }

    let rawText = data.candidates[0].content.parts[0].text;
    
    // Pembersihan teks (menghilangkan markdown ```json jika ada)
    const jsonStart = rawText.indexOf('{');
    const jsonEnd = rawText.lastIndexOf('}') + 1;
    const cleanJson = rawText.substring(jsonStart, jsonEnd);
    
    const finalData = JSON.parse(cleanJson);
    
    // Kirim hasil ke Frontend
    res.status(200).json(finalData);

  } catch (error) {
    console.error("ANALYSIS_ERROR:", error.message);
    
    // Kirim data dummy agar UI tidak pecah saat error
    res.status(200).json({
      price: 0, 
      change: 0, 
      signal: "ERROR", 
      fair_value: 0, 
      vol_ratio: 0, 
      summary: `Gagal memproses ${ticker}: ${error.message}`, 
      support: 0, 
      resistance: 0, 
      phase: "N/A"
    });
  }
}
