// server/services/llm-router.js

export class LLMRouter {
  constructor(llms = []) {
    this.llms = llms;
  }

  async generate(payload) {
    let lastErr;

    for (const llm of this.llms) {
      try {
        console.log(`🤖 Trying LLM: ${llm.name}`);
        const out = await llm.generate(payload);
        console.log(`✅ Success with ${llm.name}`);
        return { out, provider: llm.name };
      } catch (err) {
        console.error(`❌ ${llm.name} failed:`, err.message);
        lastErr = err;

        // Fallback only on infra / quota errors
        const status =
          err.response?.status ||
          err.status ||
          err.code;

        if (status && ![429, 500, 502, 503].includes(status)) {
          throw err; // don't fallback on prompt/logic bugs
        }
      }
    }

    throw lastErr || new Error("All LLM providers failed");
  }
}
