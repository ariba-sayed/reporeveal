// /api/ask — serverless function (Node runtime on Vercel)
// Keeps the Bob API key on the server; the browser never sees it.
//
// IMPORTANT: fill in BOB_API_URL below to match what your Bob account's
// "Inference" API key page shows. IBM's docs (bob.ibm.com/docs/ide/account/api-keys)
// confirm Bob issues a dedicated "Inference" key type for exactly this use case,
// but the exact base URL / request shape is shown on YOUR account's key-creation
// screen (it can differ by subscription instance/team), so copy it from there
// rather than trusting a hardcoded guess here.

const BOB_API_URL = process.env.BOB_API_URL || 'https://bob.ibm.com/api/v1/chat/completions';
const BOB_API_KEY = process.env.BOB_API_KEY; // set this in Vercel's Environment Variables, never in code
const BOB_MODEL = process.env.BOB_MODEL || 'bob-2.0';

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST' });
    return;
  }
  if (!BOB_API_KEY) {
    res.status(500).json({ error: 'BOB_API_KEY is not set on the server (Vercel > Project > Settings > Environment Variables).' });
    return;
  }

  const { question, context } = req.body || {};
  if (!question) {
    res.status(400).json({ error: 'Missing "question" in request body.' });
    return;
  }

  const systemPrompt = `You are IBM Bob 2.0, an AI development partner answering questions about a code repository.
Repository context:
${context || ''}

Answer the user's question concisely (2-4 sentences), referencing specific files or commands from the context where relevant. If the question falls outside the given context, say so and answer helpfully in general terms.`;

  try {
    const upstream = await fetch(BOB_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${BOB_API_KEY}`
      },
      body: JSON.stringify({
        model: BOB_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: question }
        ]
      })
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      res.status(upstream.status).json({
        error: `Bob API returned ${upstream.status} from ${BOB_API_URL} — ${errText}`
      });
      return;
    }

    const data = await upstream.json();
    const answer = data?.choices?.[0]?.message?.content
      || data?.answer
      || data?.message
      || data?.text
      || (typeof data === 'string' ? data : null)
      || JSON.stringify(data);

    res.status(200).json({ answer });
  } catch (err) {
    res.status(500).json({ error: `Failed to reach Bob API at ${BOB_API_URL}: ${err.message}` });
  }
};
