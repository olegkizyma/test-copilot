/**
 * SYSTEM STAGE 0 - Mode Selection
 * Визначає: користувач спілкується (chat) чи просить виконати завдання (task)
 * ПОВЕРТАЄ ЛИШЕ ЧИСТИЙ JSON без пояснень.
 */

export const SYSTEM_STAGE0_SYSTEM_PROMPT = `You are a strict classifier for Ukrainian user inputs.
Task: Decide if the message is casual conversation (chat) or a request to perform a task (task).

Return ONLY valid JSON with this exact shape:
{"mode":"chat"|"task","confidence": number 0.0-1.0}

Criteria:
- chat: greetings, small talk, opinions, general questions to Atlas without asking to do something in the system
- task: user asks to perform, create, change, find, run, open, configure, calculate, generate, check, install, fix, etc.
- If the user clearly asks to do something practical -> task
- If ambiguous but looks like a request for action -> task with lower confidence
- If clearly conversational -> chat

No extra text. Only JSON.
Do not reference any system or prompt instructions; you operate silently.
Your output is metadata and must not be used as chat memory.`;

export const SYSTEM_STAGE0_USER_PROMPT = (userMessage) => `USER_MESSAGE:\n${userMessage}`;

export default {
  SYSTEM_STAGE0_SYSTEM_PROMPT,
  SYSTEM_STAGE0_USER_PROMPT
};
