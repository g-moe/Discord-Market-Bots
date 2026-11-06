import { Client, EmbedBuilder, Guild } from "discord.js";
import { GUILD_ID, NEWS_CHANNEL_ID, TRADING_CHANNEL_ID } from "../../utils/discord-ids";
import logger from "../../utils/logger";
import { DAY_MS, MINUTE_MS } from "../../utils/time";
import { fetchNewsHeadlines } from "./news-headline-fetch";
import { NewsHeadline } from "./news-headline-schema";
import { NewsHeadlineStore } from "./news-headline-store";

/**
 * Store unseen FinancialJuice headlines, then post the unposted ones younger than `MAX_POST_AGE_MS`, oldest first.
 * A headline no channel accepted stays unposted and is retried next run while still young enough;
 * the caller handles a rejected promise (fetch or database failure).
 *
 * @example
 * await checkNewsHeadlines({ client, now: Date.now(), store });
 */
export async function checkNewsHeadlines(params: {
  client: Client;
  fetchHeadlines?: () => Promise<readonly NewsHeadline[]>;
  now: number;
  store: NewsHeadlineStore;
}) {
  const MAX_POST_AGE_MS = 5 * MINUTE_MS;

  const { client, fetchHeadlines = fetchNewsHeadlines, now, store } = params;

  const headlines = await fetchHeadlines();
  const insertedCount = store.insertUnseen(headlines);

  const pending = store.listUnpostedSince(now - MAX_POST_AGE_MS);
  for (const headline of pending) {
    const posted = await postNewsHeadline({ client, headline });
    if (posted) {
      store.markPosted({ id: headline.id, postedAt: now });
    }
  }

  logger.debug({ fetchedCount: headlines.length, insertedCount, pendingCount: pending.length }, "checked news headlines");
}

/**
 * Delete stored headlines older than `MAX_STORED_AGE_MS` and return how many were deleted.
 *
 * @example
 * cleanupNewsHeadlines({ now: Date.now(), store }); // 412
 */
export function cleanupNewsHeadlines({ now, store }: { now: number; store: NewsHeadlineStore }) {
  const MAX_STORED_AGE_MS = 3 * DAY_MS;

  const deletedCount = store.deletePublishedBefore(now - MAX_STORED_AGE_MS);
  logger.info({ deletedCount }, "cleaned up old news headlines");

  return deletedCount;
}

/**
 * Send a headline embed to the news channel, and also to the trading chat when it is important.
 * Does not throw on channel failures; returns `true` when at least one channel accepted the embed.
 *
 * @example
 * await postNewsHeadline({ client, headline: { date: Date.now(), id: "1", important: true, title: "Fed holds" } }); // true
 */
export async function postNewsHeadline({ client, headline }: { client: Client; headline: NewsHeadline }) {
  const embed = createNewsHeadlineEmbed(headline);
  const guild = await client.guilds.fetch(GUILD_ID);
  const channelIds = headline.important ? [NEWS_CHANNEL_ID, TRADING_CHANNEL_ID] : [NEWS_CHANNEL_ID];

  const results: boolean[] = [];
  for (const channelId of channelIds) {
    results.push(await sendToChannel({ channelId, embed, guild, headlineId: headline.id }));
  }

  return results.some(Boolean);
}

/**
 * Poll headlines every `POLL_INTERVAL_MS` and clean up every `CLEANUP_INTERVAL_MS`, both starting immediately.
 * A poll still in progress makes the next tick skip instead of overlapping; failures are logged, never thrown.
 *
 * @example
 * setupNewsHeadlines({ client, store: createNewsHeadlineStore({ dbPath: "./data/market-wiz.db" }) });
 */
export function setupNewsHeadlines({ client, store }: { client: Client; store: NewsHeadlineStore }) {
  const POLL_INTERVAL_MS = MINUTE_MS;
  const CLEANUP_INTERVAL_MS = DAY_MS;

  let isChecking = false;

  const runCheck = async () => {
    if (isChecking) return;

    isChecking = true;
    try {
      await checkNewsHeadlines({ client, now: Date.now(), store });
    } catch (error) {
      logger.error({ err: error }, "scheduled news headlines check failed");
    } finally {
      isChecking = false;
    }
  };

  const runCleanup = () => {
    try {
      cleanupNewsHeadlines({ now: Date.now(), store });
    } catch (error) {
      logger.error({ err: error }, "scheduled news headlines cleanup failed");
    }
  };

  runCleanup();
  void runCheck();
  setInterval(() => void runCheck(), POLL_INTERVAL_MS);
  setInterval(runCleanup, CLEANUP_INTERVAL_MS);
}

/**
 * Build the embed for a headline: red with the breaking title when important, grey otherwise.
 *
 * @example
 * createNewsHeadlineEmbed({ date: Date.now(), id: "1", important: false, title: "Fed holds" }).toJSON().description; // "Fed holds"
 */
function createNewsHeadlineEmbed(headline: NewsHeadline) {
  const BREAKING_TITLE = "🚨 BREAKING NEWS";
  const BREAKING_COLOR = 0xff0000;
  const GENERAL_COLOR = 0x808080;
  const FOOTER_TEXT = "Powered by Financial Juice";
  const FOOTER_ICON_URL = "https://cdn.discordapp.com/avatars/1240686103959179274/f2f09abc9a9416a72961869bd7108cef.webp?size=160";

  const embed = new EmbedBuilder()
    .setTimestamp(headline.date)
    .setDescription(headline.title)
    .setFooter({ text: FOOTER_TEXT, iconURL: FOOTER_ICON_URL });

  if (headline.important) {
    return embed.setTitle(BREAKING_TITLE).setColor(BREAKING_COLOR);
  }

  return embed.setColor(GENERAL_COLOR);
}

/**
 * Send an embed to one guild channel.
 * Does not throw; logs the failure and returns `false` when the channel is missing, not text-based, or rejects the send.
 *
 * @example
 * await sendToChannel({ channelId: NEWS_CHANNEL_ID, embed, guild, headlineId: "1" }); // true
 */
async function sendToChannel(params: { channelId: string; embed: EmbedBuilder; guild: Guild; headlineId: string }) {
  const { channelId, embed, guild, headlineId } = params;

  try {
    const channel = await guild.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
      logger.warn({ channelId, headlineId }, "news headline channel is not a text channel");
      return false;
    }

    await channel.send({ embeds: [embed] });
    return true;
  } catch (error) {
    logger.error({ err: error, channelId, headlineId }, "news headline send failed");
    return false;
  }
}
