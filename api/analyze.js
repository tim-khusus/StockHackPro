export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { ticker } = req.body;
  const GEMINI_KEY = process.env.GEMINI_API_KEY;

  if (!GEMINI_KEY) return res.status(500).json({ error: "API Key Belum Terpasang di Vercel" });

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Analisis saham IDX: ${ticker}. Berikan jawaban dalam SATU BARIS JSON SAJA, tanpa penjelasan lain, tanpa markdown, tanpa kata-kata pembuka. Format: {"price": 1000, "change": 2.5, "signal": "BUY", "fair_value": 1200, "vol_ratio": 1.5, "summary": "Deskripsi singkat", "support": 950, "resistance": 1100, "phase": "Accumulation"}`
          }]
        }]
      })
    });

    const data = await response.json();
    
    // Cek jika API Gemini menolak (biasanya karena kuota atau key salah)
    if (!data.candidates || data.candidates.length === 0) {
      return res.status(500).json({ error: "Gemini tidak memberikan respon. Cek kuota API." });
    }

    let rawText = data.candidates[0].content.parts[0].text;
    
    // Logic pembersihan super kuat: Ambil hanya teks di dalam kurung kurawal { ... }
    const jsonMatch = rawText.match(/\{.*\}/s);
    if (!jsonMatch) throw new Error("Format JSON tidak ditemukan");
    
    const report = JSON.parse(jsonMatch[0]);
    res.status(200).json(report);

  } catch (error) {
    console.error("Error Detail:", error);
    res.status(500).json({ error: "Gagal memproses data. Coba lagi dalam 1 menit." });
  }
}
