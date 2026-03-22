export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { ticker } = req.body;
  const GEMINI_KEY = process.env.GEMINI_API_KEY;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Analisis mendalam saham IDX: ${ticker}. Berikan hasil dalam format JSON murni tanpa markdown: 
            {"price": 1000, "change": 2.5, "signal": "BUY", "fair_value": 1200, "vol_ratio": 1.5, "summary": "Deskripsi singkat", "support": 950, "resistance": 1100, "phase": "Accumulation"}`
          }]
        }]
      })
    });

    const data = await response.json();
    const rawText = data.candidates[0].content.parts[0].text;
    
    // Membersihkan teks jika AI memberikan format markdown ```json
    const cleanJson = rawText.replace(/```json|```/g, "").trim();
    const report = JSON.parse(cleanJson);
    
    res.status(200).json(report);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Gemini API Error" });
  }
}
