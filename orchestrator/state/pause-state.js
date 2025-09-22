// Centralized pause state management per session
const pausedSessions = new Set();

export function setPaused(sessionId, paused) {
  if (!sessionId) return;
  if (paused) pausedSessions.add(sessionId);
  else pausedSessions.delete(sessionId);
}

export function isPaused(sessionId) {
  if (!sessionId) return false;
  return pausedSessions.has(sessionId);
}

export default { setPaused, isPaused };
