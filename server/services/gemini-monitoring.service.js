import crypto from "crypto";

const startedAt = Date.now();
const counters = new Map();
const latencyBucketsMs = [250, 500, 1000, 2500, 5000, 10000, 30000, 60000, 120000];

function labelKey(labels = {}) {
  return Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(",");
}

function counterKey(name, labels) {
  return `${name}|${labelKey(labels)}`;
}

function incrementCounter(name, labels = {}, value = 1) {
  const key = counterKey(name, labels);
  counters.set(key, (counters.get(key) || 0) + value);
}

function observeLatency(route, outcome, latencyMs) {
  for (const bucket of latencyBucketsMs) {
    if (latencyMs <= bucket) {
      incrementCounter("gemini_request_duration_ms_bucket", {
        route,
        outcome,
        le: bucket,
      });
    }
  }

  incrementCounter("gemini_request_duration_ms_bucket", {
    route,
    outcome,
    le: "+Inf",
  });
  incrementCounter("gemini_request_duration_ms_sum", { route, outcome }, latencyMs);
  incrementCounter("gemini_request_duration_ms_count", { route, outcome });
}

export function anonymizeIdentifier(value) {
  if (!value) return "unknown";
  const secret = process.env.METRICS_HASH_SECRET || process.env.GEMINI_ENCRYPTION_SECRET || "metrics";
  return crypto.createHmac("sha256", secret).update(String(value)).digest("hex").slice(0, 16);
}

export function recordGeminiMetric({
  route,
  outcome,
  code = "OK",
  latencyMs = 0,
  tokenCount = 0,
  contextChars = 0,
}) {
  incrementCounter("gemini_requests_total", { route, outcome, code });
  observeLatency(route, outcome, Math.max(0, Math.round(latencyMs)));

  if (tokenCount > 0) {
    incrementCounter("gemini_output_tokens_total", { route }, tokenCount);
  }
  if (contextChars > 0) {
    incrementCounter("gemini_context_chars_total", { route }, contextChars);
  }
}

export function logGeminiEvent(event, fields = {}) {
  const payload = {
    event,
    ts: new Date().toISOString(),
    ...fields,
  };
  console.log(JSON.stringify(payload));
}

export function getGeminiMetricsJson() {
  return {
    service: "gemini-byok",
    startedAt: new Date(startedAt).toISOString(),
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    counters: Array.from(counters.entries()).map(([key, value]) => {
      const [name, labelString] = key.split("|");
      const labels = {};
      if (labelString) {
        for (const part of labelString.split(",")) {
          const idx = part.indexOf("=");
          if (idx > -1) labels[part.slice(0, idx)] = part.slice(idx + 1);
        }
      }
      return { name, labels, value };
    }),
  };
}

export function getGeminiMetricsPrometheus() {
  const lines = [
    "# HELP gemini_requests_total Gemini BYOK request count.",
    "# TYPE gemini_requests_total counter",
    "# HELP gemini_request_duration_ms Gemini BYOK request duration in milliseconds.",
    "# TYPE gemini_request_duration_ms histogram",
    "# HELP gemini_output_tokens_total Gemini BYOK output token count.",
    "# TYPE gemini_output_tokens_total counter",
    "# HELP gemini_context_chars_total Gemini BYOK context character count.",
    "# TYPE gemini_context_chars_total counter",
  ];

  for (const [key, value] of counters.entries()) {
    const [name, labelString] = key.split("|");
    const labels = labelString
      ? `{${labelString
          .split(",")
          .map((part) => {
            const idx = part.indexOf("=");
            const labelName = part.slice(0, idx);
            const labelValue = part.slice(idx + 1).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
            return `${labelName}="${labelValue}"`;
          })
          .join(",")}}`
      : "";
    lines.push(`${name}${labels} ${value}`);
  }

  return `${lines.join("\n")}\n`;
}
