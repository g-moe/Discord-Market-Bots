const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const { test } = require("node:test");
const discord = require("discord.js");

// Load the compiled modules with test values. Do not connect to Discord.
function loadModule(name, substitutes, env = {}) {
  const filename = path.join(__dirname, "../dist", `${name}.js`);
  const localRequire = createRequire(filename);
  const module = { exports: {} };

  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module,
    exports: module.exports,
    require: name => substitutes[name] ?? localRequire(name),
    process: { env },
  }, { filename });

  return module.exports;
}

function startWizard(flag) {
  const env = { DISCORD_TOKEN: "test-token", DISCORD_CLIENT_ID: "100000000000000000" };
  if (flag !== undefined) env.ENABLE_MESSAGE_CONTENT_INTENT = flag;
  const configModule = loadModule("utils/config", {}, env);
  let client;

  // Keep the SDK's intent handling and event registration; replace network login.
  class TestClient extends discord.Client {
    constructor(options) {
      super(options);
      client = this;
    }

    async login() {
      return "test-token";
    }
  }

  loadModule("index", {
    "discord.js": { ...discord, Client: TestClient },
    "./utils/config": configModule,
    "./utils/logger": { default: { info() {}, debug() {}, warn() {}, error() {} } },
    "./commands": { commands: {} },
    "./utils/deploy": {},
    "./services/news/news-headline": {},
    "./services/news/news-calendar": {},
  });

  return client;
}

test("unset or false flag disables the privileged intent and news message handler", () => {
  for (const flag of [undefined, "false"]) {
    const client = startWizard(flag);
    assert.equal(client.options.intents.has(discord.GatewayIntentBits.MessageContent), false);
    assert.equal(client.listenerCount(discord.Events.MessageCreate), 0);
  }
});

test("true flag enables both the privileged intent and news message handler", () => {
  const client = startWizard("true");
  assert.equal(client.options.intents.has(discord.GatewayIntentBits.MessageContent), true);
  assert.equal(client.listenerCount(discord.Events.MessageCreate), 1);
});

test("both states retain Guilds and GuildMessages", () => {
  for (const flag of ["false", "true"]) {
    const client = startWizard(flag);
    assert.equal(client.options.intents.has(discord.GatewayIntentBits.Guilds), true);
    assert.equal(client.options.intents.has(discord.GatewayIntentBits.GuildMessages), true);
  }
});
