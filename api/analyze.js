export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Gunakan POST' });

  const { ticker } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) return res.status(200).json({ summary: "Error: API Key Hilang!" });

  try {
    // UPDATE: Menggunakan gemini-2.5-flash sesuai hasil audit & kebijakan baru Google
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Analisis teknikal saham IDX: ${ticker}. Berikan hasil HANYA dalam format JSON murni: {"price": 1000, "change": 1.5, "signal": "BUY", "fair_value": 1100, "vol_ratio": 1.2, "summary": "Analisis singkat", "support": 900, "resistance": 1200, "phase": "Markup"}. Jangan ada teks tambahan.`
          }]
        }]
      })
    });

    const data = await response.json();

    if (data.error) throw new Error(data.error.message);
    
    if (!data.candidates || !data.candidates[0].content) {
      throw new Error("Respon AI kosong atau diblokir filter.");
    }

    let rawText = data.candidates[0].content.parts[0].text;
    
    // Pencapit JSON manual yang tahan banting
    const jsonStart = rawText.indexOf('{');
    const jsonEnd = rawText.lastIndexOf('}') + 1;
    
    if (jsonStart === -1) throw new Error("Format data tidak sesuai");
    
    const cleanJson = rawText.substring(jsonStart, jsonEnd);
    res.status(200).json(JSON.parse(cleanJson));

  } catch (error) {
    console.error("LOG_FINAl:", error.message);
    res.status(200).json({
      price: 0, change: 0, signal: "ERR", fair_value: 0, vol_ratio: 0,
      summary: `Info: ${error.message}`,
      support: 0, resistance: 0, phase: "N/A"
    });
  }
}
