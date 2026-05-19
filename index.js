require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const OpenAI = require('openai');
const axios = require('axios');
const cheerio = require('cheerio');

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const HN_API = 'https://hacker-news.firebaseio.com/v0';
const POLL_INTERVAL_MS = 2 * 60 * 1000; // check every 2 minutes
const MAX_SEEN = 2000;                    // cap memory usage
const SEND_DELAY_MS = 3000;              // pause between Telegram messages

const seenIds = new Set();

async function getNewStoryIds() {
  const { data } = await axios.get(`${HN_API}/newstories.json`, { timeout: 10000 });
  return data; // newest-first array of IDs
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
    $('script, style, nav, footer, header, aside').remove();
    const text = $('article, main, .content, body').first().text();
    return text.replace(/\s+/g, ' ').trim().slice(0, 4000);
  } catch {
    return null;
  }
}

async function summarize(story, articleText) {
  const hasArticle = articleText && articleText.length > 100;

  const systemPrompt =
    'You are a concise tech news summarizer. Write in plain text (no markdown). Be direct and informative.';

  const userPrompt = hasArticle
    ? `Summarize this HackerNews story AND its article content in 3-4 sentences. Include the key points from the article.\n\nTitle: ${story.title}\nURL: ${story.url}\n\nArticle excerpt:\n${articleText}`
    : `Summarize this HackerNews story in 2 sentences based on its title.\n\nTitle: ${story.title}${story.url ? `\nURL: ${story.url}` : ''}`;

  const res = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: 250,
    temperature: 0.4,
  });

  return res.choices[0].message.content.trim();
}

function escape(text) {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

async function sendStory(story) {
  const articleText = story.url ? await fetchArticleText(story.url) : null;
  const summary = await summarize(story, articleText);

  const hnLink = `https://news.ycombinator.com/item?id=${story.id}`;
  const score = story.score ?? 0;
  const comments = story.descendants ?? 0;

  let msg = `📰 *${escape(story.title)}*\n\n`;
  msg += `${escape(summary)}\n\n`;
  if (story.url) msg += `🔗 [Read Article](${story.url})\n`;
  msg += `💬 [HN Discussion](${hnLink})  •  ⬆️ ${score}  •  🗨 ${comments}`;

  await bot.sendMessage(process.env.TELEGRAM_CHAT_ID, msg, {
    parse_mode: 'MarkdownV2',
    disable_web_page_preview: false,
  });

  console.log(`[${new Date().toISOString()}] Sent: ${story.title}`);
}

async function poll() {
  try {
    const ids = await getNewStoryIds();

    // First run: send the 5 most recent stories, then seed the rest
    if (seenIds.size === 0) {
      const toSend = ids.slice(0, 5);
      ids.forEach(id => seenIds.add(id));
      console.log(`[init] Sending ${toSend.length} latest stories, then watching for new ones…`);
      for (const id of toSend) {
        try {
          const story = await getStory(id);
          if (!story || story.type !== 'story' || !story.title || story.dead || story.deleted) continue;
          await sendStory(story);
          await new Promise(r => setTimeout(r, SEND_DELAY_MS));
        } catch (err) {
          console.error(`  Error on init story ${id}:`, err.message);
        }
      }
      return;
    }

    const fresh = ids.filter(id => !seenIds.has(id));
    if (fresh.length === 0) return;

    console.log(`[${new Date().toISOString()}] ${fresh.length} new story/stories found`);

    for (const id of fresh) {
      seenIds.add(id);

      // Trim oldest entries when set grows too large
      if (seenIds.size > MAX_SEEN) {
        const oldest = [...seenIds].slice(0, seenIds.size - MAX_SEEN);
        oldest.forEach(old => seenIds.delete(old));
      }

      try {
        const story = await getStory(id);
        if (!story || story.type !== 'story' || !story.title || story.dead || story.deleted) continue;
        await sendStory(story);
        await new Promise(r => setTimeout(r, SEND_DELAY_MS));
      } catch (err) {
        console.error(`  Error processing story ${id}:`, err.message);
      }
    }
  } catch (err) {
    console.error(`[poll error] ${err.message}`);
  }
}

async function main() {
  if (!process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN === 'your_bot_token_here') {
    console.error('ERROR: Fill in TELEGRAM_BOT_TOKEN in .env');
    process.exit(1);
  }
  if (!process.env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID === 'your_chat_id_here') {
    console.error('ERROR: Fill in TELEGRAM_CHAT_ID in .env');
    process.exit(1);
  }
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
    console.error('ERROR: Fill in OPENAI_API_KEY in .env');
    process.exit(1);
  }

  console.log('HackerNews Telegram Bot starting…');
  await poll();
  setInterval(poll, POLL_INTERVAL_MS);
}

main();
