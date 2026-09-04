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

const UPSC_URL =
  "https://www.upsc.gov.in/examinations/previous-question-papers";

const ARCHIVE_URL =
  "https://www.upsc.gov.in/examinations/previous-question-papers/archives";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS upsc_pyqs (
      id SERIAL PRIMARY KEY,
      paper TEXT NOT NULL,
      year INTEGER,
      title TEXT NOT NULL,
      pdf_url TEXT NOT NULL UNIQUE,
      source TEXT DEFAULT 'UPSC',
      scraped_at TIMESTAMP DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_upsc_pyqs_paper_year
    ON upsc_pyqs(paper, year DESC);
  `);
}

async function scrapePage(url) {
  try {
    const { data } = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      timeout: 15000,
    });

    const $ = (await loadCheerio()).load(data);
    const results = [];

    // Each PDF link is inside <li> which has the paper name as text
    $("a[href$='.pdf']").each((_, element) => {
      const href = $(element).attr("href");
      if (!href) return;

      const li = $(element).parent();
      const fullText = li.text().replace(/\s+/g, " ").trim();
      const lower = fullText.toLowerCase();

      let paper = null;

      // Match from longest to shortest Roman numeral to avoid partial matches
      // "Paper - IV" before "Paper - I", etc.
      if (
        lower.includes("general studies paper - iv") ||
        lower.includes("general studies - iv") ||
        lower.match(/\bgs[\s-]*iv\b/)
      ) {
        paper = "gs4";
      } else if (
        lower.includes("general studies paper - iii") ||
        lower.includes("general studies - iii") ||
        lower.match(/\bgs[\s-]*iii\b/)
      ) {
        paper = "gs3";
      } else if (
        lower.includes("general studies paper - ii") ||
        lower.includes("general studies - ii") ||
        lower.match(/\bgs[\s-]*ii\b/)
      ) {
        paper = "gs2";
      } else if (
        lower.includes("general studies paper - i") ||
        lower.includes("general studies - i") ||
        lower.match(/\bgs[\s-]*i\b/)
      ) {
        paper = "gs1";
      } else if (lower.startsWith("essay")) {
        paper = "essay";
      }

      if (!paper) return;

      // Skip non-CSE exam papers (CISF, NDA, CDS, CAPF, etc.)
      const examCode = href.match(/QP[-_]?(CISF|NDA|CDSE?|CAPF|IFSM|ESEM|IES)/i)
        || href.match(/CISF/i)
        || decodeURIComponent(href).match(/ESSAY.*PRECIS/i);
      if (examCode) return;

      // Detect exam type from URL — only keep Mains
      const hrefLower = href.toLowerCase();
      if (hrefLower.includes("csp") || hrefLower.includes("prelim")) return;

      // Extract year from URL and surrounding context
      const combined = (href + " " + fullText).toLowerCase();
      let year = null;

      // Try 2-digit year after exam code: CSM-25, CSP-18, CISF-23, CSM19
      const shortYear = combined.match(/(?:csm|csp|cisf|nda|cds|capf|esem|ifsm)[-_]?(\d{2})\D/);
      if (shortYear) {
        const yy = parseInt(shortYear[1], 10);
        year = yy > 50 ? 1900 + yy : 2000 + yy;
      }

      // Try 4-digit year after exam code: CSM_2024, CSP_2026, CSM2024
      if (!year) {
        const fullYear = combined.match(/(?:csm|csp|cisf|nda|cds|capf|esem|ifsm)[-_]?(20\d{2})\D/);
        if (fullYear) year = parseInt(fullYear[1], 10);
      }

      // Try any 4-digit year in the filename
      if (!year) {
        const urlYear = href.match(/[-_](20\d{2})[-_.]/);
        if (urlYear) year = parseInt(urlYear[1], 10);
      }

      // Try full year in the link text
      if (!year) {
        const textYear = fullText.match(/\b(20\d{2})\b/);
        if (textYear) year = parseInt(textYear[1], 10);
      }

      // Clean title: remove file size part like "(1.75 MB)"
      const cleanTitle = fullText.replace(/\([\d.]+\s*(KB|MB|GB)\)/i, "").trim();

      const pdfUrl = new URL(href, url).href;

      results.push({
        paper,
        year,
        title: cleanTitle,
        pdf_url: pdfUrl,
        source: "UPSC",
      });
    });

    return results;
  } catch (err) {
    console.error(`Failed to scrape ${url}:`, err.message);
    return [];
  }
}

export async function refreshPyqs() {
  const current = await scrapePage(UPSC_URL);
  const archive = await scrapePage(ARCHIVE_URL);
  const all = [...current, ...archive];

  if (all.length === 0) {
    console.warn("⚠️  No PYQs scraped — keeping existing cache");
    return { added: 0, total: 0 };
  }

  await ensureTable();

  let added = 0;
  for (const pyq of all) {
    try {
      const { rowCount } = await pool.query(
        `INSERT INTO upsc_pyqs (paper, year, title, pdf_url, source)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (pdf_url) DO NOTHING`,
        [pyq.paper, pyq.year, pyq.title, pyq.pdf_url, pyq.source]
      );
      added += rowCount;
    } catch (err) {
      console.error(`Failed to cache PYQ: ${pyq.title}`, err.message);
    }
  }

  const { rows } = await pool.query("SELECT COUNT(*) FROM upsc_pyqs");
  console.log(`✅ PYQ cache refreshed: ${added} new, ${rows[0].count} total`);

  return { added, total: parseInt(rows[0].count, 10) };
}

export async function getPyqs(paper) {
  await ensureTable();

  const { rows: cached } = await pool.query(
    `SELECT scraped_at FROM upsc_pyqs LIMIT 1`
  );

  if (cached.length > 0) {
    const age = Date.now() - new Date(cached[0].scraped_at).getTime();
    if (age < CACHE_TTL_MS) {
      const { rows } = await pool.query(
        `SELECT paper, year, title, pdf_url, source
         FROM upsc_pyqs
         WHERE paper = $1
         ORDER BY year DESC NULLS LAST, title`,
        [paper]
      );
      return rows;
    }
  }

  console.log("🔄 PYQ cache stale or empty — refreshing...");
  await refreshPyqs();

  const { rows } = await pool.query(
    `SELECT paper, year, title, pdf_url, source
     FROM upsc_pyqs
     WHERE paper = $1
     ORDER BY year DESC NULLS LAST, title`,
    [paper]
  );
  return rows;
}
