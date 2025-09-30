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
    logger.info(`Received message from ${channel}: ${message}`);
    await pingHeartbeat();
    const data = JSON.parse(message);
    if (!Array.isArray(data.stocks)) return;
    for (const info of data.stocks) {
      const mappedTicker = tickers.find((ticker) => ticker.bot.symbolName === info.symbol);
      if (mappedTicker) {
        await updateDiscordBot(mappedTicker.client, mappedTicker.bot, info);
      }
    }
  });
}
