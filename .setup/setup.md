## Discord Market Bots Setup

### Requirements

- Node `24.22.2` (pinned in `.nvmrc`; `npm` refuses other versions)
- Docker with Compose
- A Discord server and one Discord application per bot

---

### Local development

```bash
git clone https://github.com/g-moe/Discord-Market-Bots
cd Discord-Market-Bots
nvm use
npm run setup        # npm ci in the root, both services, and public-site
npm run lint
npm run typecheck
npm test
```

Run Market Wizard locally (reads `services/.env`):

```bash
npm --prefix services/market-wiz run dev
```

---

### Server deployment

1. Clone the repo on the server:

   ```bash
   git clone https://github.com/g-moe/Discord-Market-Bots
   cd Discord-Market-Bots/services
   ```

2. Create the env file and ticker bot list from the examples:

   ```bash
   cp .env.example .env
   cp tickers/bots.example.json tickers/bots.json
   nano .env
   nano tickers/bots.json
   ```

   `bots.json` holds one entry per ticker bot: its bot `token`, its application `id`, the TradingView `symbolName`, and the `symbolNick` shown in its nickname.

3. Start the stack. The `prod` profile also starts the Cloudflare tunnel that forwards TradingView webhooks to tickers:

   ```bash
   docker compose --profile prod up --build -d
   ```

After the first deploy, pushes to `main` deploy automatically through `.github/workflows/main.yml`.
