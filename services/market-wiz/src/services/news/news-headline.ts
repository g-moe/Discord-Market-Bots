import { EmbedBuilder, Message } from "discord.js";

export async function newsHeadline(message: Message, ) {
  const embed: EmbedBuilder = new EmbedBuilder();
  embed.setTimestamp();
  embed.setFooter({ 
    text: "Powered by Financial Juice",
    iconURL: "https://cdn.discordapp.com/avatars/1240686103959179274/f2f09abc9a9416a72961869bd7108cef.webp?size=160"
  });

  const isImportant = message.content.includes("🔴");
  switch (isImportant) {
  case true:
    embed.setTitle("🚨 BREAKING NEWS");
    embed.setColor(0xFF0000);
    embed.setDescription(message.content.replace("🔴", "").trim());
    break;

  case false:
    embed.setColor(0x808080);
    embed.setDescription(message.content);
    break;
  }

  // post the embed to the news channel
  const guild = await message.client.guilds.fetch("668989780398440466");
  const newsChannel = await guild.channels.fetch("1214195778088865802");
  if (newsChannel && newsChannel.isTextBased()) {
    await newsChannel.send({ embeds: [embed] });
  }

  // post important news to the trading chat
  if (isImportant) {
    const tradingChat = await guild.channels.fetch("668989780398440470");
    if (tradingChat && tradingChat.isTextBased()) {
      await tradingChat.send({ embeds: [embed] });
    }
  }
}

