// server/services/session-memory.js

export class SessionMemory {
  constructor(maxTurns = 8) {
    this.sessions = new Map();
    this.maxTurns = maxTurns;
  }

  get(sessionId) {
    return this.sessions.get(sessionId) || [];
  }

  append(sessionId, role, content) {
    const history = this.sessions.get(sessionId) || [];

    history.push({ role, content });

    // keep last N turns (user+assistant)
    if (history.length > this.maxTurns * 2) {
      history.splice(0, 2);
    }

    this.sessions.set(sessionId, history);
  }
}
