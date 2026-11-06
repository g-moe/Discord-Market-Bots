const assert = require("node:assert/strict");
const { test } = require("node:test");
const { loadModule } = require("./load-module.cjs");

const BOT = { id: "100000000000000000", token: "test-token", symbolName: "ES", symbolNick: "ES" };
const APPLICATION_URL = `https://discord.com/api/v9/applications/${BOT.id}`;
const SECOND_MS = 1000;

/**
 * Load `updates` with a scripted `fetch`, an instant `setTimeout` that records each delay, and a recording logger.
 * `responses` are returned in order; an `Error` entry is thrown instead.
 *
 * @example
 * const { calls, delays, logs, updateDiscordBot } = loadUpdates([new Response(null, { status: 200 })]);
 */
function loadUpdates(responses) {
  const calls = [];
  const delays = [];
  const logs = [];
  const logger = Object.fromEntries(
    ["info", "debug", "warn", "error"].map(level => [level, (...args) => logs.push({ level, args })])
  );

  const { updateDiscordBot } = loadModule("updates", { "./logger": { __esModule: true, default: logger } }, {
    AbortSignal,
    Error,
    fetch: async (url, init) => {
      calls.push({ url, method: init.method });
      const next = responses[calls.length - 1];
      if (next instanceof Error) throw next;
      return next;
    },
    setTimeout: (callback, ms) => {
      delays.push(ms);
      callback();
    },
  });

  return { calls, delays, logs, updateDiscordBot };
}

/**
 * A client with no guilds whose presence updates are ignored, plus any `guilds` given.
 *
 * @example
 * fakeClient([failingGuild]);
 */
function fakeClient(guilds = []) {
  return {
    user: { id: BOT.id, setActivity: () => {}, setStatus: () => {} },
    guilds: { cache: new Map(guilds.map(guild => [guild.name, guild])) },
  };
}

const UPDATE = { price: 100, pct: 1.25 };

test("a 429 waits for retry-after and then retries the description update", async () => {
  const { calls, delays, logs, updateDiscordBot } = loadUpdates([
    new Response(null, { status: 429, headers: { "retry-after": "2" } }),
    new Response(null, { status: 200 }),
  ]);

  await updateDiscordBot(fakeClient(), BOT, UPDATE);

  assert.deepEqual(calls, [{ url: APPLICATION_URL, method: "PATCH" }, { url: APPLICATION_URL, method: "PATCH" }]);
  assert.deepEqual(delays, [2 * SECOND_MS]);
  assert.equal(logs.filter(log => log.level === "warn").length, 0);
});

test("a 401 is not retried and is logged once", async () => {
  const { calls, delays, logs, updateDiscordBot } = loadUpdates([new Response(null, { status: 401 })]);

  await updateDiscordBot(fakeClient(), BOT, UPDATE);

  assert.equal(calls.length, 1);
  assert.deepEqual(delays, []);
  const warnings = logs.filter(log => log.level === "warn");
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].args[0].err.status, 401);
});

test("timeouts are retried with a growing delay until attempts run out", async () => {
  const timeout = Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
  const { calls, delays, logs, updateDiscordBot } = loadUpdates([timeout, timeout, timeout]);

  await updateDiscordBot(fakeClient(), BOT, UPDATE);

  assert.equal(calls.length, 3);
  assert.deepEqual(delays, [1 * SECOND_MS, 2 * SECOND_MS]);
  assert.equal(logs.filter(log => log.level === "warn")[0].args[0].attempt, 3);
});

test("a guild that rejects the nickname change is logged without an unhandled rejection", async () => {
  const permissionError = new Error("Missing Permissions");
  const guild = {
    name: "no-nickname-permission",
    members: { fetch: async () => ({ setNickname: async () => { throw permissionError; } }) },
  };
  const { logs, updateDiscordBot } = loadUpdates([new Response(null, { status: 200 })]);

  await updateDiscordBot(fakeClient([guild]), BOT, UPDATE);
  await new Promise(resolve => setImmediate(resolve));

  const errors = logs.filter(log => log.level === "error");
  assert.equal(errors.length, 1);
  assert.equal(errors[0].args[0].err, permissionError);
  assert.equal(errors[0].args[0].guild, guild.name);
});
