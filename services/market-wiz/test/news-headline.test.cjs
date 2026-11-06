const assert = require("node:assert/strict");
const { test } = require("node:test");
const { parseNewsHeadlines } = require("../dist/services/news/news-headline-fetch");
const { createNewsHeadlineStore } = require("../dist/services/news/news-headline-store");
const { checkNewsHeadlines, cleanupNewsHeadlines } = require("../dist/services/news/news-headline");

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const NOW = Date.parse("2026-11-06T14:05:00.000Z");
const GUILD_ID = "668989780398440466";
const NEWS_CHANNEL_ID = "1214195778088865802";
const TRADING_CHANNEL_ID = "668989780398440470";

/**
 * A one-minute-old general headline, with `overrides` applied.
 *
 * @example
 * headline({ id: "2", important: true }); // { date: NOW - MINUTE_MS, id: "2", important: true, title: "Market news" }
 */
function headline(overrides = {}) {
  return { date: NOW - MINUTE_MS, id: "1", important: false, title: "Market news", ...overrides };
}

/**
 * Discord client double that records each send; sends to `failingChannelIds` reject.
 *
 * @example
 * const { client, sent } = fakeClient({ failingChannelIds: [NEWS_CHANNEL_ID] });
 */
function fakeClient({ failingChannelIds = [] } = {}) {
  const sent = [];
  const client = {
    guilds: {
      fetch: async guildId => {
        assert.equal(guildId, GUILD_ID);
        return {
          channels: {
            fetch: async channelId => ({
              isTextBased: () => true,
              send: async payload => {
                if (failingChannelIds.includes(channelId)) throw new Error("channel unavailable");
                sent.push({ channelId, embed: payload.embeds[0].toJSON() });
              },
            }),
          },
        };
      },
    },
  };

  return { client, sent };
}

test("raw FinancialJuice items normalize, titles decode like tradester, and invalid items are skipped", () => {
  const parsed = parseNewsHeadlines([
    { NewsID: 9840860, Title: "FinancialJuice: S&P futures rise", DatePublished: "2026-11-06T14:03:36.073", Breaking: false, Level: "" },
    { NewsID: 9840861, Title: "Fed holds", DatePublished: "2026-11-06T14:04:00", Breaking: false, Level: "active active-critical" },
    { NewsID: 9840862, Title: "Breaking", DatePublished: "2026-11-06T14:04:30", Breaking: true },
    { NewsID: 9840863, Title: "FinancialJuice: S&amp;P &lt;b&gt;500&lt;/b&gt; &mdash; <b>Fed&#39;s</b> call", DatePublished: "2026-11-06T14:04:40" },
    { NewsID: 0, Title: "", DatePublished: "" },
  ]);

  assert.deepEqual(parsed, [
    { date: Date.parse("2026-11-06T14:03:36.073Z"), id: "9840860", important: false, title: "S&P futures rise" },
    { date: Date.parse("2026-11-06T14:04:00Z"), id: "9840861", important: true, title: "Fed holds" },
    { date: Date.parse("2026-11-06T14:04:30Z"), id: "9840862", important: true, title: "Breaking" },
    { date: Date.parse("2026-11-06T14:04:40Z"), id: "9840863", important: false, title: "S&P <b>500</b> — Fed's call" },
  ]);
});

test("each fresh headline posts once; stale and already seen headlines do not post", async () => {
  const store = createNewsHeadlineStore({ dbPath: ":memory:" });
  const { client, sent } = fakeClient();
  const fetched = [
    headline({ id: "fresh", title: "Fresh" }),
    headline({ id: "stale", date: NOW - 6 * MINUTE_MS, title: "Stale" }),
  ];
  const fetchHeadlines = async () => fetched;

  await checkNewsHeadlines({ client, fetchHeadlines, now: NOW, store });
  await checkNewsHeadlines({ client, fetchHeadlines, now: NOW + MINUTE_MS, store });

  assert.deepEqual(sent.map(s => s.embed.description), ["Fresh"]);
});

test("fresh headlines post oldest first and important ones also reach the trading chat", async () => {
  const store = createNewsHeadlineStore({ dbPath: ":memory:" });
  const { client, sent } = fakeClient();
  const fetchHeadlines = async () => [
    headline({ id: "2", date: NOW - MINUTE_MS, important: true, title: "Fed holds" }),
    headline({ id: "1", date: NOW - 2 * MINUTE_MS, title: "Market news" }),
  ];

  await checkNewsHeadlines({ client, fetchHeadlines, now: NOW, store });

  assert.deepEqual(sent.map(s => [s.channelId, s.embed.description]), [
    [NEWS_CHANNEL_ID, "Market news"],
    [NEWS_CHANNEL_ID, "Fed holds"],
    [TRADING_CHANNEL_ID, "Fed holds"],
  ]);
  assert.equal(sent[0].embed.title, undefined);
  assert.equal(sent[1].embed.title, "🚨 BREAKING NEWS");
  assert.equal(sent[1].embed.timestamp, new Date(NOW - MINUTE_MS).toISOString());
});

test("a headline every channel rejected retries while fresh", async () => {
  const store = createNewsHeadlineStore({ dbPath: ":memory:" });
  const failing = fakeClient({ failingChannelIds: [NEWS_CHANNEL_ID] });
  const working = fakeClient();
  const fetchHeadlines = async () => [headline()];

  await checkNewsHeadlines({ client: failing.client, fetchHeadlines, now: NOW, store });
  await checkNewsHeadlines({ client: working.client, fetchHeadlines, now: NOW + MINUTE_MS, store });
  await checkNewsHeadlines({ client: working.client, fetchHeadlines, now: NOW + 2 * MINUTE_MS, store });

  assert.equal(failing.sent.length, 0);
  assert.equal(working.sent.length, 1);
});

test("a headline one channel accepted is not posted again", async () => {
  const store = createNewsHeadlineStore({ dbPath: ":memory:" });
  const partial = fakeClient({ failingChannelIds: [TRADING_CHANNEL_ID] });
  const working = fakeClient();
  const fetchHeadlines = async () => [headline({ important: true })];

  await checkNewsHeadlines({ client: partial.client, fetchHeadlines, now: NOW, store });
  await checkNewsHeadlines({ client: working.client, fetchHeadlines, now: NOW + MINUTE_MS, store });

  assert.deepEqual(partial.sent.map(s => s.channelId), [NEWS_CHANNEL_ID]);
  assert.equal(working.sent.length, 0);
});

test("cleanup deletes headlines older than 3 days and keeps them deduped until then", async () => {
  const store = createNewsHeadlineStore({ dbPath: ":memory:" });
  store.insertUnseen([
    headline({ id: "old", date: NOW - 3 * DAY_MS - 1 }),
    headline({ id: "kept", date: NOW - 3 * DAY_MS }),
  ]);

  assert.equal(cleanupNewsHeadlines({ now: NOW, store }), 1);
  assert.equal(store.insertUnseen([headline({ id: "kept", date: NOW - 3 * DAY_MS })]), 0);
  assert.equal(store.insertUnseen([headline({ id: "old", date: NOW - 3 * DAY_MS - 1 })]), 1);
});
