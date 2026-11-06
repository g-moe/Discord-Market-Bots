import * as path from "path";
import pino from "pino";

const LOG_DIR = "./logs";

/**
 * A pino-roll file transport that starts a new file daily or at 100 MB and keeps the 7 newest, older runs included.
 *
 * @example
 * rollingFile("app"); // writes ./logs/app.2026-11-06.1.log
 */
function rollingFile(name: string) {
  return pino.transport({
    target: "pino-roll",
    options: {
      file: path.join(LOG_DIR, name),
      frequency: "daily",
      size: "100m",
      dateFormat: "yyyy-MM-dd",
      limit: { count: 7, removeOtherLogFiles: true },
      mkdir: true,
    },
  });
}

const streams: pino.StreamEntry[] = [
  { level: "info", stream: rollingFile("app") },
  { level: "error", stream: rollingFile("error") },
  { level: "info", stream: process.stdout },
];

const logger = pino(
  {
    level: "info",
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      bindings: () => {
        return {};
      },
      level: (label) => {
        return { severity: label.toUpperCase() };
      },
    },
  },

  pino.multistream(streams)
);

export default logger;
