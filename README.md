# HackerNews Telegram Bot

Monitors HackerNews for new stories every 2 minutes, summarizes each article with OpenAI, and sends it to you on Telegram.

## Features

- Detects new HackerNews stories in near real-time (polls every 2 min)
- Fetches the full article and extracts readable text
- Summarizes with `gpt-4o-mini` in 3–4 sentences
- Sends a formatted message to Telegram with article link + HN discussion link
- On first boot, sends the 5 most recent stories immediately

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
3. Use these settings:

| Setting | Value |
|---|---|
| Runtime | Node |
| Build Command | `npm install` |
| Start Command | `node index.js` |

4. Add the 3 environment variables under the **Environment** tab
5. Click **Deploy**

Render's health check hits the HTTP server on `PORT` — the bot keeps running alongside it.

## Stack

- [HackerNews Firebase API](https://github.com/HackerNews/API) — real-time story feed
- [node-telegram-bot-api](https://github.com/yagop/node-telegram-bot-api) — Telegram messaging
- [OpenAI SDK](https://github.com/openai/openai-node) — `gpt-4o-mini` summaries
- [cheerio](https://cheerio.js.org/) — HTML content extraction
