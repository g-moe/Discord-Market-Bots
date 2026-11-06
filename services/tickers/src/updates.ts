import { ActivityType, Client, Guild } from "discord.js";
import { Bot } from "./types";
import logger from "./logger";

const DISCORD_REQUEST_ATTEMPTS = 3;
const DISCORD_REQUEST_TIMEOUT_MS = 10_000;
const RETRYABLE_DISCORD_STATUSES: readonly number[] = [429, 500, 503];

/** Non-2xx Discord API response; fetch resolves these instead of rejecting. */
class DiscordHttpError extends Error {
  constructor(readonly status: number, readonly retryAfter: string | null) {
    super(`Discord application update failed with ${status}`);
  }
}

export async function updateDiscordBot(client: Client, bot: Bot, data: any) {
  const botData = cleanBotData(bot, data)

  // update activity
  if (client.user) {
    client.user.setActivity(`Watching ${botData.activity}`, { type: ActivityType.Custom });
    client.user.setStatus(botData.status);
  }

  // update info in all guilds
  if (client.user) {
    for (const guild of client.guilds.cache.values()) {
      void updateGuildMember({ botData, guild, userId: client.user.id });
    }
  }

  // update bio info
  await updateBotBio(bot, botData)

  logger.debug({ symbol: bot.symbolName }, "finished updating ticker bot")
}

/**
 * Set the bot's nickname and swap its green/red role in one guild.
 * Does not throw; a missing role or a rejected Discord call (e.g. a revoked permission) is logged.
 *
 * @example
 * void updateGuildMember({ botData, guild, userId: client.user.id });
 */
async function updateGuildMember({ botData, guild, userId }: { botData: any; guild: Guild; userId: string }) {
  try {
    const member = await guild.members.fetch(userId);
    await member.setNickname(botData.nameUpdate);

    const roles = await guild.roles.fetch();
    const addRole = roles.find(role => role.name === botData.addRole);
    if (!addRole) {
      logger.warn({ guild: guild.name, role: botData.addRole }, "ticker role not found");
      return;
    }
    await member.roles.add(addRole);

    const removeRole = roles.find(role => role.name === botData.removeRole);
    if (!removeRole) {
      logger.warn({ guild: guild.name, role: botData.removeRole }, "ticker role not found");
      return;
    }
    await member.roles.remove(removeRole);
  } catch (error) {
    logger.error({ err: error, guild: guild.name }, "failed to update ticker bot in guild");
  }
}

function cleanBotData(bot: Bot, data: any): any {
  const botData: any = { ...data };
  botData.nameUpdate = `${bot.symbolNick} - ${data.price}`;
  botData.addRole = parseFloat(data.pct) >= 0 ? "ticker-green" : "ticker-red";
  botData.removeRole = parseFloat(data.pct) >= 0 ? "ticker-red" : "ticker-green";
  botData.activity = parseFloat(data.pct) >= 0 ? `+${data.pct}%` : `${data.pct}%`;
  botData.status = parseFloat(data.pct) >= 0 ? "online" : "dnd"
  return botData;
}

async function updateBotBio(bot: Bot, botData: any): Promise<void> {
  const bioUpdate = [
    `RTH High=${displayValue(botData.rthH)}`,
    `RTH Low=${displayValue(botData.rthL)}`,
    `RTH Open=${displayValue(botData.rthO)}`,
    `YH=${displayValue(botData.yh)}`,
    `YL=${displayValue(botData.yl)}`,
    `YC=${displayValue(botData.yc)}`,
    `ONH=${displayValue(botData.onh)}`,
    `ONL=${displayValue(botData.onl)}`,
    `IBH=${displayValue(botData.ibh)}`,
    `IBL=${displayValue(botData.ibl)}`,
    `VWAP=${displayValue(botData.vwap)}`,
    `RVOL=${displayValue(botData.rvol)}`
  ].join(", ");

  const data: { description: string } = { description: bioUpdate };

  await patchDiscordApplication(bot, data);
}

function displayValue(value: unknown) {
  if (value === undefined || value === null || value === "" || value === "NaN") {
    return "N/A";
  }

  if (typeof value === "number" && Number.isNaN(value)) {
    return "N/A";
  }

  return String(value);
}

function isRetryableDiscordError(error: unknown) {
  if (error instanceof DiscordHttpError) {
    return RETRYABLE_DISCORD_STATUSES.includes(error.status);
  }

  // A fetch aborted by AbortSignal.timeout rejects with a TimeoutError
  return error instanceof Error && error.name === "TimeoutError";
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function patchDiscordApplication(bot: Bot, data: { description: string }) {
  const url: string = `https://discord.com/api/v9/applications/${bot.id}`;
  const headers: { Authorization: string } = {
    Authorization: `Bot ${bot.token}`,
  };

  for (let attempt = 1; attempt <= DISCORD_REQUEST_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(DISCORD_REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new DiscordHttpError(response.status, response.headers.get("retry-after"));
      }

      return;
    } catch (error) {
      if (!isRetryableDiscordError(error) || attempt === DISCORD_REQUEST_ATTEMPTS) {
        logger.warn({
          err: error,
          symbol: bot.symbolName,
          applicationId: bot.id,
          attempt
        }, "failed to update ticker bot description");
        return;
      }

      const retryAfterHeader = error instanceof DiscordHttpError ? error.retryAfter : undefined;
      const retryAfterSeconds = Number(retryAfterHeader ?? attempt);
      const retryDelay = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? retryAfterSeconds * 1000
        : attempt * 1000;

      await sleep(retryDelay);
    }
  }
}
