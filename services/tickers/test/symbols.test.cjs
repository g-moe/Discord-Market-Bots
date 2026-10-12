const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const { test } = require("node:test");
const vm = require("node:vm");

// Run the compiled controller with a local Redis subscription and update sink.
async function deliverUpdate(configuredSymbol, receivedSymbol) {
  const filename = path.join(__dirname, "../dist/redis.js");
  const localRequire = createRequire(filename);
  const exports = {};
  const updates = [];
  const summaries = [];
  const bot = { id: "test-bot", symbolName: configuredSymbol, symbolNick: "test", token: "test-token" };
  const client = {};
  let receive;

  const substitutes = {
    redis: {
      createClient: () => ({
        on() {},
        connect: async () => {},
        subscribe: async (channel, callback) => {
          assert.equal(channel, "ticker_updates");
          receive = callback;
        },
      }),
    },
    "./updates": { updateDiscordBot: async (...args) => updates.push(args) },
    "./pingStatus": { pingHeartbeat: async () => {} },
    "./logger": { default: { debug() {}, error() {}, info: summary => summaries.push(summary) } },
  };

  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    exports,
    process: { env: {} },
    require: name => substitutes[name] ?? localRequire(name),
  }, { filename });

  // Deliver the observed YM values through the actual subscription callback.
  await exports.botController([{ client, bot }]);
  await receive(JSON.stringify({ stocks: [{ symbol: receivedSymbol, price: 52070, pct: "0.28" }] }), "ticker_updates");
  return { updates, summaries, client, bot };
}

test("the observed CBOT YM webhook reaches a CBOT_MINI YM client", async () => {
  const { updates, summaries, client, bot } = await deliverUpdate("CBOT_MINI:YM1!", "CBOT:YM1!");

  assert.equal(updates.length, 1);
  assert.equal(updates[0][0], client);
  assert.equal(updates[0][1], bot);
  assert.equal(updates[0][2].price, 52070);
  assert.equal(updates[0][2].pct, "0.28");
  assert.equal(summaries[0].updatedCount, 1);
});

test("both YM names continue to route when they match exactly", async () => {
  for (const symbol of ["CBOT_MINI:YM1!", "CBOT:YM1!"]) {
    assert.equal((await deliverUpdate(symbol, symbol)).updates.length, 1);
  }
});

test("the YM exchange alias works in the reverse direction", async () => {
  assert.equal((await deliverUpdate("CBOT:YM1!", "CBOT_MINI:YM1!")).updates.length, 1);
});

test("different YM contracts, micro contracts, and unknown prefixes remain unmatched", async () => {
  for (const symbol of ["CBOT:YM2!", "CBOT:MYM1!", "UNKNOWN:YM1!"]) {
    assert.equal((await deliverUpdate("CBOT_MINI:YM1!", symbol)).updates.length, 0);
  }
});

test("other ticker symbols still require an exact match", async () => {
  assert.equal((await deliverUpdate("CME_MINI:ES1!", "CME_MINI:ES1!")).updates.length, 1);
  assert.equal((await deliverUpdate("CME_MINI:ES1!", "OTHER:ES1!")).updates.length, 0);
});

test("missing or non-string symbols do not match YM", async () => {
  for (const symbol of [undefined, null, 123, {}]) {
    assert.equal((await deliverUpdate("CBOT_MINI:YM1!", symbol)).updates.length, 0);
  }
});
