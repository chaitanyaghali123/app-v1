// server/services/embedder.js

import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config({ path: "/app/.env" });

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY not set");
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 🔥 safe batch size
const MAX_BATCH = 100;

export async function encode(texts) {
  if (!Array.isArray(texts) || texts.length === 0) {
    throw new Error("encode() requires a non-empty array of texts");
  }

  const results = [];

  for (let i = 0; i < texts.length; i += MAX_BATCH) {
    const batch = texts.slice(i, i + MAX_BATCH);

    const response = await client.embeddings.create({
      model: "text-embedding-3-large",
      input: batch,
    });

    if (!response?.data?.length) {
      throw new Error("No embeddings returned from OpenAI");
    }

    results.push(...response.data.map((item) => item.embedding));
  }

  return results;
}