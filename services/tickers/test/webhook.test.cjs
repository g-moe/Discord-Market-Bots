const assert = require("node:assert/strict");
const { once } = require("node:events");
const { test } = require("node:test");
const { loadModule } = require("./load-module.cjs");

const SECRET = "test-secret";

/**
 * Start the compiled webhook server on a free port; `received` collects every update handed to `onTickerUpdate`.
 *
 * @example
 * const { post, received, close } = await startServer();
 */
async function startServer() {
  const logs = [];
  const logger = Object.fromEntries(
    ["info", "debug", "warn", "error"].map(level => [level, (...args) => logs.push({ level, args })])
  );
  const { startWebhookServer, WEBHOOK_PATH } = loadModule("webhook", {
    "./logger": { __esModule: true, default: logger },
  }, { JSON });

  const received = [];
  const server = startWebhookServer({ onTickerUpdate: async data => { received.push(data); }, port: 0, secret: SECRET });
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  return {
    WEBHOOK_PATH,
    close: () => new Promise(resolve => server.close(resolve)),
    logs,
    post: (path, body) => fetch(`${baseUrl}${path}`, { method: "POST", body, headers: { "Content-Type": "application/json" } }),
    received,
    request: (path, init) => fetch(`${baseUrl}${path}`, init),
  };
}

test("an authorized TradingView update is accepted and handed to the ticker update", async () => {
  const { WEBHOOK_PATH, close, post, received } = await startServer();
  const update = { Authorization: SECRET, stocks: [{ symbol: "ES", price: 5000, pct: 0.4 }] };

  const response = await post(WEBHOOK_PATH, JSON.stringify(update));
  await new Promise(resolve => setImmediate(resolve));
  await close();

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "Webhook received successfully");
  assert.deepEqual(received, [update]);
});

test("a wrong secret, bad JSON, wrong path, or wrong method is rejected and logged without an update", async () => {
  const { WEBHOOK_PATH, close, logs, post, received, request } = await startServer();

  const statuses = [
    (await post(WEBHOOK_PATH, JSON.stringify({ Authorization: "wrong", stocks: [] }))).status,
    (await post(WEBHOOK_PATH, JSON.stringify({ stocks: [] }))).status,
    (await post(WEBHOOK_PATH, "not json")).status,
    (await post("/heartbeat", JSON.stringify({ Authorization: SECRET }))).status,
    (await request(WEBHOOK_PATH, { method: "GET" })).status,
  ];
  await close();

  assert.deepEqual(statuses, [401, 401, 400, 404, 405]);
  assert.deepEqual(received, []);
  assert.deepEqual(logs.filter(log => log.level === "warn").map(log => log.args[0].status), statuses);
});
