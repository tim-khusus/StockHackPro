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
            text: `Cari harga saham terbaru ${ticker} di bursa efek Indonesia (IDX) hari ini (23 Maret 2026). 
            Berikan analisis teknikal berdasarkan harga live tersebut.
            Wajib dalam format JSON murni: 
            {"price": harga_terakhir, "change": %_perubahan, "signal": "BUY/SELL/HOLD", "fair_value": angka, "vol_ratio": angka, "summary": "analisis singkat", "support": angka, "resistance": angka, "phase": "Markup"}. 
            Hanya balas dengan JSON saja tanpa kata-kata lain.`
          }]
        }],
        // UPDATE: Menggunakan format google_search yang baru
        tools: [{
          google_search: {}
        }]
      })
    });

    const data = await response.json();

    if (data.error) throw new Error(data.error.message);
    
    if (!data.candidates || !data.candidates[0].content) {
      throw new Error("Gagal mendapatkan data pasar terbaru (Filter Google).");
    }

    let rawText = data.candidates[0].content.parts[0].text;
    
    const jsonStart = rawText.indexOf('{');
    const jsonEnd = rawText.lastIndexOf('}') + 1;
    const cleanJson = rawText.substring(jsonStart, jsonEnd);
    
    res.status(200).json(JSON.parse(cleanJson));

  } catch (error) {
    console.error("SEARCH_ERROR:", error.message);
    res.status(200).json({
      price: 0, change: 0, signal: "ERR", fair_value: 0, vol_ratio: 0,
      summary: `Info: ${error.message}. Silakan coba lagi.`,
      support: 0, resistance: 0, phase: "N/A"
    });
  }
}
