import { Client } from "discord.js";
import { createNewsEmbed } from "../../commands/news";
import { GUILD_ID, NEWS_CHANNEL_ID, TRADING_CHANNEL_ID } from "../../utils/discord-ids";
import logger from "../../utils/logger";
import { MINUTE_MS } from "../../utils/time";
import { countryOptions, importanceOptions, timeframeOptions } from "./news-fetch";

/**
 * Post the US events starting in the next 5 minutes to the news channel and the trading chat.
 * Posts nothing when there are no events; the caller handles a rejected promise (Discord failure).
 *
 * @example
 * await checkNewsCalendar(client);
 */
export async function checkNewsCalendar(client: Client) {
  const result = await createNewsEmbed({
    params: { country: countryOptions.US, timeframe: timeframeOptions["5"], importance: importanceOptions.All },
    scheduled: true,
  });
  if (!result) return;

  const guild = await client.guilds.fetch(GUILD_ID);
  for (const channelId of [NEWS_CHANNEL_ID, TRADING_CHANNEL_ID]) {
    const channel = await guild.channels.fetch(channelId);
    if (channel && channel.isTextBased()) {
      await channel.send({ embeds: [result.embed], components: [result.row] });
    }
  }
}

/**
 * Run `checkNewsCalendar` on every 5-minute wall-clock boundary (:00, :05, ...), starting at the next one.
 * Failures are logged, never thrown.
 *
 * @example
 * setupNewsCalendar(client);
 */
export function setupNewsCalendar(client: Client) {
  const CALENDAR_INTERVAL_MS = 5 * MINUTE_MS;

  const runCheck = async () => {
    try {
      await checkNewsCalendar(client);
    } catch (error) {
      logger.error({ err: error }, "scheduled news calendar check failed");
    }
  };

  const delayToNextBoundary = CALENDAR_INTERVAL_MS - (Date.now() % CALENDAR_INTERVAL_MS);
  setTimeout(() => {
    void runCheck();
    setInterval(() => void runCheck(), CALENDAR_INTERVAL_MS);
  }, delayToNextBoundary);
}
