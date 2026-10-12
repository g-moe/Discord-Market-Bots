import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder
} from "discord.js";
import { Bot } from "./types";

export async function createTickerMentionMsg(client: Client, bot: Bot) {
  const appInfo = await client.application?.fetch();
  const tradingviewUrl: string = `https://www.tradingview.com/chart/HIHGAUrW/?theme=dark&symbol=${bot?.symbolName}&interval=5&aff_id=133415`;
  const data = appInfo?.description;
  const dataFields: string[] = (data ?? "").split(",").map(pair => pair.trim());

  const embed = new EmbedBuilder()
    .setColor("#1E1F20")
    .setTimestamp()
    .setFooter({
      text: "Powered by Good Gains", iconURL: "https://cdn.discordapp.com/emojis/1212202807193767976.webp?quality=lossless"
    })

  dataFields.forEach(field => {
    const [key, value] = field.split("=");
    embed.addFields({ name: `**__${key}__**`, value: value, inline: true });
  });

  const openChartButton = new ButtonBuilder()
    .setLabel("Open Chart")
    .setStyle(ButtonStyle.Link)
    .setEmoji("📈")
    .setURL(tradingviewUrl);

  const row = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(openChartButton);

  return { embed, row }
}

