import {
  ActionRowBuilder,
  APIApplicationCommandOptionChoice,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder
} from "discord.js";
import { countryOptions, fetchNewsData, FetchNewsParams, importanceOptions, NewsEvent, timeframeOptions } from "../services/news/news-fetch";
import logger from "../utils/logger";
import { HOUR_MS, MINUTE_MS } from "../utils/time";

/**
 * Build the calendar embed and its "See More News" button for the selected filters.
 * Returns `null` for a scheduled post with no events, so the caller skips posting; a user request gets a "no events" embed instead.
 *
 * @example
 * const result = await createNewsEmbed({ params: { country: "USA", timeframe: "Next 5 minutes", importance: "🔴🟠🟡" }, scheduled: true });
 * result?.embed.toJSON().title; // "📅 **Upcoming News Events**"
 */
export async function createNewsEmbed({ params, scheduled }: { params: FetchNewsParams; scheduled: boolean }) {
  const EMBED_COLOR = "#1E1F20";
  const EMBED_TITLE = "📅 **Upcoming News Events**";
  const EMBED_FOOTER_TEXT = "All event times are in Eastern Standard Timezone";
  const EMBED_FOOTER_ICON_URL = "https://cdn.discordapp.com/emojis/1212202807193767976.webp?quality=lossless";
  const NO_EVENTS_DESCRIPTION = "*No news events were found to be scheduled with your selected criteria.*";
  const SEE_MORE_LABEL = "See More News";
  const SEE_MORE_EMOJI = "📆";
  const SEE_MORE_URL = "https://www.tradingview.com/economic-calendar/?aff_id=133415";
  const MAX_EMBED_FIELDS = 25;

  const data = await fetchNewsData(params);

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(EMBED_TITLE)
    .setTimestamp()
    .setFooter({ text: EMBED_FOOTER_TEXT, iconURL: EMBED_FOOTER_ICON_URL });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel(SEE_MORE_LABEL)
      .setStyle(ButtonStyle.Link)
      .setEmoji(SEE_MORE_EMOJI)
      .setURL(SEE_MORE_URL)
  );

  if (!data || data.length === 0) {
    if (scheduled) {
      return null;
    }

    embed.setDescription(NO_EVENTS_DESCRIPTION);
    return { embed, row };
  }

  const eventsGroupedByDate = groupEventsByDate(data);
  logger.debug({
    eventCount: data.length,
    groupCount: Object.keys(eventsGroupedByDate).length,
    scheduled
  }, "created news calendar embed");

  const fields = Object.entries(eventsGroupedByDate)
    .slice(0, MAX_EMBED_FIELDS)
    .map(([datetime, events]) => createEventField({ datetime, events }));
  embed.addFields(fields);

  return { embed, row };
}

export const data = new SlashCommandBuilder()
  .setName("news")
  .setDescription("Fetches economic calendar events")
  .addStringOption((option) =>
    option
      .setName("country")
      .setDescription("The country/countries to fetch news for.")
      .setRequired(true)
      .addChoices(
        ...Object.entries(countryOptions).map(([value, name]): APIApplicationCommandOptionChoice<string> => ({ name, value }))
      )
  )
  .addStringOption((option) =>
    option
      .setName("timeframe")
      .setDescription("How far ahead to fetch news events.")
      .setRequired(true)
      .addChoices(
        ...Object.entries(timeframeOptions).map(([value, name]): APIApplicationCommandOptionChoice<string> => ({ name, value }))
      )
  )
  .addStringOption((option) =>
    option
      .setName("importance")
      .setDescription("Minimum impact level of news to fetch.")
      .setRequired(true)
      .addChoices(
        ...Object.entries(importanceOptions).map(([value, name]): APIApplicationCommandOptionChoice<string> => ({ name, value }))
      )
  );

/**
 * Handle `/news`: reply privately, then edit the reply with the calendar embed or an error message.
 * Does not throw; failures are logged and shown to the user.
 *
 * @example
 * await execute(interaction); // reply: "USA News Events for Next 24 hours" + embed
 */
export async function execute(interaction: ChatInputCommandInteraction) {
  const MISSING_OPTIONS_MESSAGE = "Error: Missing required options";
  const ERROR_MESSAGE = "Oops! The mystical energies needed to foresee the future are currently unavailable. Please try again later 🧙🏻‍♂️";

  const country = interaction.options.get("country")?.value?.toString();
  const timeframe = interaction.options.get("timeframe")?.value?.toString();
  const importance = interaction.options.get("importance")?.value?.toString();

  if (!country || !timeframe || !importance) {
    logger.error("Missing required options");
    await interaction.reply({ content: MISSING_OPTIONS_MESSAGE, ephemeral: true });
    return;
  }

  const params: FetchNewsParams = {
    country: countryOptions[country as keyof typeof countryOptions],
    timeframe: timeframeOptions[timeframe as keyof typeof timeframeOptions],
    importance: importanceOptions[importance as keyof typeof importanceOptions],
  };
  const newsString = `${params.country} News Events for ${params.timeframe}`;

  try {
    await interaction.reply({ content: `Peeking into the future for ${newsString}...please wait 🔮`, ephemeral: true });

    const result = await createNewsEmbed({ params, scheduled: false });
    if (!result) throw new Error("Error creating embed");

    await interaction.editReply({ embeds: [result.embed], components: [result.row], content: newsString });
  } catch (error) {
    logger.error(error);
    await interaction.editReply({ content: ERROR_MESSAGE });
  }
}

/**
 * Group events by their start time, with the soonest time first.
 *
 * @example
 * groupEventsByDate(events); // { "2026-11-06T13:30:00Z": [cpi, coreCpi], "2026-11-06T15:00:00Z": [ism] }
 */
function groupEventsByDate(data: readonly NewsEvent[]): Record<string, NewsEvent[]> {
  const grouped = data.reduce<Record<string, NewsEvent[]>>((acc, event) => {
    (acc[event.dateUtc] ??= []).push(event);
    return acc;
  }, {});

  const sortedDates = Object.keys(grouped).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  return Object.fromEntries(sortedDates.map(date => [date, grouped[date]]));
}

/**
 * Build one embed field listing the events at `datetime`, truncated to Discord's field value limit.
 *
 * @example
 * createEventField({ datetime: "2026-11-06T13:30:00Z", events: [cpi] });
 * // { name: "**__ November 6 at 08:30 AM__**__  -  *(2 hours)*__", value: "🇺🇸 🔴 - CPI", inline: false }
 */
function createEventField({ datetime, events }: { datetime: string; events: readonly NewsEvent[] }) {
  const MAX_FIELD_VALUE_LENGTH = 1024;
  const TRUNCATION_SUFFIX = "...";
  const EVENT_TIME_ZONE = "America/New_York";
  const COUNTRY_FLAG = "🇺🇸";

  const descriptions = events
    .map(event => `${COUNTRY_FLAG} ${getColorForImportance({ importance: event.volatility, title: event.name })} - ${event.name}`)
    .join("\n");

  const value = descriptions.length > MAX_FIELD_VALUE_LENGTH
    ? descriptions.substring(0, MAX_FIELD_VALUE_LENGTH - TRUNCATION_SUFFIX.length) + TRUNCATION_SUFFIX
    : descriptions;

  const date = new Date(datetime).toLocaleTimeString("en-US", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: EVENT_TIME_ZONE
  });

  return { name: `**__ ${date}__**__  -  *(${getTimeDelta(datetime)})*__`, value, inline: false };
}

/**
 * Pick the emoji for an event: blue for Fed events, otherwise by importance.
 *
 * @example
 * getColorForImportance({ importance: "HIGH", title: "CPI" }); // "🔴"
 * getColorForImportance({ importance: "LOW", title: "Fed Chair Speaks" }); // "🔵"
 */
function getColorForImportance({ importance, title }: { importance: string; title: string }) {
  const FED_KEYWORD = "FED";
  const FED_EMOJI = "🔵";
  const UNKNOWN_IMPORTANCE_EMOJI = "⚪️";
  const IMPORTANCE_EMOJIS: Readonly<Record<string, string>> = {
    HIGH: "🔴",
    MEDIUM: "🟠",
    LOW: "🟡",
  };

  if (title.toUpperCase().includes(FED_KEYWORD)) {
    return FED_EMOJI;
  }

  return IMPORTANCE_EMOJIS[importance] ?? UNKNOWN_IMPORTANCE_EMOJI;
}

/**
 * Describe how far away `datetime` is, in whole minutes under an hour and whole hours otherwise.
 *
 * @example
 * getTimeDelta(new Date(Date.now() + 90 * MINUTE_MS).toISOString()); // "1 hour"
 */
function getTimeDelta(datetime: string) {
  const MINUTES_PER_HOUR = HOUR_MS / MINUTE_MS;

  const deltaMinutes = Math.floor((new Date(datetime).getTime() - Date.now()) / MINUTE_MS);

  if (deltaMinutes < MINUTES_PER_HOUR) {
    return pluralize({ count: deltaMinutes, unit: "minute" });
  }

  return pluralize({ count: Math.floor(deltaMinutes / MINUTES_PER_HOUR), unit: "hour" });
}

/**
 * Format a count with its unit, adding "s" unless the count is exactly 1.
 *
 * @example
 * pluralize({ count: 1, unit: "hour" }); // "1 hour"
 * pluralize({ count: 5, unit: "minute" }); // "5 minutes"
 */
function pluralize({ count, unit }: { count: number; unit: string }) {
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}
