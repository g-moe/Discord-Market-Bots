import { REST, Routes } from "discord.js";
import { commands } from "../commands";
import { config } from "./config";
import logger from "./logger";

/**
 * Register the slash commands in one guild, which takes effect immediately.
 * Does not throw; failures are logged.
 *
 * @example
 * await deployCommands({ guildId: guild.id });
 */
export async function deployCommands({ guildId }: { guildId: string }) {
  await putCommands(Routes.applicationGuildCommands(config.DISCORD_CLIENT_ID, guildId));
}

/**
 * Register the slash commands globally for every guild the bot is in.
 * Does not throw; failures are logged.
 *
 * @example
 * await deployCommandsToAll();
 */
export async function deployCommandsToAll() {
  await putCommands(Routes.applicationCommands(config.DISCORD_CLIENT_ID));
}

/**
 * Replace the commands registered at `route` with the current command list.
 * Does not throw; failures are logged.
 *
 * @example
 * await putCommands(Routes.applicationCommands(config.DISCORD_CLIENT_ID));
 */
async function putCommands(route: `/${string}`) {
  const DISCORD_API_VERSION = "10";
  const commandsData = Object.values(commands).map(command => command.data);
  const rest = new REST({ version: DISCORD_API_VERSION }).setToken(config.DISCORD_TOKEN);

  try {
    logger.info("Started refreshing application (/) commands.");
    await rest.put(route, { body: commandsData });
    logger.info("Successfully reloaded application (/) commands.");
  } catch (error) {
    logger.error(error);
  }
}
