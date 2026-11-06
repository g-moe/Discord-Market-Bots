import * as fs from "fs";
import * as path from "path";
import pino from "pino";

const LOG_DIR = "./logs";

fs.mkdirSync(LOG_DIR, { recursive: true });

const streams = [
  {
    level: "info",
    stream: fs.createWriteStream(path.join(LOG_DIR, "app.log"), { flags: "a" }),
  },
  {
    level: "error",
    stream: fs.createWriteStream(path.join(LOG_DIR, "error.log"), { flags: "a" }),
  },
  {
    level: "info",
    stream: process.stdout,
  },
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
