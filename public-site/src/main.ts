import "./styles.css";

type Page = "home" | "terms" | "privacy";

const navItems = [
  { href: "/", label: "Home", page: "home" },
  { href: "/terms-of-service", label: "Terms", page: "terms" },
  { href: "/privacy-policy", label: "Privacy", page: "privacy" }
] as const;

const app = document.querySelector<HTMLDivElement>("#app");
const pageByPath: Record<string, Page> = {
  "/": "home",
  "/terms-of-service": "terms",
  "/terms-of-service/": "terms",
  "/privacy-policy": "privacy",
  "/privacy-policy/": "privacy"
};

const page =
  pageByPath[window.location.pathname] ?? (document.body.dataset.page as Page | undefined);

if (!app || !page) {
  throw new Error("Missing app root or page name.");
}

const updatedAt = "July 2, 2026";

const renderLayout = (content: string) => `
  <header class="site-header">
    <a class="brand" href="/" aria-label="Market Bots home">
      <img class="brand-mark" src="/market-wiz.png" alt="" aria-hidden="true" />
      <span>Market Bots</span>
    </a>
    <nav class="site-nav" aria-label="Primary navigation">
      ${navItems
        .map(
          (item) => `
            <a href="${item.href}" ${item.page === page ? 'aria-current="page"' : ""}>
              ${item.label}
            </a>
          `
        )
        .join("")}
    </nav>
  </header>
  <main>${content}</main>
  <footer class="site-footer">
    <span>&copy; ${new Date().getFullYear()} Market Bots</span>
  </footer>
`;

const home = `
  <section class="hero">
    <div class="hero-copy">
      <h1>Market data in Discord</h1>
      <p>
        Market Bots posts prices, daily moves, heatmaps, and economic news
        without sending your group to another app.
      </p>
      <div class="hero-actions" aria-label="Page sections">
        <a class="button button-primary" href="#ticker-view">See tickers</a>
        <a class="button button-secondary" href="#market-wiz">See Market Wiz</a>
      </div>
    </div>
    <div class="hero-panel" aria-label="Ticker preview">
      <div class="window-bar">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <img src="/ticker-list.png" alt="Discord ticker list showing BTC, CL, DXY, ES, GOLD, NQ, RTY, UB, VIX, and YM prices." />
    </div>
  </section>
  <section class="product-strip" aria-label="Main product points">
    <div>
      <span>Tickers</span>
      <strong>Price, percent move, and status color.</strong>
    </div>
    <div>
      <span>Heatmaps</span>
      <strong>S&P 500, Nasdaq 100, Dow Jones, and DAX.</strong>
    </div>
    <div>
      <span>News</span>
      <strong>Economic events by country, time, and impact.</strong>
    </div>
  </section>
  <section id="ticker-view" class="split-section">
    <div>
      <p class="eyebrow">Ticker bots</p>
      <h2>Prices your server can scan fast.</h2>
      <p>
        Each ticker bot shows the symbol, latest price, daily change, and a
        green or red role state. Mention a ticker to open key levels for that
        market.
      </p>
    </div>
    <div class="feature-list" aria-label="Ticker details">
      <article>
        <span>01</span>
        <h3>Simple names</h3>
        <p>BTC, ES, NQ, GOLD, VIX, and any other symbol you run.</p>
      </article>
      <article>
        <span>02</span>
        <h3>Quick direction</h3>
        <p>Green and red states make the day move obvious at a glance.</p>
      </article>
      <article>
        <span>03</span>
        <h3>Key levels</h3>
        <p>A ticker mention opens key levels for the matching market.</p>
      </article>
    </div>
  </section>
  <section id="market-wiz" class="preview-section">
    <div class="section-heading">
      <p class="eyebrow">Market Wiz</p>
      <h2>Heatmaps and news without leaving Discord.</h2>
      <p>
        Use slash commands for market heatmaps and economic calendar events.
        Pick the market, timeframe, country, and impact level.
      </p>
    </div>
    <figure class="heatmap-frame">
      <img src="/heatmap-preview.png" alt="S&P 500 heatmap with sectors and stock tiles colored by daily performance." />
    </figure>
  </section>
`;

const terms = `
  <section class="legal-page">
    <p class="eyebrow">Last updated ${updatedAt}</p>
    <h1>Terms of Service</h1>
    <div class="legal-copy">
      <h2>Use of the bot</h2>
      <p>
        Market Bots provides market data and related messages for
        Discord servers. You agree to use the bot in a lawful way and follow
        Discord's own terms and rules.
      </p>
      <h2>No financial advice</h2>
      <p>
        Information shown by the bot is for general display only. It is not
        financial, investment, tax, or legal advice.
      </p>
      <h2>Service changes</h2>
      <p>
        Features, data sources, and availability may change at any time. The
        service may be paused or ended without notice.
      </p>
      <h2>Limits</h2>
      <p>
        We are not responsible for losses, missed messages, wrong prices, late
        data, Discord outages, or decisions made from bot output.
      </p>
    </div>
  </section>
`;

const privacy = `
  <section class="legal-page">
    <p class="eyebrow">Last updated ${updatedAt}</p>
    <h1>Privacy Policy</h1>
    <div class="legal-copy">
      <h2>What we collect</h2>
      <p>
        The bot may process Discord server IDs, channel IDs, user IDs, command
        content, and settings needed to respond to commands and run configured
        ticker updates.
      </p>
      <h2>How we use data</h2>
      <p>
        Data is used to operate the bot, save server settings, troubleshoot
        issues, and improve reliability.
      </p>
      <h2>Sharing</h2>
      <p>
        We do not sell personal data. Data may be shared only when needed to run
        the service, follow the law, or protect the bot and its users.
      </p>
      <h2>Retention</h2>
      <p>
        Server settings and basic logs may be kept while the bot is installed or
        while needed for support and security.
      </p>
    </div>
  </section>
`;

const pages: Record<Page, string> = {
  home,
  terms,
  privacy
};

app.innerHTML = renderLayout(pages[page]);
