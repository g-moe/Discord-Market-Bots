const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const { test } = require("node:test");
const vm = require("node:vm");
const discord = require("discord.js");

const bots = ["BTC", "ES", "NQ", "VIX", "DXY", "RTY", "YM", "UB", "GC", "CL"].map(
  (symbol, index) => ({
    id: String(100000000000000000n + BigInt(index)),
    token: `test-token-${index}`,
    symbolName: symbol,
    symbolNick: symbol,
  })
);

// Load the compiled service with local substitutes for network and storage access.
function loadModule(name, substitutes) {
  const filename = path.join(__dirname, "../dist", `${name}.js`);
  const localRequire = createRequire(filename);
  const module = { exports: {} };

  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    exports: module.exports,
    module,
    require: name => substitutes[name] ?? localRequire(name),
    console,
    setTimeout,
  }, { filename });

  return module.exports;
}

function startTickers() {
  const clients = [];
  const logs = [];
  const logger = Object.fromEntries(
    ["info", "debug", "warn", "error"].map(level => [level, (...args) => logs.push({ level, args })])
  );

  // Use the installed SDK for intents, parsed mentions, embeds, and presence packets.
  class TestClient extends discord.Client {
    constructor(options) {
      super(options);
      this.packets = [];
      this.ws.broadcast = packet => this.packets.push(packet);
      clients.push(this);
    }

    async login(token) {
      const bot = bots.find(bot => bot.token === token);
      this.user = new discord.ClientUser(this, {
        id: bot.id, username: bot.symbolNick, discriminator: "0", bot: true,
      });
      this.application = { fetch: async () => ({ description: "RTH High=100, VWAP=99" }) };
      this.emit(discord.Events.ClientReady);
      return token;
    }
  }

  loadModule("index", {
    fs: { readFileSync: () => JSON.stringify({ bots }) },
    "discord.js": { ...discord, Client: TestClient },
    "./redis": { botController: async () => {} },
    "./logger": { default: logger },
  });

  return { clients, logs, logger };
}

function makeMessage(client, content, { mentioned = true, replyToTicker = false } = {}) {
  const message = new discord.Message(client, {
    id: "200000000000000000",
    channel_id: "300000000000000000",
    guild_id: "400000000000000000",
    content,
    mentions: mentioned ? [{ id: client.user.id, username: "ticker", discriminator: "0" }] : [],
    mention_roles: [],
    mention_everyone: false,
    attachments: [],
    embeds: [],
    referenced_message: replyToTicker ? {
      id: "200000000000000001",
      channel_id: "300000000000000000",
      author: { id: client.user.id, username: "ticker", discriminator: "0", bot: true },
      content: "Ticker data",
      mentions: [],
      attachments: [],
      embeds: [],
    } : undefined,
  });
  message.replies = [];
  message.reply = async payload => message.replies.push(payload);
  return message;
}

// Await the registered handler so rejected replies and embed requests are observable.
async function deliver(client, message) {
  for (const handler of client.listeners(discord.Events.MessageCreate)) {
    await handler(message);
  }
}

test("all ten tickers request only Guilds and GuildMessages", () => {
  const { clients } = startTickers();
  const expected = discord.GatewayIntentBits.Guilds | discord.GatewayIntentBits.GuildMessages;

  assert.equal(clients.length, 10);
  for (const client of clients) {
    assert.equal(client.options.intents.bitfield, expected);
  }
});

test("all ten tickers reply to regular and nickname mentions without Message Content", async () => {
  const { clients, logs } = startTickers();

  for (const client of clients) {
    for (const content of [`<@${client.user.id}>`, `<@!${client.user.id}>`]) {
      const message = makeMessage(client, content);
      await deliver(client, message);

      assert.equal(message.replies.length, 1);
      const reply = message.replies[0];
      assert.equal(reply.embeds[0].toJSON().fields[0].value, "100");
      assert.equal(reply.components[0].toJSON().components[0].label, "Open Chart");
    }
  }

  assert.equal(JSON.stringify(logs).includes("<@"), false);
});

test("tickers ignore messages with empty content and no direct mention", async () => {
  const { clients } = startTickers();

  for (const client of clients) {
    const message = makeMessage(client, "", { mentioned: false });
    await deliver(client, message);
    assert.equal(message.replies.length, 0);
  }
});

test("tickers ignore a reply ping without an explicit user mention", async () => {
  const { clients } = startTickers();

  for (const client of clients) {
    // A reply ping puts the recipient in API mentions without adding mention text.
    const message = makeMessage(client, "Thanks", { replyToTicker: true });
    assert.equal(message.mentions.users.has(client.user.id), true);
    assert.equal(message.mentions.parsedUsers.has(client.user.id), false);

    await deliver(client, message);
    assert.equal(message.replies.length, 0);
  }
});

test("explicit regular and nickname mentions still work in replies", async () => {
  const { clients } = startTickers();

  for (const client of clients) {
    for (const content of [`<@${client.user.id}>`, `<@!${client.user.id}>`]) {
      const message = makeMessage(client, content, { replyToTicker: true });
      await deliver(client, message);
      assert.equal(message.replies.length, 1);
    }
  }
});

test("reply and application-fetch failures are logged without an unhandled rejection", async () => {
  const { clients, logs } = startTickers();
  const client = clients[0];
  const replyError = new Error("reply failed");
  const fetchError = new Error("application fetch failed");
  const message = makeMessage(client, `<@${client.user.id}>`);
  message.reply = async () => { throw replyError; };

  await deliver(client, message);
  client.application.fetch = async () => { throw fetchError; };
  await deliver(client, makeMessage(client, `<@${client.user.id}>`));

  assert.deepEqual(logs.filter(log => log.level === "error").map(log => log.args[0]), [replyError, fetchError]);
});

test("all ten tickers still send positive and negative status updates without privileged intents", async () => {
  const { clients, logger } = startTickers();
  const { updateDiscordBot } = loadModule("updates", {
    axios: { default: { patch: async () => {} }, isAxiosError: () => false },
    "./logger": { default: logger },
  });

  for (const [index, client] of clients.entries()) {
    for (const [pct, status, activity] of [[1.25, "online", "Watching +1.25%"], [-0.5, "dnd", "Watching -0.5%"]]) {
      await updateDiscordBot(client, bots[index], { price: 100, pct });
      const packet = client.packets.at(-1);

      assert.equal(packet.op, 3);
      assert.equal(packet.d.status, status);
      assert.equal(packet.d.activities[0].type, discord.ActivityType.Custom);
      assert.equal(packet.d.activities[0].state, activity);
    }
  }
});
