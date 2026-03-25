// api/analyze.js — Proxy ke Gemini API (menggantikan Anthropic)
// Menyembunyikan GEMINI_API_KEY di server Vercel

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key tidak dikonfigurasi' });

  try {
    const body = req.body;
    // Validasi: harus ada field 'prompt' (string) yang dikirim dari frontend
    if (!body?.prompt || typeof body.prompt !== 'string') {
      return res.status(400).json({ error: 'Request tidak valid: field "prompt" diperlukan' });
    }

    const useSearch = body.useSearch === true;
    const model = body.model || 'gemini-2.5-flash';

    // Bangun payload untuk Gemini API
    const geminiPayload = {
      contents: [
        {
          role: 'user',
          parts: [{ text: body.prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.2,         // rendah agar output JSON konsisten
        maxOutputTokens: body.maxTokens || 2048,
        responseMimeType: 'text/plain',
      },
    };

    // Aktifkan Google Search grounding jika diminta
    if (useSearch) {
      geminiPayload.tools = [{ google_search: {} }];
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiPayload),
    });

    const data = await response.json();

    if (!response.ok) {
      const errMsg = data?.error?.message || `HTTP ${response.status}`;
      return res.status(response.status).json({ error: errMsg });
    }

    // Normalisasi respons ke format yang mudah dikonsumsi frontend:
    // { text: "..." }
    const text = data?.candidates?.[0]?.content?.parts
      ?.filter(p => p.text)
      ?.map(p => p.text)
      ?.join('') || '';

    return res.status(200).json({ text });

  } catch (err) {
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}
