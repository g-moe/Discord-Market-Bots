import axios, { AxiosRequestConfig, isAxiosError } from "axios";
import logger from "../../utils/logger";

export type TCountryOptions = typeof countryOptions[keyof typeof countryOptions];

export type TFetchNewsParams = {
  country: TCountryOptions;
  timeframe: TTimeframeOptions;
  importance: TImportanceOptions;
};

export type TImportanceOptions = typeof importanceOptions[keyof typeof importanceOptions];

export type TNewsEvent = {
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

export type TTimeframeOptions = typeof timeframeOptions[keyof typeof timeframeOptions];
export const countryOptions = {
  US: "USA",
} as const;
export async function fetchNewsData(params: TFetchNewsParams) {
  const url = createNewsUrl(params);
  const config: AxiosRequestConfig = {
    method: "get",
    timeout: 10000,
    maxBodyLength: Infinity,
    url,
    headers: { 
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
    }
  };

  try {
    const response = await requestNewsData(config);

    if (response.data) {
      return filterNewsData(response.data, params);
    }

    return null;
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

function getCountryCode(country: TCountryOptions): string {
  return Object.keys(countryOptions).find(key => countryOptions[key as keyof typeof countryOptions] === country) || "";
}

function getStartEndDates() {
  const currentDate = new Date();
  currentDate.setHours(0, 0, 0, 0); // Set to beginning of the day

  const endDate = new Date(currentDate);
  endDate.setDate(endDate.getDate() + 7); // Add 7 days

  const times = {
    start: currentDate.toISOString().slice(0, -5) + "Z",
    end: endDate.toISOString().slice(0, -5) + "Z"
  };

  return times;
}

function isTemporaryCalendarError(error: unknown) {
  if (!isAxiosError(error)) return false;

  return (
    error.code === "EAI_AGAIN" ||
    error.code === "ECONNRESET" ||
    error.response?.status === 500 ||
    error.response?.status === 502 ||
    error.response?.status === 524
  );
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function requestNewsData(config: AxiosRequestConfig) {
  const attempts = 3;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await axios.request<TNewsEvent[]>(config);
    } catch (error) {
      if (!isTemporaryCalendarError(error) || attempt === attempts) {
        throw error;
      }

      await sleep(attempt * 1000);
    }
  }

  throw new Error("FXStreet calendar request failed");
}

export const timeframeOptions = {
  "5": "Next 5 minutes",
  "6": "Next 6 hours",
  "24": "Next 24 hours",
  "48": "Next 48 hours",
  "168": "Next 7 days",
} as const;

function createNewsUrl(params: TFetchNewsParams) {
  const { start, end } = getStartEndDates();

  const baseUrl = `https://calendar-api.fxstreet.com/en/api/v2/eventDates/${start}/${end}`;

  const queryParams = new URLSearchParams();

  const volatilities = [
    "LOW",
    "MEDIUM",
    "HIGH",
  ];

  const categories = [
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

  volatilities.forEach(volatility => {
    queryParams.append("volatilities", volatility);
  });

  queryParams.append("countries", getCountryCode(params.country));

  categories.forEach(category => {
    queryParams.append("categories", category);
  });

  return `${baseUrl}?&${queryParams.toString()}`;
}

function filterNewsData(data: TNewsEvent[], params: TFetchNewsParams): TNewsEvent[] {
  const filteredByDate = filterByDate(data, params);
  
  const filteredByImportanceAndDate = filterByImportance(filteredByDate, params);

  return filteredByImportanceAndDate;
}

function filterByImportance(data: TNewsEvent[], params: TFetchNewsParams) {
  switch (params.importance) {
  case "🔴":
    return data.filter(event => event.volatility === "HIGH");
  case "🔴🟠":
    return data.filter(event => event.volatility === "HIGH" || event.volatility === "MEDIUM");
  case "🔴🟠🟡":
    return data;
  default:
    return data;
  }
}

function filterByDate(data: TNewsEvent[], params: TFetchNewsParams) {
  const currentDate = new Date();
  const maxDate = new Date(currentDate);

  switch (params.timeframe) {
  case "Next 5 minutes":
    maxDate.setMinutes(currentDate.getMinutes() + 5);
    break;
  case "Next 6 hours":
    maxDate.setHours(currentDate.getHours() + 6);
    break;
  case "Next 24 hours":
    maxDate.setHours(currentDate.getHours() + 24);
    break;
  case "Next 48 hours":
    maxDate.setHours(currentDate.getHours() + 48);
    break;
  case "Next 7 days":
    maxDate.setDate(currentDate.getDate() + 7);
    break;
  default:
    maxDate.setDate(currentDate.getDate() + 7);
  }

  return data.filter(event => {
    const eventDate = new Date(event.dateUtc);
    return eventDate >= currentDate && eventDate <= maxDate;
  });
}
