import { parse as parseHtml } from "node-html-parser";
import { z } from "zod";
import logger from "../../utils/logger";
import { NewsHeadline } from "./news-headline-schema";

/**
 * Fetch the latest FinancialJuice headlines (about 20, newest first) in our `NewsHeadline` shape.
 * Does not retry; the caller handles a rejected promise (network failure, non-2xx status, or a missing token or payload).
 *
 * Widget: `GET https://feed.financialjuice.com/widgets/headlines.aspx` (scraped for the `info` token)
 * API: `GET https://live.financialjuice.com/FJService.asmx/GetPreviousNews` (needs the token, returns JSON wrapped in XML)
 *
 * @see tradester-monorepo `cron_newsService/newsService.ts`, which this ports.
 *
 * @example
 * const headlines = await fetchNewsHeadlines();
 * headlines[0]; // { date: 1793973816073, id: "9840860", important: false, title: "TSMC making plans for 3D DRAM" }
 */
export async function fetchNewsHeadlines(): Promise<readonly NewsHeadline[]> {
  const infoToken = await fetchWidgetInfoToken();
  const items = await fetchHeadlineItems(infoToken);

  return parseNewsHeadlines(items);
}

/**
 * Parse raw FinancialJuice items into headlines.
 * Does not throw; invalid items are logged and skipped.
 *
 * @example
 * parseNewsHeadlines([{ NewsID: 1, Title: "FinancialJuice: Fed holds", DatePublished: "2026-11-06T14:03:36.073" }]);
 * // [{ date: 1793973816073, id: "1", important: false, title: "Fed holds" }]
 */
export function parseNewsHeadlines(items: readonly unknown[]): readonly NewsHeadline[] {
  return items.flatMap(item => {
    const parsed = NewsHeadline.safeParse(item);
    if (!parsed.success) {
      logger.warn({ err: z.prettifyError(parsed.error) }, "skipping invalid FinancialJuice headline");
      return [];
    }

    return [parsed.data];
  });
}

/**
 * Read the `info` token the headlines API requires from the widget page's scripts.
 * Rejects when no script declares `var info = "..."`.
 *
 * @example
 * await fetchWidgetInfoToken(); // "aGVhZGxpbmVz..."
 */
async function fetchWidgetInfoToken(): Promise<string> {
  const HEADLINES_WIDGET_URL = "https://feed.financialjuice.com/widgets/headlines.aspx?wtype=NEWS&mode=table&width=100dvw";
  const WIDGET_INFO_TOKEN_REGEX = /var\s+info\s*=\s*['"]([^'"]*)['"]/;

  const html = await fetchText(HEADLINES_WIDGET_URL);
  const infoToken = parseHtml(html)
    .querySelectorAll("script")
    .map(script => script.textContent.match(WIDGET_INFO_TOKEN_REGEX)?.[1])
    .find(token => token !== undefined);

  if (infoToken === undefined) {
    throw new Error("FinancialJuice widget page did not contain `info` var in any script tag");
  }

  return infoToken;
}

/**
 * Request headlines with the `info` token and unwrap the JSON array from its `<string>` XML wrapper.
 * The JSON is read raw (not XML-decoded); titles are decoded during parsing.
 *
 * @example
 * await fetchHeadlineItems("aGVhZGxpbmVz..."); // [{ NewsID: 9840860, Title: "...", ... }, ...]
 */
async function fetchHeadlineItems(infoToken: string): Promise<readonly unknown[]> {
  const HEADLINES_API_URL = "https://live.financialjuice.com/FJService.asmx/GetPreviousNews";
  const XML_STRING_PAYLOAD_REGEX = /<string[^>]*>([\s\S]*?)<\/string>/;

  const xml = await fetchText(`${HEADLINES_API_URL}${getQueryParamString(encodeURIComponent(infoToken))}`);
  const payload = xml.match(XML_STRING_PAYLOAD_REGEX)?.[1];

  if (payload === undefined) {
    throw new Error("FinancialJuice response did not contain a `<string>` tag");
  }

  return z.array(z.unknown()).parse(JSON.parse(payload));
}

/**
 * Build the `GetPreviousNews` query string; `encodedInfo` must already be URI-encoded.
 *
 * @example
 * getQueryParamString("abc%3D"); // "?info=abc%3D&TimeOffset=0&tabID=0&..."
 */
function getQueryParamString(encodedInfo: string) {
  return `?info=${encodedInfo}&TimeOffset=0&tabID=0&oldID=0&TickerID=0&FeedCompanyID=0&strSearch=%22%22&extraNID=0&full=true`;
}

/**
 * Fetch a URL as text, aborting after `FETCH_TIMEOUT_MS`.
 * Does not retry; rejects on a non-2xx status.
 *
 * @example
 * await fetchText("https://feed.financialjuice.com/widgets/headlines.aspx"); // "<html>..."
 */
async function fetchText(url: string): Promise<string> {
  const FETCH_TIMEOUT_MS = 10_000;

  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`FinancialJuice request failed with ${response.status}: ${url}`);
  }

  return response.text();
}
