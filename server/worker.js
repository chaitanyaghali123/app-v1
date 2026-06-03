// server/worker.js

import { Worker } from "bullmq";
import IORedis from "ioredis";

import { handleLLMAnswer } from "./services/llm-response-handler.js"; // ✅ llama-server handler
import { saveRevision } from "./services/db.service.js"; // ✅ real DB storage

// ✅ Redis connection
const connection = new IORedis({
  host: "redis",
  port: 6379,
  maxRetriesPerRequest: null,   // 🔥 REQUIRED
});

// ✅ Worker to process queued LLM jobs
const worker = new Worker(
  "llm-queue",
  async (job) => {
    const { question, userId } = job.data;

    // 🚀 Call local llama-server handler
    const response = await handleLLMAnswer({
      prompt: question,
      user_id: userId || "anon",
      chunks: [],   // optional: pass vector chunks if needed
      history: []   // optional: pass chat history if available
    });

    // ✅ Save to DB
    await saveRevision({
      user_id: userId || "anon",
      prompt: question,
      answer: response.answer,
      tokens_used: response.tokensUsed || 0,
      provider: response.provider || "llama-server"
    });

    // ✅ Return result to BullMQ
    return {
      answer: response.answer,
      tokensUsed: response.tokensUsed || 0,
      provider: response.provider || "llama-server"
    };
  },
  { connection }
);

export default worker;
