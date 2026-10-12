## Setting up Discord Ticker Bots

### 1. Create the Discord Bots (Discord Dev Portal)

### 2. Have a Discord Channel

### 3. Create 3 Roles (ticker-green, ticker-red, tickers)

        The name for ticker-green & ticker-red must match exactly for the bots to be colored correctly.

### 4. Create Tradingview Indicator

### 5. Set alert in Tradingview & set webhook URL to server URL

### 6. Gateway intents

All ticker bots use the client in `services/tickers/src/index.ts`. The client
requests only `Guilds` and `GuildMessages`. It does not need Presence, Server
Members, or Message Content intents.

The bots set their own activity and status. They use parsed user mentions to
reply with market data. Discord provides content for messages that mention the
bot without the Message Content intent.

Source: [Discord Message Content intent](https://docs.discord.com/developers/events/gateway#message-content-intent).
The documentation lists this exception: "Content in which the app is mentioned".

### 7. Deploy both bot services together

1. Run `npm test` from the repository root. Confirm that Market Wizard has
   Message Content access before the deployment.

2. Transfer the code to the deployment host through the usual release process.
   Keep the host's existing bot configuration and environment values.

3. From `services/`, build all application images:

   ```bash
   docker compose build
   ```

4. Deploy the application stack together:

   ```bash
   docker compose up -d
   docker compose logs --since 5m tickers market-wiz
   ```

5. Check that each configured bot logs in. Check price, percentage activity,
   status, role color, and mention replies in Discord. Check both regular
   mentions and nickname mentions. Also check Market Wizard's slash commands
   and the Financial Juice news relay.

6. After these checks pass, turn off Presence, Server Members, and Message
   Content intents in each ticker application's Developer Portal Bot settings.
   Save each application's settings. Do not apply this step to Market Wizard
   or other applications with a different client.

7. Restart the ticker container and repeat the checks. A fresh connection checks
   that the bots can connect with the new portal settings:

   ```bash
   docker compose restart tickers market-wiz
   docker compose logs --since 5m tickers market-wiz
   ```

If an older image is needed for recovery, enable its required Message Content
intent before starting that image. The older client requests that intent.

### 8. Market Wizard intents

Market Wizard uses `Guilds`, `GuildMessages`, and `MessageContent`. It reads
Financial Juice messages from its configured source channel and sends news
embeds to the news channel. It also sends breaking news to the trading chat.
This feature requires Message Content access. Market Wizard does not need
Presence or Server Members intents.

Do not turn off Market Wizard's Message Content intent during ticker cleanup.
The news reader is always registered. There is no environment flag that
changes its intent requirements.

Run `npm test` from the repository root to build and test both bot services.
The release workflow also builds both Docker images before deployment.
