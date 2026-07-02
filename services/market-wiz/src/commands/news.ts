import {
  ActionRowBuilder,
  APIApplicationCommandOptionChoice,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder
} from "discord.js";

import logger from "../utils/logger";

import { countryOptions, fetchNewsData, importanceOptions, TFetchNewsParams, timeframeOptions, TNewsEvent } from "../services/news/news-fetch";

export async function createNewsEmbed(scheduled:boolean, params: TFetchNewsParams) {
  const data = await fetchNewsData(params);

  const embed = new EmbedBuilder()
    .setColor("#1E1F20")
    .setTitle("📅 **Upcoming News Events**")
    .setTimestamp()
    .setFooter({
      text: "All event times are in Eastern Standard Timezone",
      iconURL: "https://cdn.discordapp.com/emojis/1212202807193767976.webp?quality=lossless"
    })

  const openChartButton = new ButtonBuilder()
    .setLabel("See More News")
    .setStyle(ButtonStyle.Link)
    .setEmoji("📆")
    .setURL("https://www.tradingview.com/economic-calendar/?aff_id=133415")

  const row: ActionRowBuilder = new ActionRowBuilder()
    .addComponents(openChartButton);

  if (!data || data.length === 0) {
    if (scheduled) {
      return null;
    } else {
      embed.setDescription("*No news events were found to be scheduled with your selected criteria.*");
      return { embed, row };
    }
  }

  const eventsGroupedByDate = groupEventsByDate(data);
  logger.debug({
    eventCount: data.length,
    groupCount: Object.keys(eventsGroupedByDate).length,
    scheduled
  }, "created news calendar embed");
  let fieldsAdded = 0;
  for (const datetime in eventsGroupedByDate) {
    if (fieldsAdded >= 25) break;

    const events = eventsGroupedByDate[datetime];
    let eventDescriptions = events.map(event =>
      `${getCountryFlag()} ${getColorForImportance(event.volatility, event.name)} - ${event.name}`).join("\n");

    if (eventDescriptions.length > 1024) {
      eventDescriptions = eventDescriptions.substring(0, 1021) + "...";
    }

    const date = new Date(datetime).toLocaleTimeString("en-US", {
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/New_York"
    });

    embed.addFields(
      {
        name: `**__ ${date}__**__  -  *(${getTimeDelta(datetime)})*__`,
        value: eventDescriptions,
        inline: false
      });
    fieldsAdded++;
  }

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

export async function execute(interaction: CommandInteraction) {
  const country = interaction.options.get("country")?.value?.toString();
  const timeframe = interaction.options.get("timeframe")?.value?.toString();
  const importance = interaction.options.get("importance")?.value?.toString();

  if (!country || !timeframe || !importance) {
    logger.error("Missing required options");
    await interaction.reply({ content: "Error: Missing required options", ephemeral: true });
    return;
  }

  const countryName = countryOptions[country as keyof typeof countryOptions];
  const timeframeName = timeframeOptions[timeframe as keyof typeof timeframeOptions];
  const importanceName = importanceOptions[importance as keyof typeof importanceOptions];

  const newsString = `${countryName} News Events for ${timeframeName}`;
  const replyMessage = `Peeking into the future for ${newsString}...please wait 🔮`;
  const errorMessage = "Oops! The mystical energies needed to foresee the future are currently unavailable. Please try again later 🧙🏻‍♂️";

  await interaction.reply({ content: replyMessage, ephemeral: true })
    .then(async () => {
      if (!country || !timeframe || !importance) throw new Error("Invalid options");
      const result = await createNewsEmbed(false, { 
        country: countryName,
        timeframe: timeframeName,
        importance: importanceName
      });
      if (!result) throw new Error("Error creating embed");
      await interaction.editReply({ embeds: [result.embed], components: [result.row as any], content: newsString });
    })

    .catch(async error => {
      logger.error(error);
      await interaction.editReply({ content: errorMessage })
    });
}

type EventsGroupedByDate = { [key: string]: TNewsEvent[] };
function groupEventsByDate(data: TNewsEvent[]) {
  const eventsGroupedByDate = data.reduce<EventsGroupedByDate>((acc, event) => {
    const eventDatetime = event.dateUtc;
    if (!acc[eventDatetime]) {
      acc[eventDatetime] = [];
    }
    acc[eventDatetime].push(event);
    return acc;
  }, {});

  // Sort the dates so that the closest events appear first
  const sortedDates = Object.keys(eventsGroupedByDate).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  // Create a new object with sorted dates
  const sortedEventsGroupedByDate: EventsGroupedByDate = {};
  for (const date of sortedDates) {
    sortedEventsGroupedByDate[date] = eventsGroupedByDate[date];
  }

  return sortedEventsGroupedByDate;
}

function getCountryFlag() {
  return "🇺🇸"
}

function getColorForImportance(importance: string, title: string) {
  if (title.toUpperCase().includes("FED")) {
    return "🔵";
  }

  switch (importance) {
  case "HIGH":
    return "🔴";
  case "MEDIUM":
    return "🟠";
  case "LOW":
    return "🟡";
  default:
    return "⚪️";
  }
}

function getTimeDelta(datetime: string) {
  const now = new Date();
  const eventDate = new Date(datetime);
  const deltaMs = eventDate.getTime() - now.getTime();
  const deltaMinutes = Math.floor(deltaMs / (1000 * 60));
  
  if (deltaMinutes < 60) {
    return `${deltaMinutes} minute${deltaMinutes !== 1 ? "s" : ""}`;
  } else {
    const deltaHours = Math.floor(deltaMinutes / 60);
    return `${deltaHours} hour${deltaHours !== 1 ? "s" : ""}`;
  }
}
