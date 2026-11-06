import { APIApplicationCommandOptionChoice, ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { Browser, launch } from "puppeteer";
import logger from "../utils/logger";

const marketOptions = {
  "SPX500": "S&P 500",
  "NASDAQ100": "NDX 100",
  "DJCA": "DOW JONES",
  "DAX": "DAX"
};

const timeframeOptions = {
  "change": "Daily",
  "Perf.W": "Weekly",
  "Perf.1M": "Monthly",
  "Perf.Y": "Yearly",
  "Perf.YTD": "YTD"
};

export const data = new SlashCommandBuilder()
  .setName("heatmap")
  .setDescription("Fetches a market heatmap")
  .addStringOption(option =>
    option
      .setName("market")
      .setDescription("The market index")
      .setRequired(true)
      .addChoices(
        ...Object.entries(marketOptions).map(([value, name]): APIApplicationCommandOptionChoice<string> => ({ name, value }))
      ))
  .addStringOption(option =>
    option
      .setName("timeframe")
      .setDescription("The lookback period")
      .setRequired(true)
      .addChoices(
        ...Object.entries(timeframeOptions).map(([value, name]): APIApplicationCommandOptionChoice<string> => ({ name, value }))
      ));

/**
 * Handle `/heatmap`: reply right away, then edit the reply with a TradingView heatmap screenshot.
 * Does not throw; failures are logged and the reply is edited to an error message.
 *
 * @example
 * await execute(interaction); // reply: "S&P 500 Daily Heatmap" + screenshot.png
 */
export async function execute(interaction: ChatInputCommandInteraction) {
  const ERROR_MESSAGE = "Alas, the stars are not in alignment for a heatmap. Please try again later 🧙🏻‍♂️";

  const market = interaction.options.get("market")?.value?.toString();
  const timeframe = interaction.options.get("timeframe")?.value?.toString();

  const marketName = marketOptions[market as keyof typeof marketOptions];
  const timeframeName = timeframeOptions[timeframe as keyof typeof timeframeOptions];
  const heatmapString = `${marketName} ${timeframeName} Heatmap`;

  try {
    await interaction.reply(`Summoning ${heatmapString}...please wait 🪄`);
    if (!market || !timeframe) throw new Error("Invalid options");

    const screenshotPath = await takeScreenshot(createHeatmapUrl({ market, timeframe }));
    await interaction.editReply({ content: heatmapString, files: [screenshotPath] });
  } catch (error) {
    logger.error(error);
    await interaction.editReply(ERROR_MESSAGE);
  }
}

/**
 * Build the TradingView stock heatmap URL for a market index colored by a performance timeframe.
 *
 * @example
 * createHeatmapUrl({ market: "SPX500", timeframe: "change" });
 * // "https://www.tradingview.com/heatmap/stock/?theme=dark#%7B%22dataSource%22%3A%22SPX500%22%2C..."
 */
function createHeatmapUrl({ market, timeframe }: { market: string; timeframe: string }) {
  const HEATMAP_URL = "https://www.tradingview.com/heatmap/stock/?theme=dark";

  const settings = { dataSource: market, blockColor: timeframe, blockSize: "market_cap_basic", grouping: "sector" };

  return `${HEATMAP_URL}#${encodeURIComponent(JSON.stringify(settings))}`;
}

/**
 * Open `url` in the shared browser, switch the heatmap to fullscreen, and save a screenshot.
 * Rejects when the page fails to load or the fullscreen button never appears.
 *
 * @example
 * await takeScreenshot(createHeatmapUrl({ market: "DAX", timeframe: "Perf.W" })); // "screenshot.png"
 */
async function takeScreenshot(url: string) {
  const FULLSCREEN_BUTTON_SELECTOR = "[data-qa-id=\"heatmap-top-bar_fullscreen\"]";
  const SCREENSHOT_PATH = "screenshot.png";

  const browser = await getBrowser();
  const page = await browser.newPage();

  await page.goto(url, { waitUntil: "networkidle2" });
  await page.waitForSelector(FULLSCREEN_BUTTON_SELECTOR);
  await page.click(FULLSCREEN_BUTTON_SELECTOR);
  await page.screenshot({ path: SCREENSHOT_PATH });
  await page.close();

  return SCREENSHOT_PATH;
}

let browser: Browser | null = null;

/**
 * Launch Chrome on first use and reuse it for every later screenshot.
 *
 * @example
 * const browser = await getBrowser();
 */
async function getBrowser(): Promise<Browser> {
  const CHROME_PATH = "/usr/bin/google-chrome";
  const VIEWPORT = { width: 1920, height: 1080 };

  browser ??= await launch({
    executablePath: CHROME_PATH,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    defaultViewport: VIEWPORT
  });

  return browser;
}
