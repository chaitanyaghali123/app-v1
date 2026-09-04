import axios from "axios";
import pg from "pg";

let _cheerio = null;
async function loadCheerio() {
  if (!_cheerio) _cheerio = await import("cheerio");
  return _cheerio;
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30000,
});

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

// ═══════════════════════════════════════════════════════════════════════
// TIER 1 — Primary Ingestion Sources (100% Legal & Open Data)
// Full text scraped and stored in DB
// ═══════════════════════════════════════════════════════════════════════

const TIER1_RSS_FEEDS = [
  // PIB — Government policy, cabinet decisions, schemes
  { url: "https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3", source: "PIB" },
  { url: "https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=4", source: "PIB" },
  // RBI — Monetary policy, notifications, banking regulation
  { url: "https://rbi.org.in/pressreleases_rss.xml", source: "RBI" },
  { url: "https://rbi.org.in/notifications_rss.xml", source: "RBI" },
];

const TIER1_HTML_SOURCES = [
  // PRS Legislative Research — Bill summaries, policy breakdowns (CC BY 4.0)
  { url: "https://prsindia.org/billtrack", source: "PRS", type: "billtrack" },
  // IDSA — Defence and security briefs (public domain govt institute)
  { url: "https://idsa.in/papers-briefs", source: "IDSA", type: "papers" },
];

// ═══════════════════════════════════════════════════════════════════════
// TIER 2 — Newspaper Deep Links (Link-Only, No Text Storage)
// We store ONLY title + source_url for in-app browser opening
// No copyrighted content is stored in the database
// ═══════════════════════════════════════════════════════════════════════

const TIER2_DEEP_LINKS = [
  // Indian Express — Explained, Opinion, Editorials
  { url: "https://indianexpress.com/section/explained/feed/", source: "Indian Express" },
  { url: "https://indianexpress.com/section/opinion/feed/", source: "Indian Express" },
  { url: "https://indianexpress.com/section/political-pulse/feed/", source: "Indian Express" },
  // The Hindu — Opinion, Editorial
  { url: "https://www.thehindu.com/opinion/feeder/default.rss", source: "The Hindu" },
  { url: "https://www.thehindu.com/opinion/editorial/feeder/default.rss", source: "The Hindu" },
];

// ═══════════════════════════════════════════════════════════════════════
// UPSC RELEVANCE GATE — blocks local crime, stock tips, astrology, etc.
// ═══════════════════════════════════════════════════════════════════════

const UPSC_GATE = {
  // If ANY of these appear in the title → accept regardless of keyword matches
  allow: [
    "rbi", "gdp", "inflation", "budget", "fiscal", "monetary policy", "repo rate",
    "parliament", "lok sabha", "rajya sabha", "supreme court", "high court",
    "cabinet", "bill", "act ", "amendment", "ordinance",
    "election", "voting", "governor", "president",
    "isro", "satellite", "missile", "defence", "military", "armed forces",
    "climate", "cop", "niti aayog", "gst", "biodiversity",
    "cyclone", "flood", "earthquake", "tsunami", "disaster",
    "treaty", "sanction", "foreign policy", "diplomacy",
    "monsoon", "agriculture", "crop", "farmer",
    "pandemic", "vaccine", "health ministry",
    "union budget", "economic survey", "trade deficit", "fdi", "fpi",
    "environment", "pollution", "deforestation", "renewable energy",
    "cyber", "terrorism", "insurgency", "naxal", "maoist",
    "poverty", "literacy", "human development",
    "atomic", "nuclear", "iaea",
    "unsc", "un general", "brics", "g20", "quad", "asean",
    "lokpal", "anti-corruption", "whistleblower",
    "digital india", "make in india", "atmanirbhar",
    "semiconductor", "artificial intelligence", "blockchain",
    "pahalgam", "galwan", "surgical strike",
  ],
  // If ANY of these appear → reject even if keywords match
  reject: [
    "bribe", "trapped for", "caught for", "arrested for",
    "money mistakes", "lifestyle inflation", "personal finance",
    "share price", "stock market live", "sensex today", "nifty today",
    "ipl", "cricket", "football", "bollywood", "movie review",
    "horoscope", "astrology", "zodiac",
    "recipe", "fashion", "beauty tips", "weight loss",
    "weather today", "temple run", "viral video",
    "exam result", "board result", "cut off",
    "admit card", "hall ticket", "recruitment notification",
    "sensex rises", "sensex falls", "market crashes",
    "love story", "wedding", "celebrity",
    "gst collection rise", "gst collection fall",
  ],
};

function isUPSCRelevant(title, summary) {
  const text = `${title} ${summary}`.toLowerCase();
  // Hard reject: noise that should never enter UPSC prep
  for (const r of UPSC_GATE.reject) {
    if (text.includes(r.toLowerCase())) return false;
  }
  // Hard accept: core UPSC topics
  for (const a of UPSC_GATE.allow) {
    if (text.includes(a.toLowerCase())) return true;
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════════════
// GS Paper Keyword Categorization Engine
// ═══════════════════════════════════════════════════════════════════════

const KEYWORD_MAP = {
  cyclone: ["gs1"], flood: ["gs1"], earthquake: ["gs1"], tsunami: ["gs1"],
  glacial: ["gs1"], urbanization: ["gs1"], migration: ["gs1"], population: ["gs1"],
  women: ["gs1"], child: ["gs1"], caste: ["gs1"], tribe: ["gs1"],
  heritage: ["gs1"], monument: ["gs1"], archaeology: ["gs1"], culture: ["gs1"],
  festival: ["gs1"], history: ["gs1"], temple: ["gs1"], dynasty: ["gs1"],
  geography: ["gs1"], monsoon: ["gs1"], river: ["gs1"], dam: ["gs1"],
  "social issue": ["gs1"], literacy: ["gs1"], communal: ["gs1"],
  naxal: ["gs1"], leftwing: ["gs1"], maoist: ["gs1"], insurgency: ["gs1"],
  "sex ratio": ["gs1"], poverty: ["gs1"], "SC ": ["gs1"], "ST ": ["gs1"],
  "OBC": ["gs1"], "UNESCO": ["gs1"], "art": ["gs1"],

  parliament: ["gs2"], bill: ["gs2"], ordinance: ["gs2"], amendment: ["gs2"],
  "supreme court": ["gs2"], "high court": ["gs2"], judiciary: ["gs2"],
  verdict: ["gs2"], judgment: ["gs2"], president: ["gs2"], governor: ["gs2"],
  minister: ["gs2"], election: ["gs2"], voting: ["gs2"], cabinet: ["gs2"],
  welfare: ["gs2"], governance: ["gs2"], "right to": ["gs2"],
  fundamental: ["gs2"], preamble: ["gs2"], federal: ["gs2"],
  bilateral: ["gs2"], foreign: ["gs2"], diplomacy: ["gs2"],
  treaty: ["gs2"], sanction: ["gs2"], "human rights": ["gs2", "gs4"],
  panchayat: ["gs2"], municipality: ["gs2"], "social justice": ["gs2"],
  reservation: ["gs2"], education: ["gs2"], lokpal: ["gs2", "gs4"],
  extradition: ["gs2"], terror: ["gs2"], border: ["gs2"],
  kashmir: ["gs2"], ladakh: ["gs2"], "veto power": ["gs2"],
  "nuclear deal": ["gs2"], "bill": ["gs2"], "act ": ["gs2"],
  "monsoon session": ["gs2"], "lok sabha": ["gs2"], "rajya sabha": ["gs2"],
  "standing committee": ["gs2"], "cabinet approved": ["gs2"],

  rbi: ["gs3"], inflation: ["gs3"], "interest rate": ["gs3"],
  fiscal: ["gs3"], budget: ["gs3"], tax: ["gs3"], trade: ["gs3"],
  export: ["gs3"], import: ["gs3"], rupee: ["gs3"], bond: ["gs3"],
  banking: ["gs3"], cryptocurrency: ["gs3"], isro: ["gs3"],
  space: ["gs3"], satellite: ["gs3"], rocket: ["gs3"],
  "artificial intelligence": ["gs3"], cyber: ["gs3"], blockchain: ["gs3"],
  semiconductor: ["gs3"], biotech: ["gs3"], "gene editing": ["gs3"],
  vaccine: ["gs3"], pandemic: ["gs3"], health: ["gs3"],
  agriculture: ["gs3"], crop: ["gs3"], fertilizer: ["gs3"],
  irrigation: ["gs3"], farmer: ["gs3"], "supply chain": ["gs3"],
  infrastructure: ["gs3"], highway: ["gs3"], railway: ["gs3"],
  energy: ["gs3"], solar: ["gs3"], wind: ["gs3"], nuclear: ["gs3"],
  coal: ["gs3"], renewable: ["gs3"], emission: ["gs3"], carbon: ["gs3"],
  environment: ["gs3"], pollution: ["gs3"], "air quality": ["gs3"],
  deforestation: ["gs3"], biodiversity: ["gs3"], wildlife: ["gs3"],
  tiger: ["gs3"], "national park": ["gs3"], forest: ["gs3"],
  "disaster management": ["gs3"], ndrf: ["gs3"], security: ["gs3"],
  military: ["gs3"], defence: ["gs3"], missile: ["gs3"], drone: ["gs3"],
  "cyber attack": ["gs3"], "data privacy": ["gs3", "gs4"],
  "social media": ["gs3"], "regulation": ["gs3"], "repo rate": ["gs3"],
  "monetary policy": ["gs3"], "gdp": ["gs3"], "trade deficit": ["gs3"],
  "fpi": ["gs3"], "fdi": ["gs3"], "npa": ["gs3"], "banking reform": ["gs3"],

  ethics: ["gs4"], "ethical": ["gs4"], probity: ["gs4"],
  "civil service": ["gs4"], whistleblower: ["gs4"],
  "administrative reform": ["gs4"], "administrative innovation": ["gs4"],
  "moral dilemma": ["gs4"], "emotional intelligence": ["gs4"],
  "public service": ["gs4"], "value system": ["gs4"],
  "corporate governance": ["gs4"], "conflict of interest": ["gs4"],
  "code of conduct": ["gs4"], "code of ethics": ["gs4"],
  "ai ethics": ["gs4"], "algorithmic bias": ["gs4"], "ai regulation": ["gs4"],
  "data privacy": ["gs4"], "digital ethics": ["gs4"],
  "transparency in governance": ["gs4"], "right to information": ["gs4"],
  "citizen charter": ["gs4"], "good governance": ["gs4"],
  "social audit": ["gs4"], "accountability": ["gs4"],
  "ombudsman": ["gs4"], "lokpal": ["gs4"], "lokayukta": ["gs4"],
  "gender sensitivity": ["gs4"], "gender justice": ["gs4"],
  "humanitarian": ["gs4"], "human rights": ["gs4"],
  "displacement": ["gs4"], "tribal displacement": ["gs4"],
  "autonomous weapons": ["gs4"], "lethal autonomous": ["gs4"],
  "death penalty": ["gs4"], "capital punishment": ["gs4"],
  "euthanasia": ["gs4"], "right to die": ["gs4"],
  "surrogacy ethics": ["gs4"], "genetic engineering": ["gs4"],
  "moral": ["gs4"], "morality": ["gs4"],
  "integrity": ["gs4"], "impartiality": ["gs4"],
  "objectivity": ["gs4"], "compassion": ["gs4"],
  "empathy": ["gs4"], "tolerance": ["gs4"],
  "attitude": ["gs4"], "apathy": ["gs4"],
  "dignity": ["gs4"], "non-partisanship": ["gs4"],
};

function categorize(title, summary) {
  const text = `${title} ${summary}`.toLowerCase();
  const matchedPapers = new Set();
  const matchedTopics = [];

  for (const [keyword, papers] of Object.entries(KEYWORD_MAP)) {
    if (text.includes(keyword.toLowerCase())) {
      for (const p of papers) matchedPapers.add(p);
      matchedTopics.push(keyword);
    }
  }

  if (matchedPapers.size === 0) matchedPapers.add("general");

  return {
    papers: [...matchedPapers],
    topics: [...new Set(matchedTopics)].slice(0, 10),
  };
}

// ═══════════════════════════════════════════════════════════════════════
// SCRAPERS
// ═══════════════════════════════════════════════════════════════════════

async function scrapeRss(url) {
  try {
    const { data } = await axios.get(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; UPSCBot/1.0)" },
      timeout: 15000,
      responseType: "text",
    });

    const $ = (await loadCheerio()).load(data, { xmlMode: true });
    const items = [];

    $("item").each((_, el) => {
      const title = $(el).find("title").text().trim();
      const link = $(el).find("link").text().trim();
      const description = $(el).find("description").text().trim();
      const pubDate = $(el).find("pubDate").text().trim();

      if (!title || !link) return;

      let published_date = null;
      if (pubDate) {
        const d = new Date(pubDate);
        if (!isNaN(d.getTime())) {
          published_date = d.toISOString().split("T")[0];
        }
      }

      items.push({
        title,
        summary: description.replace(/<[^>]+>/g, "").trim().slice(0, 500),
        source_url: link,
        published_date,
      });
    });

    return items;
  } catch (err) {
    console.error(`Failed to scrape RSS ${url}:`, err.message);
    return [];
  }
}

async function scrapePrsBilltrack() {
  try {
    const { data } = await axios.get("https://prsindia.org/billtrack", {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; UPSCBot/1.0)" },
      timeout: 15000,
    });

    const $ = (await loadCheerio()).load(data);
    const items = [];

    $("table tbody tr").each((_, el) => {
      const cells = $(el).find("td");
      if (cells.length < 2) return;

      const titleEl = $(cells[0]).find("a").first();
      const title = titleEl.text().trim();
      const href = titleEl.attr("href");
      const dateText = $(cells[1]).text().trim();

      if (!title || !href) return;

      const url = href.startsWith("http") ? href : `https://prsindia.org${href}`;
      const published_date = dateText ? new Date(dateText).toISOString().split("T")[0] : null;

      items.push({
        title,
        summary: `Bill tracked by PRS Legislative Research: ${title}`,
        source_url: url,
        published_date,
      });
    });

    return items;
  } catch (err) {
    console.error("Failed to scrape PRS billtrack:", err.message);
    return [];
  }
}

async function scrapeIdsaPapers() {
  try {
    const { data } = await axios.get("https://idsa.in/papers-briefs", {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; UPSCBot/1.0)" },
      timeout: 15000,
    });

    const $ = (await loadCheerio()).load(data);
    const items = [];

    $("article, .node--type-paper, .view-content .views-row").each((_, el) => {
      const titleEl = $(el).find("h2 a, h3 a, .field-content a").first();
      const title = titleEl.text().trim();
      const href = titleEl.attr("href");

      if (!title || !href) return;

      const url = href.startsWith("http") ? href : `https://idsa.in${href}`;
      const summary = $(el).find(".field-name-body, .field--name-body").text().trim().slice(0, 500);
      const dateEl = $(el).find("time, .date-display-single, .field--name-field-date").first();
      const dateText = dateEl.attr("datetime") || dateEl.text().trim();
      let published_date = null;
      if (dateText) {
        const d = new Date(dateText);
        if (!isNaN(d.getTime())) published_date = d.toISOString().split("T")[0];
      }

      items.push({
        title,
        summary: summary || `Defence analysis by MP-IDSA: ${title}`,
        source_url: url,
        published_date,
      });
    });

    return items;
  } catch (err) {
    console.error("Failed to scrape IDSA papers:", err.message);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════
// DB INGESTION
// ═══════════════════════════════════════════════════════════════════════

async function ingestArticles(articles, sourceTier, sourceName) {
  let added = 0;
  let skippedNoise = 0;

  for (const article of articles) {
    // Relevance gate: skip non-UPSC noise (local crime, stock tips, astrology, etc.)
    if (sourceName !== "PRS" && sourceName !== "IDSA") {
      if (!isUPSCRelevant(article.title, article.summary)) {
        skippedNoise++;
        continue;
      }
    }

    const { papers, topics } = categorize(article.title, article.summary);

    // Skip "general" tagged articles that have no strong UPSC keyword match
    // They passed the gate but aren't strongly tied to any GS paper
    const isGeneralOnly = papers.length === 1 && papers[0] === "general";

    for (const paperType of papers) {
      try {
        const { rowCount } = await pool.query(
          `INSERT INTO current_affairs (title, summary, source_url, source_name, paper_type, topics, published_date, source_tier)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (source_url) DO NOTHING`,
          [
            article.title,
            article.summary,
            article.source_url,
            sourceName,
            paperType,
            topics,
            article.published_date,
            sourceTier,
          ]
        );
        added += rowCount;
      } catch (err) {
        console.error(`Failed to insert article: ${article.title}`, err.message);
      }
    }
  }

  return added;
}

// ═══════════════════════════════════════════════════════════════════════
// RETAG — reclassify all existing articles with updated keyword map
// ═══════════════════════════════════════════════════════════════════════

export async function retagAllArticles() {
  const { rows } = await pool.query(
    "SELECT id, title, summary FROM current_affairs"
  );

  // High-signal GS4 keywords that strongly indicate ethical fodder
  const GS4_STRONG_SIGNALS = [
    "ethics", "ethical", "probity", "corporate governance", "ai ethics",
    "algorithmic bias", "conflict of interest", "code of conduct", "code of ethics",
    "whistleblower", "ombudsman", "lokpal", "lokayukta", "transparency in governance",
    "right to information", "citizen charter", "good governance", "social audit",
    "moral dilemma", "emotional intelligence", "administrative reform",
    "administrative innovation", "civil service", "death penalty", "capital punishment",
    "euthanasia", "autonomous weapons", "genetic engineering", "surrogacy ethics",
    "humanitarian", "displacement", "tribal displacement", "gender sensitivity",
    "gender justice", "digital ethics", "data privacy",
    "corruption", "integrity", "apathy", "compassion", "impartiality",
    "empathy", "morality", "moral", "dignity", "objectivity",
    "accountability", "anti-corruption", "nepotism",
    "collective responsibility", "constitutional morality",
    "rule of law", "natural justice", "public interest",
    "citizen-centric", "service delivery", "bureaucratic",
    "inspector raj", "red tape",
  ];

  let updated = 0;
  let addedGs4 = 0;

  for (const row of rows) {
    const { papers, topics } = categorize(row.title, row.summary || "");
    const newPaperType = papers[0] || "general";

    const hasGs4 = papers.includes("gs4");

    await pool.query(
      "UPDATE current_affairs SET paper_type = $1, topics = $2 WHERE id = $3",
      [newPaperType, topics, row.id]
    );

    // Only cross-post to GS4 if article hits a strong signal keyword
    if (hasGs4 && newPaperType !== "gs4") {
      const text = `${row.title} ${row.summary || ""}`.toLowerCase();
      const hasStrongSignal = GS4_STRONG_SIGNALS.some((kw) => text.includes(kw));
      if (hasStrongSignal) {
        try {
          const { rowCount } = await pool.query(
            `INSERT INTO current_affairs (title, summary, source_url, source_name, paper_type, topics, published_date, source_tier)
             SELECT title, summary, source_url || '?gs4=1', source_name, 'gs4', $1, published_date, source_tier
             FROM current_affairs WHERE id = $2
             ON CONFLICT (source_url) DO NOTHING`,
            [topics, row.id]
          );
          addedGs4 += rowCount;
        } catch (e) {
          // skip duplicates
        }
      }
    }

    updated++;
  }

  console.log(`Retagged ${updated} articles, added ${addedGs4} GS4 cross-posts`);
  return { retagged: updated, addedGs4 };
}

// ═══════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════

export async function refreshCurrentAffairs() {
  let totalAdded = 0;

  // ── Tier 1: RSS Feeds (PIB, RBI) ──────────────────────────────────
  for (const feed of TIER1_RSS_FEEDS) {
    const items = await scrapeRss(feed.url);
    if (items.length > 0) {
      const added = await ingestArticles(items, "primary", feed.source);
      totalAdded += added;
    }
  }

  // ── Tier 1: HTML Scrapers (PRS, IDSA) ─────────────────────────────
  const prsItems = await scrapePrsBilltrack();
  if (prsItems.length > 0) {
    totalAdded += await ingestArticles(prsItems, "primary", "PRS");
  }

  const idsaItems = await scrapeIdsaPapers();
  if (idsaItems.length > 0) {
    totalAdded += await ingestArticles(idsaItems, "primary", "IDSA");
  }

  // ── Tier 2: Newspaper Deep Links (Indian Express, The Hindu) ───────
  // We store ONLY title + source_url — NO copyrighted text
  for (const feed of TIER2_DEEP_LINKS) {
    const items = await scrapeRss(feed.url);
    // For deep links, store minimal data: title + link only
    const deepLinks = items.map((item) => ({
      title: item.title,
      summary: "", // No copyrighted summary stored
      source_url: item.source_url,
      published_date: item.published_date,
    }));
    if (deepLinks.length > 0) {
      const added = await ingestArticles(deepLinks, "deep-link", feed.source);
      totalAdded += added;
    }
  }

  if (totalAdded === 0) {
    console.warn("No current affairs articles scraped");
    return { added: 0, total: 0 };
  }

  const { rows } = await pool.query("SELECT COUNT(*) FROM current_affairs");
  console.log(`Current affairs refreshed: ${totalAdded} new, ${rows[0].count} total`);

  return { added: totalAdded, total: parseInt(rows[0].count, 10) };
}

const OPTIONAL_SUBJECTS = new Set([
  "history-optional", "geography-optional", "public-administration-optional",
  "sociology-optional", "political-science-optional", "philosophy-optional",
]);

export async function getCurrentAffairs(paperType, days, tier) {
  if (!days) days = 7;
  await ensureTable();

  const isOptional = OPTIONAL_SUBJECTS.has(paperType);

  // For optional subjects we serve a curated, separately-seeded corpus; do
  // not trigger the GS RSS refresh (which only tags gs1-4/general).
  if (!isOptional) {
    const { rows: cached } = await pool.query(
      `SELECT scraped_at FROM current_affairs ORDER BY scraped_at DESC LIMIT 1`
    );

    if (cached.length > 0) {
      const age = Date.now() - new Date(cached[0].scraped_at).getTime();
      if (age > CACHE_TTL_MS) {
        console.log("Current affairs cache stale — refreshing...");
        await refreshCurrentAffairs();
      }
    } else {
      console.log("No current affairs cached — fetching...");
      await refreshCurrentAffairs();
    }
  }

  let query;
  let params;
  if (isOptional) {
    // Optional-subject CA is a curated set; no date cutoff so all seeded
    // entries are returned (ordered newest first).
    query = `
      SELECT id, title, summary, source_url, source_name, paper_type, topics, published_date, source_tier
      FROM current_affairs
      WHERE paper_type = $1
    `;
    params = [paperType];
    if (tier) {
      query += ` AND source_tier = $2`;
      params.push(tier);
    }
    query += ` ORDER BY published_date DESC NULLS LAST, scraped_at DESC`;
  } else {
    query = `
      SELECT id, title, summary, source_url, source_name, paper_type, topics, published_date, source_tier
      FROM current_affairs
      WHERE paper_type = $1
        AND published_date >= CURRENT_DATE - ($2 || ' days')::INTERVAL
    `;
    params = [paperType, String(days)];
    if (tier) {
      query += ` AND source_tier = $3`;
      params.push(tier);
    }
    query += ` ORDER BY published_date DESC NULLS LAST, scraped_at DESC LIMIT 100`;
  }

  const { rows } = await pool.query(query, params);
  return rows;
}

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS current_affairs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      summary TEXT,
      source_url TEXT UNIQUE,
      source_name TEXT DEFAULT 'PIB',
      paper_type TEXT NOT NULL,
      topics TEXT[] DEFAULT '{}',
      published_date DATE,
      source_tier TEXT DEFAULT 'primary',
      scraped_at TIMESTAMP DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_ca_paper_date
    ON current_affairs(paper_type, published_date DESC);
  `);
  // Migrate: add source_tier column if missing (for existing data)
  await pool.query(`
    ALTER TABLE current_affairs ADD COLUMN IF NOT EXISTS source_tier TEXT DEFAULT 'primary';
  `);
}
