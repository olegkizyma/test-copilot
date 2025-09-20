/**
 * AGENTS CONFIGURATION
 * Імпорт спільної конфігурації агентів
 */

import { AGENTS as SHARED_AGENTS, generateShortStatus } from '../../shared-config.js';

export const AGENTS = SHARED_AGENTS;

// Експортуємо функцію зі спільної конфігурації
export { generateShortStatus };
