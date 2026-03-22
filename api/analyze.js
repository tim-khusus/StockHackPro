// api/analyze.js
export default async function handler(req, res) {
  const { ticker } = req.body;
  const API_KEY = process.env.GEMINI_API_KEY; // Simpan di Vercel Env

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Analisis saham IDX: ${ticker}. Berikan JSON saja: {"price":number, "change":number, "signal":"BUY|HOLD|SELL", "fair_value":number, "vol_ratio":number, "summary":"string", "support":number, "resistance":number, "phase":"Wyckoff Phase"}` }]}]
      })
    });

    const data = await response.json();
    const text = data.candidates[0].content.parts[0].text;
    const report = JSON.parse(text.replace(/```json|```/g, ""));
    res.status(200).json(report);
  } catch (error) {
    res.status(500).json({ error: "Gagal memproses data Gemini" });
  }
}
