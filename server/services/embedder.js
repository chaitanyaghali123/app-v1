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

/**
 * Encode an array of texts into embeddings using OpenAI
 *
 * @param {string[]} texts - Array of text strings to embed
 * @returns {Promise<number[][]>} - Array of embedding vectors
 */
export async function encode(texts) {
  if (!Array.isArray(texts) || texts.length === 0) {
    throw new Error("encode() requires a non-empty array of texts");
  }

  const response = await client.embeddings.create({
    model: "text-embedding-3-large",
    input: texts,
  });

  if (!response?.data?.length) {
    throw new Error("No embeddings returned from OpenAI");
  }

  // Return array of float vectors
  return response.data.map((item) => item.embedding);
}
