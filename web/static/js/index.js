/**
 * ATLAS FRONTEND - MAIN ENTRY POINT
 * Головний файл для імпорту всіх модулів
 */

// Core modules
export { logger, logMessage, generateMessageId } from './core/logger.js';
export { AGENTS, API_ENDPOINTS, TTS_CONFIG, VOICE_CONFIG, CHAT_CONFIG, WORKFLOW_STAGES } from './core/config.js';
export { ApiClient, orchestratorClient, frontendClient, ttsClient, gooseClient } from './core/api-client.js';

// Feature modules
export { TTSManager } from './modules/tts-manager.js';
export { ChatManager } from './modules/chat-manager.js';

// Main application
export { default as AtlasApp } from './app-refactored.js';

// Backward compatibility - expose globals
import atlasApp from './app-refactored.js';
import { logger } from './core/logger.js';

// Make available globally for legacy code
if (typeof window !== 'undefined') {
    window.atlasApp = atlasApp;
    window.atlasLogger = logger;
}
