const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const { test } = require("node:test");
const discord = require("discord.js");

/**
 * Run the compiled `dist/index.js` with the real discord.js and stand-ins for config, logging, commands, and news services.
 *
 * @example
 * const { client } = startWizard();
 * client.options.intents.bitfield; // GatewayIntentBits.Guilds
 */
function startWizard() {
  const filename = path.join(__dirname, "../dist/index.js");
  const localRequire = createRequire(filename);
  const logger = Object.fromEntries(["info", "debug", "warn", "error"].map(level => [level, () => {}]));
  let client;

  class TestClient extends discord.Client {
    constructor(options) {
      super(options);
      client = this;
    }

    async login() {
      return "test-token";
    }
  }

  const substitutes = {
    "discord.js": { ...discord, Client: TestClient },
    "./utils/config": { config: { DISCORD_TOKEN: "test-token", DISCORD_CLIENT_ID: "100000000000000000" } },
    "./utils/logger": { __esModule: true, default: logger },
    "./commands": { commands: {} },
    "./utils/deploy": {},
    "./services/news/news-headline": {},
    "./services/news/news-headline-store": { createNewsHeadlineStore: () => ({}) },
    "./services/news/news-calendar": {},
  };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    exports: {},
    require: name => substitutes[name] ?? localRequire(name),
  }, { filename });

  return { client };
}

test("Market Wizard requests only the Guilds intent and reads no messages", () => {
  const { client } = startWizard();
  assert.equal(client.options.intents.bitfield, discord.GatewayIntentBits.Guilds);
  assert.equal(client.listenerCount(discord.Events.MessageCreate), 0);
  assert.equal(client.listenerCount(discord.Events.InteractionCreate), 1);
});
