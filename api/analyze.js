export default async function handler(req, res) {
  const apiKey = process.env.GEMINI_API_KEY;
  try {
    // Meminta daftar model resmi yang didukung API Key kamu
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await response.json();
    
    // Tampilkan daftar modelnya di layar "Summary" kamu
    const modelNames = data.models.map(m => m.name.split('/').pop()).join(', ');
    
    res.status(200).json({
      summary: "DAFTAR MODEL AKTIF KAMU: " + modelNames,
      price: 0, change: 0, signal: "AUDIT", fair_value: 0, vol_ratio: 0, support: 0, resistance: 0, phase: "N/A"
    });
  } catch (error) {
    res.status(200).json({ summary: "Gagal Audit: " + error.message });
  }
}
