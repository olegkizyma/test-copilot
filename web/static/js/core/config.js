/**
 * UNIFIED CONFIGURATION SYSTEM
 * Імпорт спільної конфігурації для фронтенду
 */

import { 
    AGENTS as SHARED_AGENTS, 
    API_ENDPOINTS as SHARED_ENDPOINTS,
    TTS_CONFIG as SHARED_TTS_CONFIG,
    VOICE_CONFIG as SHARED_VOICE_CONFIG,
    CHAT_CONFIG as SHARED_CHAT_CONFIG,
    WORKFLOW_STAGES as SHARED_WORKFLOW_STAGES,
    getAgentByName,
    getWorkflowStage,
    getApiUrl
} from '../../../../shared-config.js';

// Експортуємо всі конфігурації зі спільного файлу
export const AGENTS = SHARED_AGENTS;
export const API_ENDPOINTS = SHARED_ENDPOINTS;
export const TTS_CONFIG = SHARED_TTS_CONFIG;
export const VOICE_CONFIG = SHARED_VOICE_CONFIG;
export const CHAT_CONFIG = SHARED_CHAT_CONFIG;
export const WORKFLOW_STAGES = SHARED_WORKFLOW_STAGES;

// Експортуємо utility функції
export { getAgentByName, getWorkflowStage, getApiUrl };
