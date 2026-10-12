import * as fs from "fs";
import { Client, Events, GatewayIntentBits } from "discord.js";
import { botController } from "./redis";
import { Bot, BotConfig } from "./types";
import { createTickerMentionMsg } from "./messages";
import logger from "./logger";

// Read in bots
const botConfig: BotConfig = JSON.parse(fs.readFileSync("./bots.json", "utf8"));
if (!botConfig.bots || botConfig.bots.length === 0) {
  throw new Error("Bot configuration is empty or missing");
}

// Initialize the bots
const tickers: { client: Client, bot: Bot }[] = [];
botConfig.bots.forEach(bot => {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages
    ]
  });

  client.on(Events.ClientReady, () => { tickers.push({ client, bot }); logger.info(`Logged in as ${client.user?.tag}!`); });
  client.on(Events.Debug, m => logger.debug(m));
  client.on(Events.Warn, m => logger.warn(m));
  client.on(Events.Error, m => logger.error(m));

  client.on(Events.MessageCreate, async (message) => {
    // Direct mentions remain available without the Message Content intent.
    if (!client.user || !message.mentions.parsedUsers.has(client.user.id)) return;

    try {
      const { embed, row } = await createTickerMentionMsg(client, bot);
      await message.reply({ embeds: [embed], components: [row] });
      logger.info({ messageId: message.id, applicationId: bot.id }, "Replied to ticker mention");
    } catch (error) {
      logger.error(error);
    }
  });

  client.login(bot.token);
});

botController(tickers).catch(logger.error);
