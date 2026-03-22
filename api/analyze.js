export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { ticker } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(200).json({ summary: "Konfigurasi Vercel: API Key belum dipasang!" });
  }

  try {
    // UPDATE: Menggunakan v1 (Stable) dan model gemini-2.0-flash
    const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Analisis teknikal saham IDX: ${ticker}. Berikan hasil dalam format JSON murni: 
            {"price": 1000, "change": 1.5, "signal": "BUY", "fair_value": 1100, "vol_ratio": 1.2, "summary": "Analisis singkat", "support": 900, "resistance": 1200, "phase": "Markup"}. 
            Hanya balas dengan JSON saja tanpa kata-kata lain.`
          }]
        }]
      })
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(`Google API: ${data.error.message}`);
    }

    // Ekstraksi teks dari respon Google
    if (!data.candidates || !data.candidates[0].content) {
      throw new Error("Respon AI kosong atau diblokir filter.");
    }

    let rawText = data.candidates[0].content.parts[0].text;
    
    // Pembersihan teks dari kemungkinan markdown
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
