import { parse as parseHtml } from "node-html-parser";
import { z } from "zod";

export const NEWS_HEADLINES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS news_headlines (
    id TEXT PRIMARY KEY,
    date INTEGER NOT NULL,
    title TEXT NOT NULL,
    important INTEGER NOT NULL,
    posted_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS news_headlines_date ON news_headlines (date);
`;

export type NewsHeadline = z.output<typeof NewsHeadline>;

/** FinancialJuice dates are UTC without a zone because we request `TimeOffset=0`. */
const FjUtcDate = z
  .string()
  .transform(v => `${v}Z`)
  .pipe(z.iso.datetime())
  .transform(v => Date.parse(v));

const FjHeadline = z.object({
  Breaking: z.boolean().default(false),
  DatePublished: FjUtcDate,
  Level: z
    .string()
    .default("")
    .transform(v => v.toLowerCase().trim()),
  NewsID: z.number(),
  Title: z
    .string()
    .transform(v => {
      const FJ_TITLE_PREFIX_REGEX = /^FinancialJuice:\s*/i;

      return htmlToText(v.replace(FJ_TITLE_PREFIX_REGEX, "")).trim();
    })
    .pipe(z.string().min(1)),
});

/** Parses a raw FinancialJuice headline into our `NewsHeadline` shape. */
export const NewsHeadline = FjHeadline.transform(d => {
  const FJ_CRITICAL_LEVEL = "critical";

  return {
    date: d.DatePublished,
    id: d.NewsID.toString(),
    important: d.Breaking || d.Level.includes(FJ_CRITICAL_LEVEL),
    title: d.Title,
  };
});

/** Parses a `news_headlines` row back into our `NewsHeadline` shape. */
export const NewsHeadlineRow = z
  .object({
    date: z.number(),
    id: z.string(),
    important: z.number(),
    title: z.string(),
  })
  .transform((row): NewsHeadline => ({ ...row, important: row.important === 1 }));

/**
 * Convert an HTML fragment to plain text the way DOMParser `body.textContent` does: entities decoded, tags dropped.
 *
 * @example
 * htmlToText("S&amp;P &lt;b&gt;500&lt;/b&gt;"); // "S&P <b>500</b>"
 * htmlToText("<b>Fed</b> holds"); // "Fed holds"
 */
function htmlToText(html: string) {
  return parseHtml(html).textContent;
}
