export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Gunakan POST' });

  const { ticker } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) return res.status(200).json({ summary: "Error: API Key Hilang!" });

  try {
    // HASIL AUDIT: Menggunakan model 'gemini-2.0-flash' yang terbukti aktif di akun kamu
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Berikan analisis teknikal saham IDX: ${ticker}. 
            Wajib dalam format JSON murni: 
            {"price": 1000, "change": 1.5, "signal": "BUY", "fair_value": 1100, "vol_ratio": 1.2, "summary": "Analisis singkat tren", "support": 900, "resistance": 1200, "phase": "Markup"}. 
            Hanya balas dengan JSON saja tanpa kata-kata lain.`
          }]
        }]
      })
    });

    const data = await response.json();

    if (data.error) throw new Error(data.error.message);
    
    if (!data.candidates || !data.candidates[0].content) {
      throw new Error("Respon kosong atau diblokir filter keamanan.");
    }

    let rawText = data.candidates[0].content.parts[0].text;
    
    // Pencapit JSON otomatis (Tahan banting jika ada markdown)
    const jsonStart = rawText.indexOf('{');
    const jsonEnd = rawText.lastIndexOf('}') + 1;
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
