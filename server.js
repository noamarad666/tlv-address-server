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
        console.log('postText:', postText.substring(0, 200));
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

const DESCRIPTIVE_WORDS = new Set([
  'שקט', 'שקטה', 'שקטים', 'שקטה,', 'פסטורלי', 'פסטורלית', 'יפה', 'יפהפה',
  'נחמד', 'נחמדה', 'מקסים', 'מקסימה', 'צדדי', 'צדדית', 'ירוק', 'ירוקה',
  'מרכזי', 'מרכזית', 'נעים', 'נעימה', 'קטן', 'קטנה', 'גדול', 'גדולה',
  'quiet', 'lovely', 'nice', 'beautiful', 'calm', 'green', 'central', 'small'
]);

function extractAddress(text) {
  const keywords = [
    'ברחוב ', 'רחוב ', "ברח' ", "רח' ",
    'בשדרות ', 'שדרות ', 'בסמטת ', 'סמטת ',
    ' on ', ' at '
  ];
  const cityWords = new Set(['תל', 'אביב', 'tel', 'aviv', 'israel', 'ישראל']);

  const candidates = [];

  for (const kw of keywords) {
    let start = 0;
    const haystack = text.includes(kw) ? text : text.toLowerCase();
    const needle = text.includes(kw) ? kw : kw.toLowerCase();

    while (true) {
      const idx = haystack.indexOf(needle, start);
      if (idx === -1) break;

      const after = text.substring(idx + kw.length).trim();
      const chunk = after.split(/[\n\(\-\.!,]/)[0].trim();
      let words = chunk.split(/\s+/).slice(0, 3);

      while (words.length > 0 && cityWords.has(words[words.length - 1].toLowerCase().replace(/[,.]/g, ''))) {
        words.pop();
      }

      if (words.length > 0) {
        const result = words.join(' ').replace(/[,.]+$/, '').trim();
        if (result.length > 1) {
          const hasDescriptive = words.some(w => DESCRIPTIVE_WORDS.has(w.replace(/[,.!]/g, '')));
          let score = hasDescriptive ? 10 : 0;
          score += idx * 0.0001; // slight preference for earlier matches
          candidates.push({ score, result });
        }
      }
      start = idx + 1;
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.score - b.score);
  return candidates[0].result;
}

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
