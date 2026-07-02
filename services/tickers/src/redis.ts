import { Client } from "discord.js";
import { createClient } from "redis";
import { updateDiscordBot } from "./updates";
import logger from "./logger";
import { Bot } from "./types";
import { pingHeartbeat } from "./pingStatus";

export async function botController(tickers: { client: Client, bot: Bot }[]) {
  const redisClient = createClient({
    url: `redis://:${process.env.REDIS_PASSWORD}@redis:6379`
  });

  redisClient.on("error", (err) => {
    logger.error("Redis Client Error", err);
  });

  await redisClient.connect();
  await redisClient.subscribe("ticker_updates", async (message: string, channel: string) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch (error) {
      logger.error({ err: error, channel }, "failed to parse ticker update message");
      return;
    }

    logger.debug({
      channel,
      stockCount: Array.isArray(data.stocks) ? data.stocks.length : 0,
      usFuturesOpen: data.us_futures_open,
      cryptoOpen: data.crypto_open
    }, "received ticker update message");

    await pingHeartbeat();
    if (!Array.isArray(data.stocks)) return;
    let updatedCount = 0;
    for (const info of data.stocks) {
      const mappedTicker = tickers.find((ticker) => ticker.bot.symbolName === info.symbol);
      if (mappedTicker) {
        await updateDiscordBot(mappedTicker.client, mappedTicker.bot, info);
        updatedCount++;
      }
    }

    logger.info({
      channel,
      receivedCount: data.stocks.length,
      updatedCount
    }, "processed ticker update message");
  });
}
