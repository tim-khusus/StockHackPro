// api/analyze.js
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { ticker } = req.body;

  try {
    const msg = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1500,
      messages: [{ 
        role: "user", 
        content: `Analisis mendalam saham IDX: ${ticker}. 
        Berikan JSON format: {
          "price": number, "change": number, "signal": "BUY|HOLD|SELL",
          "fair_value": number, "vol_ratio": number, "summary": "string",
          "support": number, "resistance": number, "phase": "Wyckoff Phase"
        }` 
      }],
    });

    const report = JSON.parse(msg.content[0].text);
    res.status(200).json(report);
  } catch (error) {
    res.status(500).json({ error: "Gagal memproses data AI" });
  }
}
