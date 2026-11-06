import { ActivityType, Client, Events, GatewayIntentBits, Guild, Interaction } from "discord.js";
import { commands } from "./commands";
import { setupNewsCalendar } from "./services/news/news-calendar";
import { setupNewsHeadlines } from "./services/news/news-headline";
import { createNewsHeadlineStore } from "./services/news/news-headline-store";
import { config } from "./utils/config";
import { deployCommands, deployCommandsToAll } from "./utils/deploy";
import logger from "./utils/logger";
import { DAY_MS } from "./utils/time";

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const NEWS_HEADLINE_DB_PATH = "./data/market-wiz.db";
const newsHeadlineStore = createNewsHeadlineStore({ dbPath: NEWS_HEADLINE_DB_PATH });

client.on(Events.ClientReady, () => {
  logger.info(`Logged in as ${client.user?.tag}!`);

  setActivity(client);
  deployCommandsToAll();
  setupNewsCalendar(client);
  setupNewsHeadlines({ client, store: newsHeadlineStore });

  setInterval(() => setActivity(client), DAY_MS);
});

client.on(Events.Debug, (m) => logger.debug(m));
client.on(Events.Warn, (m) => logger.warn(m));
client.on(Events.Error, (m) => logger.error(m));

client.on(Events.GuildCreate, async (guild: Guild) => {
  await deployCommands({ guildId: guild.id });
});

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  const DM_COMMAND_MESSAGE = "Commands can only be used in servers, not in DMs.";

  if (!interaction.isChatInputCommand()) {
    return;
  }

  if (!interaction.guild) {
    await interaction.reply({ content: DM_COMMAND_MESSAGE, ephemeral: true });
    return;
  }

  const { commandName } = interaction;
  const command = commands[commandName as keyof typeof commands];
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    logger.error({ err: error, commandName }, "command failed");
  }
});

client.login(config.DISCORD_TOKEN);

/**
 * Set the bot's custom status; `ClientReady` sets it once and then refreshes it every `DAY_MS`.
 *
 * @example
 * setActivity(client);
 */
function setActivity(client: Client) {
  const ACTIVITY_TEXT = "🧙🏻‍♂️ Summoning Market Info";

  client.user?.setActivity(ACTIVITY_TEXT, { type: ActivityType.Custom });
}
