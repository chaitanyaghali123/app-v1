import crypto from "crypto";
import fsp from "fs/promises";
import path from "path";
import axios from "axios";
import { getRedisClient } from "../config/redis.js";

const QUEUE_KEY = process.env.INGEST_QUEUE_KEY || "ingest:queue";
const STATUS_PREFIX = process.env.INGEST_STATUS_PREFIX || "ingest:job:";
const STATUS_TTL_SECONDS = Number(process.env.INGEST_JOB_TTL_SECONDS || 7 * 24 * 60 * 60);
const WORKER_POLL_TIMEOUT_SECONDS = Number(process.env.INGEST_WORKER_POLL_TIMEOUT_SECONDS || 5);
const INGEST_TIMEOUT_MS = Number(process.env.INGEST_TIMEOUT_MS || 10 * 60 * 1000);
const UPLOAD_DIR = path.resolve(process.env.INGEST_UPLOAD_DIR || "uploads/ingest-jobs");

let stopRequested = false;

function nowIso() {
  return new Date().toISOString();
}

function getVectorApiBase() {
  return process.env.FASTAPI_URL || process.env.VECTOR_API || "http://aryabhata-ingestor:7860";
}

function sanitizeFilename(filename) {
  return path
    .basename(String(filename || "upload.bin"))
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 120);
}

function statusKey(jobId) {
  return `${STATUS_PREFIX}${jobId}`;
}

function getRedisOrThrow() {
  const redis = getRedisClient();
  if (!redis) {
    throw new Error("Redis is required for async ingestion jobs.");
  }
  return redis;
}

export function isIngestQueueEnabled() {
  return process.env.INGEST_ASYNC_ENABLED === "true" && Boolean(getRedisClient());
}

export async function getIngestJobStatus(jobId) {
  const redis = getRedisOrThrow();
  const raw = await redis.get(statusKey(jobId));
  if (!raw) return null;
  return JSON.parse(raw);
}

async function setIngestJobStatus(jobId, patch) {
  const redis = getRedisOrThrow();
  let previous = {};
  try {
    previous = (await getIngestJobStatus(jobId)) || {};
  } catch {}

  const next = {
    ...previous,
    ...patch,
    id: jobId,
    updatedAt: nowIso(),
  };
  await redis.set(statusKey(jobId), JSON.stringify(next), "EX", STATUS_TTL_SECONDS);
  return next;
}

async function pushJob(job) {
  const redis = getRedisOrThrow();
  await redis.rpush(QUEUE_KEY, JSON.stringify(job));
}

export async function enqueueDocumentIngest(document) {
  const jobId = crypto.randomUUID();
  const job = {
    id: jobId,
    type: "document",
    document,
    createdAt: nowIso(),
  };

  await setIngestJobStatus(jobId, {
    status: "queued",
    type: job.type,
    createdAt: job.createdAt,
  });
  await pushJob(job);
  return getIngestJobStatus(jobId);
}

export async function enqueueFileIngest(file) {
  const jobId = crypto.randomUUID();
  const safeName = sanitizeFilename(file.originalname);
  await fsp.mkdir(UPLOAD_DIR, { recursive: true });

  const filePath = path.join(UPLOAD_DIR, `${jobId}-${safeName}`);
  await fsp.writeFile(filePath, file.buffer);

  const job = {
    id: jobId,
    type: "file",
    file: {
      path: filePath,
      originalname: safeName,
      mimetype: file.mimetype || "application/octet-stream",
      size: file.size || file.buffer?.length || 0,
    },
    createdAt: nowIso(),
  };

  await setIngestJobStatus(jobId, {
    status: "queued",
    type: job.type,
    filename: safeName,
    size: job.file.size,
    createdAt: job.createdAt,
  });
  await pushJob(job);
  return getIngestJobStatus(jobId);
}

async function forwardDocument(job) {
  const response = await axios.post(
    `${getVectorApiBase()}/ingest-hybrid`,
    { document: job.document },
    { timeout: INGEST_TIMEOUT_MS }
  );
  return response.data;
}

async function forwardFile(job) {
  const response = await axios.post(
    `${getVectorApiBase()}/ingest-file`,
    { file_path: job.file.path },
    { timeout: INGEST_TIMEOUT_MS }
  );
  return response.data;
}

export async function processIngestJob(job) {
  await setIngestJobStatus(job.id, {
    status: "running",
    startedAt: nowIso(),
  });

  try {
    const result = job.type === "file" ? await forwardFile(job) : await forwardDocument(job);
    await setIngestJobStatus(job.id, {
      status: "completed",
      completedAt: nowIso(),
      result,
    });
    return result;
  } catch (err) {
    await setIngestJobStatus(job.id, {
      status: "failed",
      failedAt: nowIso(),
      error: err.response?.data?.error || err.response?.data || err.message || "Ingestion failed",
    });
    throw err;
  } finally {
    if (job.type === "file" && job.file?.path) {
      await fsp.unlink(job.file.path).catch(() => {});
    }
  }
}

async function waitForRedis(timeoutMs = 30000) {
  const started = Date.now();
  const redis = getRedisOrThrow();
  while (Date.now() - started < timeoutMs) {
    try {
      await redis.ping();
      return redis;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error("Redis did not become ready for ingestion worker.");
}

async function workerLoop(workerId, redis) {
  const blockingRedis = redis.duplicate({ maxRetriesPerRequest: null });
  blockingRedis.on("error", (err) => {
    console.error(`[ingest-worker:${workerId}] redis error:`, err.message);
  });

  try {
    await blockingRedis.ping();
    console.log(`[ingest-worker:${workerId}] started`);

    while (!stopRequested) {
      const item = await blockingRedis.blpop(QUEUE_KEY, WORKER_POLL_TIMEOUT_SECONDS);
      if (!item) continue;

      const rawJob = item[1];
      let job;
      try {
        job = JSON.parse(rawJob);
        await processIngestJob(job);
        console.log(`[ingest-worker:${workerId}] completed job ${job.id}`);
      } catch (err) {
        console.error(
          `[ingest-worker:${workerId}] failed job ${job?.id || "unknown"}:`,
          err.message
        );
      }
    }
  } finally {
    blockingRedis.disconnect();
  }
}

export function stopIngestWorker() {
  stopRequested = true;
}

export async function runIngestWorker() {
  stopRequested = false;
  const redis = await waitForRedis();
  const concurrency = Math.max(1, Number(process.env.INGEST_WORKER_CONCURRENCY || 2));
  await Promise.all(
    Array.from({ length: concurrency }, (_, index) => workerLoop(index + 1, redis))
  );
}
