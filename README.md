# HackerNews Telegram Bot

Monitors the HackerNews front page every 3 hours and sends you top-ranked stories via Telegram — with an AI summary of the article. Silent at night (Istanbul time).

## What it does

- Watches the **top 50 HackerNews stories** (front page, quality content only)
- Sends a story when it enters the top 50 and has **score ≥ 100**
- Fetches the actual article and summarizes it with `gpt-4o-mini`
- **Silent 3am–9am Istanbul time** — no notifications while you sleep
- On first boot, immediately sends your top 5 picks

## Customization

All settings are at the top of `index.js`:

```js
// ─── CONFIG ───────────────────────────────────────────────────────────────────
const POLL_INTERVAL_MS = 3 * 60 * 60 * 1000; // how often to check HN (default: 3 hours)
const TOP_N_STORIES    = 50;                  // how many top stories to track
const MIN_SCORE        = 100;                 // only send stories with at least this score
const QUIET_START_HOUR = 3;                   // quiet hours start (Istanbul time, 24h)
const QUIET_END_HOUR   = 9;                   // quiet hours end   (Istanbul time, 24h)
const TIMEZONE         = 'Europe/Istanbul';   // your timezone
```

| Setting | What it does |
|---|---|
| `POLL_INTERVAL_MS` | How often to check. `1 * 60 * 60 * 1000` = every 1 hour |
| `TOP_N_STORIES` | How many top stories to watch. Max is 500 |
| `MIN_SCORE` | Minimum upvotes before sending. Raise it for higher quality only |
| `QUIET_START_HOUR` | Hour to stop sending (24h format). `3` = 3am |
| `QUIET_END_HOUR` | Hour to resume sending. `9` = 9am |
| `TIMEZONE` | Any valid IANA timezone, e.g. `America/New_York`, `UTC` |

## Setup

### 1. Clone

```bash
git clone https://github.com/Arvinvx/sendhackernews.git
cd sendhackernews
npm install
```

### 2. Environment variables

Create a `.env` file (never commit this):

```env
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
OPENAI_API_KEY=your_openai_key
```

| Variable | How to get it |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Message `@BotFather` on Telegram → `/newbot` |
| `TELEGRAM_CHAT_ID` | Message `@userinfobot` on Telegram — it replies with your numeric ID |
| `OPENAI_API_KEY` | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |

### 3. Run locally

```bash
node index.js
```

## Deploy on Render.com

1. Go to [render.com](https://render.com) → **New** → **Web Service**
2. Connect this GitHub repo
3. Settings:

| Setting | Value |
|---|---|
| Runtime | Node |
| Build Command | `npm install` |
| Start Command | `node index.js` |

4. Add the 3 environment variables under the **Environment** tab
5. Click **Deploy**

## Stack

- [HackerNews API](https://github.com/HackerNews/API) — top stories feed
- [node-telegram-bot-api](https://github.com/yagop/node-telegram-bot-api) — Telegram messaging
- [OpenAI SDK](https://github.com/openai/openai-node) — `gpt-4o-mini` summaries
- [cheerio](https://cheerio.js.org/) — article text extraction
