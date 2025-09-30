import axios from "axios";
import logger from "./logger";

/**
 * Sends a heartbeat ping to BetterStack uptime monitoring
 */
export async function pingHeartbeat(): Promise<void> {
  try {
    const heartbeatUrl = process.env.UPTIME_HEARTBEAT_URL;

    if (!heartbeatUrl) {
      logger.warn("UPTIME_HEARTBEAT_URL environment variable is not set");
      return;
    }

    await axios.post(heartbeatUrl);
    logger.debug("Uptime ping sent successfully");
  } catch (error) {
    logger.error("Failed to send uptime ping:", error);
  }
}
