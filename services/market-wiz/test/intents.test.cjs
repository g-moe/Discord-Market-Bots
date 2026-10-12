const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const { test } = require("node:test");
const discord = require("discord.js");

// Run the compiled client with the installed SDK and local network substitutes.
function startWizard(relay = async () => {}) {
  const filename = path.join(__dirname, "../dist/index.js");
  const localRequire = createRequire(filename);
  const logs = [];
  const logger = Object.fromEntries(
    ["info", "debug", "warn", "error"].map(level => [level, (...args) => logs.push({ level, args })])
  );
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
    "./utils/logger": { default: logger },
    "./commands": { commands: {} },
    "./utils/deploy": {},
    "./services/news/news-headline": { newsHeadline: relay },
    "./services/news/news-calendar": {},
  };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    exports: {},
    require: name => substitutes[name] ?? localRequire(name),
  }, { filename });

  return { client, logs };
}

function sourceMessage(overrides = {}) {
  return {
    id: "200000000000000000",
    channelId: "1248771982980284436",
    author: { id: "1240686103959179274" },
    content: "Market news",
    ...overrides,
  };
}

// Await the registered callback so relay errors cannot escape the test.
async function deliver(client, message) {
  for (const handler of client.listeners(discord.Events.MessageCreate)) {
    await handler(message);
  }
}

test("Market Wizard requests Message Content for news, with no Presence or Server Members", () => {
  const { client } = startWizard();
  assert.equal(client.options.intents.bitfield,
    discord.GatewayIntentBits.Guilds | discord.GatewayIntentBits.GuildMessages | discord.GatewayIntentBits.MessageContent);
  assert.equal(client.listenerCount(discord.Events.MessageCreate), 1);
  assert.equal(client.listenerCount(discord.Events.InteractionCreate), 1);
});

test("the news handler forwards only the configured source author and channel", async () => {
  const forwarded = [];
  const { client } = startWizard(async message => forwarded.push(message));
  const source = sourceMessage();

  await deliver(client, source);
  await deliver(client, sourceMessage({ channelId: "another-channel" }));
  await deliver(client, sourceMessage({ author: { id: "another-author" } }));
  assert.deepEqual(forwarded, [source]);
});

test("empty source content is reported and does not produce a news embed", async () => {
  const forwarded = [];
  const { client, logs } = startWizard(async message => forwarded.push(message));
  await deliver(client, sourceMessage({ content: "  " }));

  assert.equal(forwarded.length, 0);
  assert.equal(logs.filter(log => log.level === "warn").length, 1);
});

test("relay failures are logged without an unhandled rejection", async () => {
  const error = new Error("news channel unavailable");
  const { client, logs } = startWizard(async () => { throw error; });
  await deliver(client, sourceMessage());

  assert.equal(logs.filter(log => log.level === "error")[0].args[0].err, error);
});

test("news embeds preserve headlines and send breaking news to both destination channels", async () => {
  const { newsHeadline } = require("../dist/services/news/news-headline");

  for (const content of ["Market news", "🔴 Breaking market news"]) {
    const sent = [];
    const client = {
      guilds: {
        fetch: async guildId => {
          assert.equal(guildId, "668989780398440466");
          return {
            channels: {
              fetch: async channelId => ({
                isTextBased: () => true,
                send: async payload => sent.push({ channelId, embed: payload.embeds[0].toJSON() }),
              }),
            },
          };
        },
      },
    };

    await newsHeadline({ content, client });
    assert.equal(sent[0].channelId, "1214195778088865802");
    assert.equal(sent[0].embed.description, content.replace("🔴", "").trim());
    assert.equal(sent.length, content.includes("🔴") ? 2 : 1);
    if (sent.length === 2) {
      assert.equal(sent[1].channelId, "668989780398440470");
      assert.equal(sent[1].embed.title, "🚨 BREAKING NEWS");
    }
  }
});
