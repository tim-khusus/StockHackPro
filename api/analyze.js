export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Gunakan POST' });

  const { ticker } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) return res.status(200).json({ summary: "API Key belum terpasang di Vercel!" });

  try {
    // FIX: Menggunakan gemini-1.5-flash di jalur v1beta (Paling stabil saat ini)
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Berikan analisis teknikal saham IDX: ${ticker}. 
            Wajib dalam format JSON: {"price":1000, "change":1.5, "signal":"BUY", "fair_value":1100, "vol_ratio":1.2, "summary":"analisis", "support":900, "resistance":1200, "phase":"Markup"}. 
            Hanya balas dengan JSON saja tanpa kata-kata lain.`
          }]
        }]
      })
    });

    const data = await response.json();

    // Cek jika API Key kamu yang bermasalah
    if (data.error) {
      if (data.error.message.includes("API key not valid")) {
        throw new Error("API KEY TIDAK VALID. Silakan buat ulang di Google AI Studio.");
      }
      throw new Error(data.error.message);
    }

    if (!data.candidates || !data.candidates[0].content) {
      throw new Error("Respon kosong (Mungkin karena Safety Filter Google)");
    }

    let rawText = data.candidates[0].content.parts[0].text;
    
    // Pencapit JSON manual
    const jsonStart = rawText.indexOf('{');
    const jsonEnd = rawText.lastIndexOf('}') + 1;
    
    if (jsonStart === -1) throw new Error("Format data tidak sesuai");
    
    const cleanJson = rawText.substring(jsonStart, jsonEnd);
    res.status(200).json(JSON.parse(cleanJson));

  } catch (error) {
    console.error("LOG:", error.message);
    res.status(200).json({
      price: 0, change: 0, signal: "ERR", fair_value: 0, vol_ratio: 0,
      summary: `INFO: ${error.message}`,
      support: 0, resistance: 0, phase: "N/A"
    });
  }
}
