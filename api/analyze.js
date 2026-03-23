export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Gunakan POST' });

  const { ticker } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) return res.status(200).json({ summary: "API Key belum terpasang di Vercel!" });

  try {
    // Taktik pamungkas: Pakai model dasar 'gemini-pro' di jalur v1beta
    // Model ini adalah pondasi utama Google AI, kuotanya paling aman dan pasti ada.
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Analisis teknikal saham IDX: ${ticker}. Berikan hasil HANYA dalam format JSON murni: 
            {"price": 1000, "change": 1.5, "signal": "BUY", "fair_value": 1100, "vol_ratio": 1.2, "summary": "Analisis singkat tren saat ini", "support": 900, "resistance": 1200, "phase": "Markup"}. 
            Tolong hanya kirimkan objek JSON tersebut, jangan ada teks pembuka atau penutup.`
          }]
        }]
      })
    });

    const data = await response.json();

    if (data.error) throw new Error(data.error.message);
    if (!data.candidates || !data.candidates[0].content) throw new Error("Respon AI diblokir atau kosong.");

    let rawText = data.candidates[0].content.parts[0].text;
    
    // Pencapit JSON manual yang tahan banting
    const jsonStart = rawText.indexOf('{');
    const jsonEnd = rawText.lastIndexOf('}') + 1;
    
    if (jsonStart === -1) throw new Error("AI tidak membalas dengan format JSON");
    
    const cleanJson = rawText.substring(jsonStart, jsonEnd);
    res.status(200).json(JSON.parse(cleanJson));

  } catch (error) {
    console.error("LOG_ERROR:", error.message);
    res.status(200).json({
      price: 0, change: 0, signal: "ERR", fair_value: 0, vol_ratio: 0,
      summary: `Info Sistem: ${error.message}`,
      support: 0, resistance: 0, phase: "N/A"
    });
  }
}
