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
    if (!body?.prompt || typeof body.prompt !== 'string') {
      return res.status(400).json({ error: 'Request tidak valid: field "prompt" diperlukan' });
    }

    const useSearch = body.useSearch === true;
    const model = body.model || 'gemini-2.5-flash';

    // PENTING: responseMimeType:'application/json' TIDAK kompatibel dengan google_search.
    // Kalau keduanya dipakai bersamaan, Gemini mengembalikan respons kosong/error.
    // Solusi: saat useSearch=true, hilangkan responseMimeType dan andalkan
    // system_instruction + parseJSON di frontend untuk mengekstrak JSON dari teks bebas.
    const generationConfig = {
      temperature: 0.2,
      maxOutputTokens: body.maxTokens || 2048,
    };
    if (!useSearch) {
      generationConfig.responseMimeType = 'application/json';
    }

    const geminiPayload = {
      // Paksa model selalu balas dengan JSON murni tanpa markdown wrapper
      system_instruction: {
        parts: [{
          text: 'You are a financial data assistant for Indonesian stocks (IDX). Always respond with raw valid JSON only. Never wrap your response in markdown code blocks. Never add explanation text before or after the JSON. Your entire response must start with { and end with }.',
        }],
      },
      contents: [{
        role: 'user',
        parts: [{ text: body.prompt }],
      }],
      generationConfig,
    };

    if (useSearch) {
      geminiPayload.tools = [{ google_search: {} }];
    }

    const endpoint =
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

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

    // Gabungkan semua text parts (google_search bisa menghasilkan beberapa parts)
    const text = (data?.candidates?.[0]?.content?.parts || [])
      .filter(p => typeof p.text === 'string')
      .map(p => p.text)
      .join('');

    if (!text) {
      // Kembalikan detail lengkap supaya mudah debug di Vercel logs
      const finishReason = data?.candidates?.[0]?.finishReason || 'unknown';
      return res.status(500).json({
        error: `Gemini mengembalikan respons kosong (finishReason: ${finishReason})`,
      });
    }

    return res.status(200).json({ text });

  } catch (err) {
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}
