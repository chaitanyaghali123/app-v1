const baseUrl = (process.env.LOADTEST_BACKEND_URL || "http://localhost:3000").replace(/\/+$/, "");
const totalRequests = readInt("LOADTEST_REQUESTS", 100);
const concurrency = readInt("LOADTEST_CONCURRENCY", 10);
const deviceCount = readInt("LOADTEST_DEVICES", 10);
const targetTokens = readInt("LOADTEST_TARGET_TOKENS", 256);
const storeKeys = process.env.LOADTEST_STORE_KEYS !== "false";
const keys = splitEnv("LOADTEST_GEMINI_API_KEYS");
if (!keys.length && process.env.LOADTEST_GEMINI_API_KEY) {
  keys.push(process.env.LOADTEST_GEMINI_API_KEY);
}
const providedDevices = splitEnv("LOADTEST_DEVICE_IDS");

function readInt(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function splitEnv(name) {
  return String(process.env[name] || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function makeDeviceId(index) {
  const suffix = String(index).padStart(12, "0");
  return `loadtest-${suffix}`;
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

async function readResponseBody(response) {
  const text = await response.text();
  if (!text) return "";
  const errorLine = text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("data: ") && line.includes('"type":"error"'));
  return errorLine || text.slice(0, 500);
}

async function storeKey(deviceId, apiKey) {
  const response = await fetch(`${baseUrl}/api/gemini/store-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId, apiKey }),
  });

  if (!response.ok) {
    throw new Error(`store-key failed for ${deviceId}: ${response.status} ${await response.text()}`);
  }
}

async function runProxyRequest(deviceId, requestNumber) {
  const startedAt = Date.now();
  const response = await fetch(`${baseUrl}/api/gemini/proxy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      deviceId,
      question: process.env.LOADTEST_QUESTION || "Explain the importance of evidence-based answer writing.",
      targetTokens,
      mode: "limited",
      chunks: [
        {
          text:
            process.env.LOADTEST_CHUNK ||
            "Evidence-based answer writing uses relevant facts, clear structure, and source-backed points to keep responses accurate and focused.",
          source: "loadtest",
        },
      ],
    }),
  });
  const body = await readResponseBody(response);
  return {
    requestNumber,
    deviceId,
    ok: response.ok && !body.includes('"type":"error"'),
    status: response.status,
    latencyMs: Date.now() - startedAt,
    body,
  };
}

async function runPool(items, worker) {
  const results = [];
  let next = 0;

  async function loop() {
    while (next < items.length) {
      const current = next++;
      try {
        results[current] = await worker(items[current], current);
      } catch (err) {
        results[current] = {
          ok: false,
          status: 0,
          latencyMs: 0,
          body: err.message,
        };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, loop));
  return results;
}

async function main() {
  const devices = providedDevices.length
    ? providedDevices
    : Array.from({ length: deviceCount }, (_, index) => makeDeviceId(index + 1));

  if (!providedDevices.length && !keys.length) {
    console.error(
      "Set LOADTEST_GEMINI_API_KEY, LOADTEST_GEMINI_API_KEYS, or LOADTEST_DEVICE_IDS for devices that already have stored keys."
    );
    process.exit(1);
  }

  if (storeKeys && keys.length) {
    if (keys.length < devices.length) {
      console.warn(
        "Warning: fewer Gemini keys than devices. This intentionally tests key-sharing abuse controls and may trigger GEMINI_KEY_SHARED_TOO_MUCH."
      );
    }

    console.log(`Storing keys for ${devices.length} devices...`);
    const storeResults = await runPool(devices, (deviceId, index) => storeKey(deviceId, keys[index % keys.length]));
    const storeFailures = storeResults.filter((result) => result?.ok === false);
    if (storeFailures.length > 0) {
      console.error(
        JSON.stringify(
          {
            error: "Failed to store one or more Gemini keys before the load test.",
            failures: storeFailures.slice(0, 5).map((failure) => failure.body),
          },
          null,
          2
        )
      );
      process.exit(1);
    }
  }

  const requestPlan = Array.from({ length: totalRequests }, (_, index) => ({
    requestNumber: index + 1,
    deviceId: devices[index % devices.length],
  }));

  console.log(
    `Running Gemini BYOK load test: ${totalRequests} requests, concurrency ${concurrency}, devices ${devices.length}`
  );
  const startedAt = Date.now();
  const results = await runPool(requestPlan, (item) => runProxyRequest(item.deviceId, item.requestNumber));
  const elapsedMs = Date.now() - startedAt;

  const ok = results.filter((result) => result.ok);
  const failed = results.filter((result) => !result.ok);
  const latencies = ok.map((result) => result.latencyMs);
  const statusCounts = results.reduce((acc, result) => {
    acc[result.status] = (acc[result.status] || 0) + 1;
    return acc;
  }, {});

  console.log(JSON.stringify({
    totalRequests,
    concurrency,
    devices: devices.length,
    elapsedMs,
    requestsPerSecond: Math.round((totalRequests / (elapsedMs / 1000)) * 100) / 100,
    success: ok.length,
    failed: failed.length,
    statusCounts,
    latencyMs: {
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      p99: percentile(latencies, 99),
      max: latencies.length ? Math.max(...latencies) : 0,
    },
    sampleFailures: failed.slice(0, 5).map((result) => ({
      status: result.status,
      body: result.body,
    })),
  }, null, 2));

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
