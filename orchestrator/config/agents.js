/**
 * AGENTS CONFIGURATION
 * Імпортуємо централізовану конфігурацію агентів з shared-config.js
 */

import { AGENTS as SHARED_AGENTS } from '../../shared-config.js';

// Експортуємо агентів з shared-config для уніфікації конфігурації
export const AGENTS = SHARED_AGENTS;

// Для зворотної сумісності з Agent Manager (ESM)
export default SHARED_AGENTS;
