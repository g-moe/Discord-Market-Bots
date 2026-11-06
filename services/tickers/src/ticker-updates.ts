import { Client } from "discord.js";
import logger from "./logger";
import { pingHeartbeat } from "./pingStatus";
import { Bot } from "./types";
import { updateDiscordBot } from "./updates";

export type Ticker = { client: Client; bot: Bot };

/**
 * Apply one TradingView update: ping the uptime monitor, then update every logged-in bot whose symbol is in `data.stocks`.
 * Does not throw for unknown symbols or a missing `stocks` array; those are skipped.
 *
 * @example
 * await handleTickerUpdate({ data: { stocks: [{ symbol: "ES", price: 5000, pct: 0.4 }] }, tickers });
 */
export async function handleTickerUpdate({ data, tickers }: { data: any; tickers: readonly Ticker[] }) {
  logger.debug({
    stockCount: Array.isArray(data.stocks) ? data.stocks.length : 0,
    usFuturesOpen: data.us_futures_open,
    cryptoOpen: data.crypto_open
  }, "received ticker update");

  await pingHeartbeat();
  if (!Array.isArray(data.stocks)) return;

  let updatedCount = 0;
  for (const info of data.stocks) {
    const ticker = tickers.find(ticker => ticker.bot.symbolName === info.symbol);
    if (ticker) {
      await updateDiscordBot(ticker.client, ticker.bot, info);
      updatedCount++;
    }
  }

  logger.info({ receivedCount: data.stocks.length, updatedCount }, "processed ticker update");
}
