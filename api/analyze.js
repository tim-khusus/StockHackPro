export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { ticker } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) return res.status(500).json({ error: 'API Key Belum Terpasang di Vercel' });

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Analisis saham IDX: ${ticker}. Berikan HANYA JSON tanpa teks lain, tanpa markdown: {"price":0, "change":0, "signal":"HOLD", "fair_value":0, "vol_ratio":0, "summary":"", "support":0, "resistance":0, "phase":""}`
          }]
        }]
      })
    });

    const data = await response.json();
    
    // Safety check: pastikan ada respon dari Gemini
    if (!data.candidates || !data.candidates[0].content) {
      return res.status(500).json({ error: "Gemini tidak memberikan jawaban" });
    }

    const rawText = data.candidates[0].content.parts[0].text;
    
    // Pembersihan teks: Hanya ambil karakter di antara kurung kurawal { ... }
    const jsonStart = rawText.indexOf('{');
    const jsonEnd = rawText.lastIndexOf('}') + 1;
    const cleanJson = rawText.substring(jsonStart, jsonEnd);
    
    res.status(200).json(JSON.parse(cleanJson));

  } catch (error) {
    console.error("Detail Error:", error);
    res.status(500).json({ error: "Gagal memproses analisis saham" });
  }
}
