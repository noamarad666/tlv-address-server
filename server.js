const express = require('express');
const fetch = require('node-fetch');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('TLV Address Server running'));

app.post('/extract', async (req, res) => {
  const { url, text } = req.body;
  console.log('--- /extract called ---');

  if (!url && !text) {
    return res.status(400).json({ error: 'url or text required' });
  }

  let postText = text || '';

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

      const ogMatch = html.match(/property="og:description"\s+content="([^"]{10,1000})"/i)
                   || html.match(/og:description"\s+content="([^"]{10,1000})"/i)
                   || html.match(/name="description"\s+content="([^"]{10,1000})"/i);

      if (ogMatch) {
        postText = ogMatch[1]
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .replace(/&#039;/g, "'")
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
          .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
        console.log('postText:', postText.substring(0, 150));
      } else {
        return res.json({ address: null, reason: 'Could not extract post text from URL' });
      }
    } catch (e) {
      console.log('Fetch error:', e.message);
      return res.json({ address: null, reason: 'Failed to fetch URL: ' + e.message });
    }
  }

  const address = extractAddress(postText);
  console.log('Extracted address:', address);

  if (address) {
    return res.json({ address });
  } else {
    return res.json({ address: null, reason: 'No address found', postText: postText.substring(0, 200) });
  }
});

function extractAddress(text) {
  const keywords = ['רחוב ', "רח' ", 'שדרות ', 'סמטת ', ' on ', ' at '];
  const cityWords = ['תל', 'אביב', 'tel', 'aviv', 'israel', 'ישראל'];

  for (const kw of keywords) {
    const idx = text.indexOf(kw) !== -1 ? text.indexOf(kw) : text.toLowerCase().indexOf(kw.toLowerCase());
    if (idx === -1) continue;

    const after = text.substring(idx + kw.length).trim();
    const chunk = after.split(/[\n\(\-]/)[0].trim();
    let words = chunk.split(/\s+/).slice(0, 3);

    while (words.length > 0 && cityWords.includes(words[words.length - 1].toLowerCase().replace(/[,.]/g, ''))) {
      words.pop();
    }

    const result = words.join(' ').replace(/[,.]+$/, '').trim();
    if (result.length > 1) return result;
  }
  return null;
}

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
