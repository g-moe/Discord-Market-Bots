import logger from "../../utils/logger";
import { DAY_MS, HOUR_MS, MINUTE_MS, SECOND_MS } from "../../utils/time";

export type CountryOptions = typeof countryOptions[keyof typeof countryOptions];

export type FetchNewsParams = {
  country: CountryOptions;
  timeframe: TimeframeOptions;
  importance: ImportanceOptions;
};

export type ImportanceOptions = typeof importanceOptions[keyof typeof importanceOptions];

export type NewsEvent = {
  isScoreTrackable: null,
  id: string,
  eventId: string,
  dateUtc: string,
  periodDateUtc: string,
  periodType: string,
  actual: null,
  revised: null,
  consensus: null,
  ratioDeviation: null,
  previous: number,
  isBetterThanExpected: null,
  name: string,
  countryCode: string,
  currencyCode: string,
  unit: null,
  potency: string,
  volatility: string,
  isAllDay: boolean,
  isTentative: boolean,
  isPreliminary: boolean,
  isReport: boolean,
  isSpeech: boolean,
  lastUpdated: number,
  previousIsPreliminary: boolean,
  categoryId: string
}

export type TimeframeOptions = typeof timeframeOptions[keyof typeof timeframeOptions];

export const countryOptions = {
  US: "USA",
} as const;

/**
 * Fetch FXStreet economic calendar events for the selected country, timeframe, and importance.
 * Does not throw; logs the failure and returns `null` when the request fails after retries.
 *
 * API: `GET https://calendar-api.fxstreet.com/en/api/v2/eventDates/{start}/{end}`
 *
 * @example
 * const events = await fetchNewsData({ country: "USA", timeframe: "Next 24 hours", importance: "🔴" });
 * events?.[0].name; // "Fed's Bowman speech"
 */
export async function fetchNewsData(params: FetchNewsParams) {
  const url = createNewsUrl(params);

  try {
    const data = await requestNewsData(url);

    return filterNewsData(data, params);
  } catch (error) {
    logger.warn({
      err: error,
      url,
      country: params.country,
      timeframe: params.timeframe,
      importance: params.importance
    }, "FXStreet calendar request failed");
    return null;
  }
}

export const importanceOptions = {
  High: "🔴",
  Medium: "🔴🟠",
  All: "🔴🟠🟡",
} as const;

export const timeframeOptions = {
  "5": "Next 5 minutes",
  "6": "Next 6 hours",
  "24": "Next 24 hours",
  "48": "Next 48 hours",
  "168": "Next 7 days",
} as const;

const CALENDAR_VOLATILITIES: readonly string[] = ["LOW", "MEDIUM", "HIGH"];
/**
 * Build the calendar URL for today (local midnight) through `CALENDAR_LOOKAHEAD_DAYS` ahead.
 *
 * @example
 * createNewsUrl({ country: "USA", timeframe: "Next 6 hours", importance: "🔴" });
 * // "https://calendar-api.fxstreet.com/en/api/v2/eventDates/2026-11-06T05:00:00Z/2026-11-13T05:00:00Z?&volatilities=LOW&..."
 */
function createNewsUrl(params: FetchNewsParams) {
  const CALENDAR_API_URL = "https://calendar-api.fxstreet.com/en/api/v2/eventDates";
  const CALENDAR_LOOKAHEAD_DAYS = 7;
  const CALENDAR_CATEGORIES: readonly string[] = [
    "8896AA26-A50C-4F8B-AA11-8B3FCCDA1DFD",
    "FA6570F6-E494-4563-A363-00D0F2ABEC37",
    "C94405B5-5F85-4397-AB11-002A481C4B92",
    "E229C890-80FC-40F3-B6F4-B658F3A02635",
    "24127F3B-EDCE-4DC4-AFDF-0B3BD8A964BE",
    "DD332FD3-6996-41BE-8C41-33F277074FA7",
    "7DFAEF86-C3FE-4E76-9421-8958CC2F9A0D",
    "1E06A304-FAC6-440C-9CED-9225A6277A55",
    "33303F5E-1E3C-4016-AB2D-AC87E98F57CA",
    "9C4A731A-D993-4D55-89F3-DC707CC1D596",
    "91DA97BD-D94A-4CE8-A02B-B96EE2944E4C",
    "E9E957EC-2927-4A77-AE0C-F5E4B5807C16"
  ];

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + CALENDAR_LOOKAHEAD_DAYS);

  const queryParams = new URLSearchParams([
    ...CALENDAR_VOLATILITIES.map(volatility => ["volatilities", volatility]),
    ["countries", getCountryCode(params.country)],
    ...CALENDAR_CATEGORIES.map(category => ["categories", category]),
  ]);

  return `${CALENDAR_API_URL}/${toIsoSeconds(start)}/${toIsoSeconds(end)}?&${queryParams.toString()}`;
}

/**
 * Look up the country code (`countryOptions` key) for a country name; empty when unknown.
 *
 * @example
 * getCountryCode("USA"); // "US"
 */
function getCountryCode(country: CountryOptions): string {
  return Object.keys(countryOptions).find(key => countryOptions[key as keyof typeof countryOptions] === country) || "";
}

/**
 * Format a date as a UTC ISO string without milliseconds, as the calendar API expects.
 *
 * @example
 * toIsoSeconds(new Date("2026-11-06T05:00:00.000Z")); // "2026-11-06T05:00:00Z"
 */
function toIsoSeconds(date: Date) {
  return `${date.toISOString().slice(0, -5)}Z`;
}

/**
 * Request calendar events, retrying temporary failures with a linear backoff.
 * Rejects with the last error once `REQUEST_ATTEMPTS` is reached or the failure is not temporary.
 *
 * @example
 * await requestNewsData("https://calendar-api.fxstreet.com/en/api/v2/eventDates/..."); // [{ name: "Nonfarm Payrolls", ... }]
 */
async function requestNewsData(url: string): Promise<NewsEvent[]> {
  const FXSTREET_HEADERS = {
    "accept": "application/json",
    "accept-language": "en-US,en;q=0.9",
    "cache-control": "no-cache",
    "dnt": "1",
    "origin": "https://www.fxstreet.com",
    "pragma": "no-cache",
    "referer": "https://www.fxstreet.com/",
    "sec-ch-ua": "\"Not?A_Brand\";v=\"99\", \"Chromium\";v=\"130\"",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "\"macOS\"",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
  } as const;

  const REQUEST_ATTEMPTS = 3;
  const REQUEST_TIMEOUT_MS = 10_000;

  for (let attempt = 1; attempt <= REQUEST_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, { headers: FXSTREET_HEADERS, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!response.ok) {
        throw new CalendarHttpError(response.status, url);
      }

      return (await response.json()) as NewsEvent[];
    } catch (error) {
      if (!isTemporaryCalendarError(error) || attempt === REQUEST_ATTEMPTS) {
        throw error;
      }

      await sleep(attempt * SECOND_MS);
    }
  }

  throw new Error("FXStreet calendar request failed");
}

/** Non-2xx response from the calendar API; fetch resolves these instead of rejecting. */
class CalendarHttpError extends Error {
  constructor(readonly status: number, url: string) {
    super(`FXStreet calendar request failed with ${status}: ${url}`);
  }
}

/**
 * Whether a calendar request failure is worth retrying: a temporary HTTP status or network error.
 * fetch rejects network failures with a TypeError whose `cause` carries the system error code.
 *
 * @example
 * isTemporaryCalendarError(new CalendarHttpError(502, url)); // true
 * isTemporaryCalendarError(new CalendarHttpError(404, url)); // false
 */
function isTemporaryCalendarError(error: unknown) {
  const TEMPORARY_ERROR_CODES: readonly string[] = ["EAI_AGAIN", "ECONNRESET"];
  const TEMPORARY_STATUSES: readonly number[] = [500, 502, 524];

  if (error instanceof CalendarHttpError) {
    return TEMPORARY_STATUSES.includes(error.status);
  }

  const cause = error instanceof Error ? error.cause : undefined;
  const code = cause instanceof Error && "code" in cause ? cause.code : undefined;
  return typeof code === "string" && TEMPORARY_ERROR_CODES.includes(code);
}

/**
 * Resolve after `ms` milliseconds.
 *
 * @example
 * await sleep(SECOND_MS);
 */
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Keep events that start between now and the selected timeframe, at or above the selected importance.
 *
 * @example
 * filterNewsData(events, { country: "USA", timeframe: "Next 6 hours", importance: "🔴" }); // only HIGH events in the next 6 hours
 */
function filterNewsData(data: NewsEvent[], params: FetchNewsParams): NewsEvent[] {
  const TIMEFRAME_LOOKAHEAD_MS: Readonly<Record<TimeframeOptions, number>> = {
    "Next 5 minutes": 5 * MINUTE_MS,
    "Next 6 hours": 6 * HOUR_MS,
    "Next 24 hours": 24 * HOUR_MS,
    "Next 48 hours": 48 * HOUR_MS,
    "Next 7 days": 7 * DAY_MS,
  };
  const IMPORTANCE_VOLATILITIES: Readonly<Record<ImportanceOptions, readonly string[]>> = {
    "🔴": ["HIGH"],
    "🔴🟠": ["HIGH", "MEDIUM"],
    "🔴🟠🟡": CALENDAR_VOLATILITIES,
  };

  const now = Date.now();
  const latest = now + TIMEFRAME_LOOKAHEAD_MS[params.timeframe];
  const volatilities = IMPORTANCE_VOLATILITIES[params.importance];

  return data.filter(event => {
    const eventTime = new Date(event.dateUtc).getTime();
    return eventTime >= now && eventTime <= latest && volatilities.includes(event.volatility);
  });
}
