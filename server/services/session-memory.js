// server/services/session-memory.js

const TTL_MS = 30 * 60 * 1000; // 30 minutes

export class SessionMemory {
  constructor(maxTurns = 8) {
    this.sessions = new Map();
    this.maxTurns = maxTurns;
    this._startCleanupInterval();
  }

  _startCleanupInterval() {
    setInterval(() => {
      const now = Date.now();
      for (const [id, entry] of this.sessions) {
        if (now - entry.ts > TTL_MS) {
          this.sessions.delete(id);
        }
      }
    }, 60_000);
    this._cleanupTimer?.unref?.();
  }

  get(sessionId) {
    return this.sessions.get(sessionId)?.history || [];
  }

  append(sessionId, role, content) {
    const entry = this.sessions.get(sessionId) || { ts: Date.now(), history: [] };
    entry.ts = Date.now();
    const history = entry.history;

    history.push({ role, content });

    // keep last N turns (user+assistant)
    if (history.length > this.maxTurns * 2) {
      history.splice(0, 2);
    }

    this.sessions.set(sessionId, entry);
  }
}
