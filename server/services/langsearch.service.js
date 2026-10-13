import fetch from "node-fetch";
import NodeCache from "node-cache";

const searchCache = new NodeCache({ stdTTL: 10800 }); // 3 hours

export async function fetchLangSearchContext(userQuery) {
  const apiKey = process.env.LANGSEARCH_API_KEY;
  if (!apiKey) return "";

  const cachedKey = userQuery?.trim()?.toLowerCase();
  if (cachedKey && searchCache.has(cachedKey)) {
    return searchCache.get(cachedKey);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2500); // 2.5s timeout

  try {
    const response = await fetch("https://api.langsearch.com/v1/web-search", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: userQuery,
        count: 4,
        freshness: "oneMonth",
        includeDomains: [
          "pib.gov.in",
          "prsindia.org",
          "indiankanoon.org", "indiacode.nic.in",
          "egazette.gov.in",
        ],
        contents: {
          text: { maxCharacters: 800 },
        },
      }),
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[LangSearch] Skipped. Status: ${response.status}`);
      return "";
    }

    const data = await response.json();
    const webPages = data?.data?.webPages?.value || [];

    if (webPages.length === 0) return "";

    const ctx = webPages
      .map((page, index) => {
        const name = page?.name || "(untitled)";
        const url = page?.url || "";
        const date = page?.datePublished || "Recent";
        const text = page?.text || page?.snippet || "";
        return `[Source ${index + 1}] ${name}\nURL: ${url}\nDate: ${date}\nSnippet: ${text}`;
      })
      .join("\n\n");

    if (cachedKey) {
      searchCache.set(cachedKey, ctx);
    }
    return ctx;
  } catch (err) {
    clearTimeout(timeoutId);
    console.error("[LangSearch] Error or Timeout, falling back:", err.message);
    return "";
  }
}

export function buildLangSearchPrompt(originalPrompt, context) {
  if (!context) return originalPrompt;
  return `You are an expert UPSC Civil Services examination evaluator.

OFFICIAL GOVERNMENT CONTEXT:
${context}

CRITICAL INSTRUCTIONS:
1. Answer the student's question using the provided official context whenever available.
2. Cite source URLs directly in your answer where appropriate.\n2. If the question requires current/recent information and the provided context is incomplete or missing key details, clearly state uncertainty and do NOT invent dates, statistics, figures, or provisions. State that current sources could not be fully verified.\n3. Distinguish between facts you are able to support from the context and general explanatory knowledge. Do not present sourced-looking specifics unless you can point to the provided sources.\n4. Answer strictly in English and follow UPSC Mains style.\n\nSTUDENT QUESTION:
${originalPrompt}`;
}