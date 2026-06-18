const express = require('express');
const fetch = require('node-fetch');
const app = express();
app.use(express.json());

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('TLV Address Server running'));

app.post('/extract', async (req, res) => {
  const { url, text } = req.body;
  console.log('--- /extract called ---');
  console.log('url:', url);
  console.log('text:', text ? text.substring(0, 100) : null);
  console.log('API key length:', ANTHROPIC_API_KEY ? ANTHROPIC_API_KEY.length : 0);

  if (!url && !text) {
    console.log('ERROR: no url or text');
    return res.status(400).json({ error: 'url or text required' });
  }

  let postText = text || '';

  if (url && !postText) {
    console.log('Fetching URL:', url);
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'facebookexternalhit/1.1',
          'Accept-Language': 'he,en;q=0.9'
        },
        redirect: 'follow',
        timeout: 10000
      });
      console.log('Fetch status:', response.status);
      const html = await response.text();
      console.log('HTML length:', html.length);

      const ogMatch = html.match(/property="og:description"\s+content="([^"]{10,1000})"/i)
                   || html.match(/og:description"\s+content="([^"]{10,1000})"/i)
                   || html.match(/name="description"\s+content="([^"]{10,1000})"/i);

      if (ogMatch) {
        postText = ogMatch[1]
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .replace(/&#039;/g, "'")
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>');
        console.log('Extracted postText:', postText.substring(0, 100));
      } else {
        console.log('No og:description found');
        return res.json({ address: null, reason: 'Could not extract post text from URL' });
      }
    } catch (e) {
      console.log('Fetch error:', e.message);
      return res.json({ address: null, reason: 'Failed to fetch URL: ' + e.message });
    }
  }

  console.log('Calling Claude with text:', postText.substring(0, 100));
  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 50,
        messages: [{
          role: 'user',
          content: `Extract only the street name or address from this apartment listing. Reply with just the street name, nothing else. If no address found reply NOT_FOUND.\n\n${postText.substring(0, 500)}`
        }]
      })
    });

    console.log('Claude response status:', claudeRes.status);
    const data = await claudeRes.json();
    console.log('Claude response:', JSON.stringify(data).substring(0, 200));

    const address = data.content?.[0]?.text?.trim();
    if (!address || address === 'NOT_FOUND') {
      return res.json({ address: null, reason: 'No address found', postText });
    }

    console.log('Returning address:', address);
    return res.json({ address });

  } catch (e) {
    console.log('Claude error:', e.message);
    return res.status(500).json({ error: 'Claude API failed: ' + e.message });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
