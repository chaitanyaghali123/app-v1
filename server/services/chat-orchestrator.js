// server/services/chat-orchestrator.js

import { SessionMemory } from "./session-memory.js";
import { LLMRouter } from "./llm-router.js";

import { OpenAILLM } from "./llms/openai.llm.js";
import { AnthropicLLM } from "./llms/anthropic.llm.js";

const memory = new SessionMemory(6); // keep last 6 messages (3 Q&A)

const router = new LLMRouter([
  new OpenAILLM(),
  new AnthropicLLM()
]);

export async function chat({
  sessionId,
  prompt,
  chunks = null,
  subject_id = "General",
  user_id = "anon",
  mode = "ask"
}) {
  // ---- store user message ----
  if (sessionId) {
    memory.append(sessionId, "user", prompt);
  }

  // ---- get session history ----
  const history = sessionId ? memory.get(sessionId) : [];

  // ---- call router with memory ----
  const { out, provider } = await router.generate({
    prompt,
    history,   // ✅ PASS MEMORY
    chunks,
    subject_id,
    user_id,
    mode
  });

  // ---- store assistant reply ----
  if (sessionId) {
    memory.append(sessionId, "assistant", out);
  }

  return {
    answer: out,
    provider
  };
}
