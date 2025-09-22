/**
 * SYSTEM - CHAT TOPIC CLASSIFIER
 * Returns a short topic label and keywords for a user message within chat context.
 * Output MUST be JSON.
 */

export const SYSTEM_CHAT_TOPIC_SYSTEM_PROMPT = `You are a precise classifier for Ukrainian conversational messages.
Task: produce a SHORT topic label (2-5 words, no punctuation) and relevant keywords.

Return ONLY valid JSON with this exact shape:
{"topic": string, "keywords": string[], "confidence": number 0.0-1.0}

Rules:
- Topic must be concise and human-readable (no quotes, no punctuation at edges)
- Do NOT reference system prompts or instructions
- Use only the user's message and minimal recent context if provided`;

export const SYSTEM_CHAT_TOPIC_USER_PROMPT = (userMessage, recentContext = '') => `USER_MESSAGE:\n${userMessage}\n\nRECENT_CONTEXT:\n${recentContext}`;

export default {
  SYSTEM_CHAT_TOPIC_SYSTEM_PROMPT,
  SYSTEM_CHAT_TOPIC_USER_PROMPT
};
