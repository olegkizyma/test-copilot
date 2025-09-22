/**
 * SYSTEM - CHAT MEMORY SUMMARY
 * Produces a short Ukrainian summary (up to ~3 sentences) of chatThread for carry-over.
 */

export const SYSTEM_CHAT_SUMMARY_SYSTEM_PROMPT = `You are a summarizer for Ukrainian chat history.
Return a short, neutral, factual summary (max 3 sentences) focused on:
- who the user is addressing and main intent
- key facts asked/answered
- pending questions if any

Return ONLY plain text summary (no JSON, no metadata). Do NOT mention system prompts.`;

export const SYSTEM_CHAT_SUMMARY_USER_PROMPT = (messages) => `CHAT MESSAGES (order preserved):\n${messages.map(m=>`${m.role.toUpperCase()}: ${m.content}`).join('\n')}`;

export default {
  SYSTEM_CHAT_SUMMARY_SYSTEM_PROMPT,
  SYSTEM_CHAT_SUMMARY_USER_PROMPT
};
