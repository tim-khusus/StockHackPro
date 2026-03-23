export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Gunakan POST' });

  const { ticker } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) return res.status(200).json({ summary: "Error: API Key Hilang!" });

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `SEARCH & ANALYZE: ${ticker} IDX today (March 23, 2026). 
            Return ONLY a raw JSON object. No preamble, no markdown, no explanation.
            Example: {"price": 10000, "change": 1.5, "signal": "BUY", "fair_value": 11000, "vol_ratio": 1.2, "summary": "Trend is strong", "support": 9500, "resistance": 10500, "phase": "Markup"}`
          }]
        }],
        tools: [{
          google_search: {}
        }],
        // Tambahkan config ini untuk memaksa output lebih teratur
        generationConfig: {
          temperature: 0.1, // Agar AI tidak berimajinasi (lebih presisi)
        }
      })
    });

    const data = await response.json();

    if (data.error) throw new Error(data.error.message);
    
    // Ambil teks hasil generate
    let rawText = data.candidates[0].content.parts[0].text;
    
    // PEMBERSIHAN EKSTRA: Menghapus karakter non-JSON yang sering muncul saat pakai Search
    const jsonStart = rawText.indexOf('{');
    const jsonEnd = rawText.lastIndexOf('}') + 1;
    
    if (jsonStart === -1) {
       // Jika AI malah kirim teks curhat tanpa JSON
       throw new Error("AI gagal menyusun data. Silakan coba klik ANALYZE lagi.");
    }
    
    const cleanJson = rawText.substring(jsonStart, jsonEnd);
    const parsedData = JSON.parse(cleanJson);
    
    res.status(200).json(parsedData);

  } catch (error) {
    console.error("ANALYSIS_ERROR:", error.message);
    res.status(200).json({
      price: 0, change: 0, signal: "ERR", fair_value: 0, vol_ratio: 0,
      summary: `Pesan: ${error.message}. Klik ANALYZE sekali lagi untuk refresh.`,
      support: 0, resistance: 0, phase: "N/A"
    });
  }
}
