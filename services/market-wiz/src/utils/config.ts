const { DISCORD_TOKEN, DISCORD_CLIENT_ID } = process.env;

if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID) {
  throw new Error("Missing environment variables");
}

export const config = {
  DISCORD_TOKEN,
  DISCORD_CLIENT_ID,
  ENABLE_MESSAGE_CONTENT_INTENT: process.env.ENABLE_MESSAGE_CONTENT_INTENT === "true",
};
