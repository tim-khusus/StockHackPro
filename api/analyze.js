export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { ticker } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(200).json({ summary: "Error: API Key belum diset di Vercel!" });
  }

  try {
    // Menggunakan endpoint v1beta agar lebih kompatibel dengan fitur terbaru
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Berikan analisis teknikal saham ${ticker} dalam format JSON murni. 
            Isinya harus: {"price": angka, "change": angka, "signal": "BUY/SELL/HOLD", "fair_value": angka, "vol_ratio": angka, "summary": "teks", "support": angka, "resistance": angka, "phase": "teks"}. 
            Hanya balas dengan objek JSON tersebut, jangan ada teks tambahan.`
          }]
        }]
      })
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message);
    }

    // Ambil teks mentah dari AI
    let rawText = data.candidates[0].content.parts[0].text;
    
    // Pembersihan teks jika AI nakal memberikan markdown (```json ... ```)
    const cleanJson = rawText.replace(/```json|```/g, "").trim();
    
    // Kirim data ke UI
    res.status(200).json(JSON.parse(cleanJson));

  } catch (error) {
    console.error("LOG_ERROR:", error.message);
    res.status(200).json({
      price: 0, change: 0, signal: "ERR", fair_value: 0, vol_ratio: 0,
      summary: "Gagal memproses: " + error.message,
      support: 0, resistance: 0, phase: "N/A"
    });
  }
}
