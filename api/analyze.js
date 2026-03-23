export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Gunakan POST' });

  const { ticker } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) return res.status(200).json({ summary: "API Key belum terpasang!" });

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Search IDX for ${ticker} price on March 23, 2026. 
            Then output ONLY this JSON: {"price":number, "change":number, "signal":"BUY/SELL", "fair_value":number, "vol_ratio":number, "summary":"short analysis", "support":number, "resistance":number, "phase":"trend"}`
          }]
        }],
        tools: [{ google_search: {} }],
        generationConfig: {
          temperature: 0.1, // Biar gak "ngelantur"
          maxOutputTokens: 400 // Biar responnya singkat & cepet (gak loading terus)
        }
      })
    });

    const data = await response.json();

    if (data.error) throw new Error(data.error.message);
    
    // Ambil teks mentah dari AI
    const rawText = data.candidates[0].content.parts[0].text;
    
    // Ekstraksi JSON (Sangat Penting!)
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Format data error. Coba klik ANALYZE lagi.");
    
    const parsedData = JSON.parse(jsonMatch[0]);
    res.status(200).json(parsedData);

  } catch (error) {
    console.error("ERROR:", error.message);
    res.status(200).json({
      price: 0, change: 0, signal: "ERR", fair_value: 0, vol_ratio: 0,
      summary: `Koneksi Google Search sedang sibuk. Silakan klik ANALYZE sekali lagi.`,
      support: 0, resistance: 0, phase: "N/A"
    });
  }
}
