require('dotenv').config();
const http = require('http');
const TelegramBot = require('node-telegram-bot-api');
const OpenAI = require('openai');
const axios = require('axios');
const cheerio = require('cheerio');

// ─── CONFIG (edit these to customize) ────────────────────────────────────────
const POLL_INTERVAL_MS = 3 * 60 * 60 * 1000; // how often to check HN (default: 3 hours)
const TOP_N_STORIES    = 50;                  // how many top stories to track
const MIN_SCORE        = 100;                 // only send stories with at least this score
const QUIET_START_HOUR = 3;                   // quiet hours start (Istanbul time, 24h)
const QUIET_END_HOUR   = 9;                   // quiet hours end   (Istanbul time, 24h)
const TIMEZONE         = 'Europe/Istanbul';   // your timezone
const SEND_DELAY_MS    = 3000;               // pause between Telegram messages
// ─────────────────────────────────────────────────────────────────────────────

const bot    = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const HN_API  = 'https://hacker-news.firebaseio.com/v0';
const MAX_SEEN = 5000;
const seenIds  = new Set();

function isQuietHours() {
  const hour = parseInt(
    new Date().toLocaleString('en-US', { timeZone: TIMEZONE, hour: 'numeric', hour12: false }),
    10
  );
  return hour >= QUIET_START_HOUR && hour < QUIET_END_HOUR;
}

async function getTopStoryIds() {
  const { data } = await axios.get(`${HN_API}/topstories.json`, { timeout: 10000 });
  return data.slice(0, TOP_N_STORIES);
}

async function getStory(id) {
  const { data } = await axios.get(`${HN_API}/item/${id}.json`, { timeout: 10000 });
  return data;
}

async function fetchArticleText(url) {
  try {
    const { data } = await axios.get(url, {
      timeout: 12000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HNBot/1.0)' },
      maxContentLength: 500_000,
    });
    const $ = cheerio.load(data);
    $('script, style, nav, footer, header, aside, [class*="cookie"], [class*="banner"]').remove();
    const text = $('article, main, [class*="content"], [class*="post"], body').first().text();
    return text.replace(/\s+/g, ' ').trim().slice(0, 4000);
  } catch {
    return null;
  }
}

async function summarize(story, articleText) {
  const hasArticle = articleText && articleText.length > 150;

  const systemPrompt =
    'You are a sharp tech news summarizer. Write in plain English, no markdown, no bullet points. ' +
    'Be direct — lead with the most interesting or surprising thing. Sound like a smart friend explaining it.';

  const userPrompt = hasArticle
    ? `Summarize this HackerNews story and its article in 3-4 punchy sentences. Lead with why it matters.\n\nTitle: ${story.title}\n\nArticle:\n${articleText}`
    : `Summarize this HackerNews story in 2 sentences. Lead with why it matters.\n\nTitle: ${story.title}`;

  const res = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: 250,
    temperature: 0.5,
  });

  return res.choices[0].message.content.trim();
}

function escape(text) {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

async function sendStory(story) {
  const articleText = story.url ? await fetchArticleText(story.url) : null;
  const summary     = await summarize(story, articleText);

  const hnLink   = `https://news.ycombinator.com/item?id=${story.id}`;
  const score    = story.score ?? 0;
  const comments = story.descendants ?? 0;

  let msg = `📰 *${escape(story.title)}*\n\n`;
  msg += `${escape(summary)}\n\n`;
  if (story.url) msg += `🔗 [Read Article](${story.url})\n`;
  msg += `💬 [HN Discussion](${hnLink})  •  ⬆️ ${score}  •  🗨 ${comments}`;

  await bot.sendMessage(process.env.TELEGRAM_CHAT_ID, msg, {
    parse_mode: 'MarkdownV2',
    disable_web_page_preview: false,
  });

  console.log(`[${new Date().toISOString()}] Sent: ${story.title} (score: ${score})`);
}

async function poll() {
  if (isQuietHours()) {
    console.log(`[${new Date().toISOString()}] Quiet hours (${QUIET_START_HOUR}–${QUIET_END_HOUR}h Istanbul), skipping.`);
    return;
  }

  try {
    const ids = await getTopStoryIds();

    // First run: send top 5 stories that meet the score threshold, seed the rest
    if (seenIds.size === 0) {
      ids.forEach(id => seenIds.add(id));
      console.log(`[init] Seeded ${ids.length} stories. Fetching top picks to send now…`);

      const candidates = [];
      for (const id of ids.slice(0, 15)) {
        const story = await getStory(id);
        if (story && story.type === 'story' && story.title && !story.dead && !story.deleted && (story.score ?? 0) >= MIN_SCORE) {
          candidates.push(story);
        }
        if (candidates.length >= 5) break;
      }

      for (const story of candidates) {
        await sendStory(story);
        await new Promise(r => setTimeout(r, SEND_DELAY_MS));
      }
      return;
    }

    const fresh = ids.filter(id => !seenIds.has(id));
    if (fresh.length === 0) {
      console.log(`[${new Date().toISOString()}] No new stories in top ${TOP_N_STORIES}.`);
      return;
    }

    console.log(`[${new Date().toISOString()}] ${fresh.length} new stories entered top ${TOP_N_STORIES}`);

    for (const id of fresh) {
      seenIds.add(id);
      if (seenIds.size > MAX_SEEN) {
        const oldest = [...seenIds].slice(0, seenIds.size - MAX_SEEN);
        oldest.forEach(old => seenIds.delete(old));
      }

      try {
        const story = await getStory(id);
        if (!story || story.type !== 'story' || !story.title || story.dead || story.deleted) continue;
        if ((story.score ?? 0) < MIN_SCORE) {
          console.log(`  Skipped (score ${story.score ?? 0} < ${MIN_SCORE}): ${story.title}`);
          continue;
        }
        await sendStory(story);
        await new Promise(r => setTimeout(r, SEND_DELAY_MS));
      } catch (err) {
        console.error(`  Error on story ${id}:`, err.message);
      }
    }
  } catch (err) {
    console.error(`[poll error] ${err.message}`);
  }
}

async function main() {
  if (!process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN === 'your_bot_token_here') {
    console.error('ERROR: Fill in TELEGRAM_BOT_TOKEN in .env'); process.exit(1);
  }
  if (!process.env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID === 'your_chat_id_here') {
    console.error('ERROR: Fill in TELEGRAM_CHAT_ID in .env'); process.exit(1);
  }
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
    console.error('ERROR: Fill in OPENAI_API_KEY in .env'); process.exit(1);
  }

  const port = process.env.PORT || 3000;
  http.createServer((_, res) => {
    res.writeHead(200);
    res.end('HackerNews bot is running');
  }).listen(port, () => console.log(`Health check server on port ${port}`));

  console.log(`HackerNews Telegram Bot starting…`);
  console.log(`  Poll interval : every ${POLL_INTERVAL_MS / 3600000}h`);
  console.log(`  Min score     : ${MIN_SCORE}`);
  console.log(`  Quiet hours   : ${QUIET_START_HOUR}:00–${QUIET_END_HOUR}:00 Istanbul`);
  await poll();
  setInterval(poll, POLL_INTERVAL_MS);
}

main();
