export default async function handler(req, res) {
  const { ticker } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) return res.status(500).json({ error: "API Key Hilang di Vercel!" });

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ 
          parts: [{ text: `Analisis teknikal saham IDX: ${ticker}. Berikan JSON murni: {"price":0, "change":0, "signal":"HOLD", "fair_value":0, "vol_ratio":0, "summary":"...", "support":0, "resistance":0, "phase":"..."}` }]
        }],
        // PENGATURAN AGAR TIDAK DIBLOKIR GOOGLE
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ],
        generationConfig: { response_mime_type: "application/json" }
      })
    });

    const data = await response.json();

    // Cek apakah ada pesan error dari Google (misal: API Key salah)
    if (data.error) {
      throw new Error(`Google API Error: ${data.error.message}`);
    }

    if (!data.candidates || !data.candidates[0].content) {
      console.log("Raw Response:", JSON.stringify(data)); // Intip isi aslinya di log
      throw new Error("Google memblokir respon ini (Safety Filter)");
    }

    const result = JSON.parse(data.candidates[0].content.parts[0].text);
    res.status(200).json(result);

  } catch (error) {
    console.error("INVESTIGASI GAGAL:", error.message);
    res.status(200).json({
      price: 0, change: 0, signal: "ERR", fair_value: 0, vol_ratio: 0, 
      summary: `Penyebab: ${error.message}. Pastikan GEMINI_API_KEY sudah benar di Vercel.`,
      support: 0, resistance: 0, phase: "N/A"
    });
  }
}
