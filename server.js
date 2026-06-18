const express = require('express');
const fetch = require('node-fetch');
const app = express();
app.use(express.json());

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const PORT = process.env.PORT || 3000;

// Health check
app.get('/', (req, res) => res.send('TLV Address Server running'));

app.post('/extract', async (req, res) => {
  const { url, text } = req.body;

  if (!url && !text) {
    return res.status(400).json({ error: 'url or text required' });
  }

  let postText = text || '';

  // If URL provided, try to fetch page and extract og:description
  if (url && !postText) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'facebookexternalhit/1.1',
          'Accept-Language': 'he,en;q=0.9'
        },
        redirect: 'follow',
        timeout: 10000
      });
      const html = await response.text();

      // Extract og:description (Facebook puts post content here for their own crawler)
      const ogMatch = html.match(/property="og:description"\s+content="([^"]{10,1000})"/i)
                   || html.match(/og:description"\s+content="([^"]{10,1000})"/i)
                   || html.match(/name="description"\s+content="([^"]{10,1000})"/i);

      if (ogMatch) {
        postText = ogMatch[1];
        // Decode HTML entities
        postText = postText.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      } else {
        return res.json({ address: null, reason: 'Could not extract post text from URL' });
      }
    } catch (e) {
      return res.json({ address: null, reason: 'Failed to fetch URL: ' + e.message });
    }
  }

  // Now extract address from text using Claude
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

    const data = await claudeRes.json();
    const address = data.content?.[0]?.text?.trim();

    if (!address || address === 'NOT_FOUND') {
      return res.json({ address: null, reason: 'No address found in post', postText });
    }

    return res.json({ address });
  } catch (e) {
    return res.status(500).json({ error: 'Claude API failed: ' + e.message });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
