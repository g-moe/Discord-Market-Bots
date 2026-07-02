import { Client } from "discord.js";

// import { fetchNewsData } from "./news-fetch";
import { createNewsEmbed } from "../../commands/news";
import logger from "../../utils/logger";

export async function checkNewsCalendar(client: Client) {
  const result = await createNewsEmbed(true, { 
    country: "USA",
    timeframe: "Next 5 minutes",
    importance: "🔴🟠🟡"
  });

  if (!result) return;

  // news channel
  const guild = await client.guilds.fetch("668989780398440466");
  const newsChannel = await guild.channels.fetch("1214195778088865802");
  if (newsChannel && newsChannel.isTextBased()) {
    await newsChannel.send({ embeds: [result.embed], components: [result.row as any] });
  }

  // trading chat
  const tradingChannel = await guild.channels.fetch("668989780398440470");
  if (tradingChannel && tradingChannel.isTextBased()) {
    await tradingChannel.send({ embeds: [result.embed], components: [result.row as any] });
  }
}

async function runNewsCalendarCheck(client: Client) {
  try {
    await checkNewsCalendar(client);
  } catch (error) {
    logger.error({ err: error }, "scheduled news calendar check failed");
  }
}

export function setupNewsCalendar(client: Client) {
  const INTERVAL_MINUTES = 5;   
  const MS_IN_MINUTE = 60000;
  const RUNTIME_INTERVAL = INTERVAL_MINUTES * MS_IN_MINUTE;

  const now = new Date();
  const delay = RUNTIME_INTERVAL - ((now.getMinutes() % INTERVAL_MINUTES) * MS_IN_MINUTE + now.getSeconds() * 1000 + now.getMilliseconds());

  setTimeout(() => {
    void runNewsCalendarCheck(client);
    setInterval(() => {
      void runNewsCalendarCheck(client);
    }, RUNTIME_INTERVAL);
  }, delay);
}

