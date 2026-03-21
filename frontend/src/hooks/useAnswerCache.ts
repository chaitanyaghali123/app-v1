import { useState } from "react";
import { fetchAnswer } from "../api";
import { getCached, setCached } from "../utils/cache";

export function useAnswerCache(subjectId: string, userId: string) {
  const [loading, setLoading] = useState(false);

  async function getAnswer(prompt: string) {
    const key = `answer:${subjectId}:${userId}:${prompt}`;
    const cached = getCached(key);
    if (cached) return cached;

    setLoading(true);
    const res = await fetchAnswer(prompt, subjectId, userId);
    setCached(key, res); // TTL now comes from .env
    setLoading(false);
    return res;
  }

  return { getAnswer, loading };
}
