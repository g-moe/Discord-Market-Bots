import * as fs from "fs";
import { Client, Events, GatewayIntentBits } from "discord.js";
import { botController } from "./redis";
import { Bot, BotConfig } from "./types";
import { createTickerMentionMsg } from "./messages";
import logger from "./logger";
// import { extendTradingViewAlert } from "./extendData";

// Read in bots
const botConfig: BotConfig = JSON.parse(fs.readFileSync("./bots.json", "utf8"));
if (!botConfig.bots || botConfig.bots.length === 0) {
  throw new Error("Bot configuration is empty or missing");
}

// Initialize the bots
// const discordClients: Client[] = [];
const tickers: { client: Client, bot: Bot }[] = [];
botConfig.bots.forEach(bot => {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMessages
    ]
  });

  client.on(Events.ClientReady, () => { tickers.push({ client, bot }); logger.info(`Logged in as ${client.user?.tag}!`); });
  client.on(Events.Debug, m => logger.debug(m));
  client.on(Events.Warn, m => logger.warn(m));
  client.on(Events.Error, m => logger.error(m));

  client.on("messageCreate", async (message) => {
    if (message.content.includes(`<@${client.user?.id}>`)) {
      const { embed, row } = await createTickerMentionMsg(client, bot);
      message.reply({ embeds: [embed], components: [row as any] })
        .then(() => logger.info(`Replied to message "${message.content}"`))
        .catch(logger.error);
    }
  });

  client.login(bot.token);
});

botController(tickers).catch(logger.error);
