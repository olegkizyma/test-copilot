/**
 * Головний модуль системи голосового управління ATLAS
 * Експортує всі компоненти для використання в основній програмі
 */

export { VOICE_CONFIG } from './config.js';
export { KeywordDetectionManager } from './keyword-detector.js';
export { MicrophoneButtonManager } from './microphone-manager.js';
export { WhisperManager } from './whisper-manager.js';
export { WhisperResultsManager } from './whisper-results.js';

// Импортируем для глобального доступа
import { MicrophoneButtonManager } from './microphone-manager.js';

// Делаем MicrophoneButtonManager доступным глобально
if (typeof window !== 'undefined') {
    window.MicrophoneButtonManager = MicrophoneButtonManager;
}

/**
 * Фабрика для створення повної системи голосового управління
 */
export class VoiceControlSystem {
    constructor(chatManager) {
        this.chatManager = chatManager;
        this.microphoneManager = null;
        this.isInitialized = false;
    }

    /**
     * Ініціалізація системи голосового управління
     */
    async initialize() {
        if (this.isInitialized) {
            return true;
        }

        try {
            // Створюємо менеджер кнопки мікрофону
            this.microphoneManager = new MicrophoneButtonManager(this.chatManager);
            
            // Ініціалізуємо його
            const success = await this.microphoneManager.initialize();
            
            if (success) {
                this.isInitialized = true;
                console.log('🎤 Voice Control System initialized successfully');
                return true;
            } else {
                console.error('❌ Failed to initialize Voice Control System');
                return false;
            }
        } catch (error) {
            console.error('❌ Error initializing Voice Control System:', error);
            return false;
        }
    }

    /**
     * Отримання менеджера мікрофону
     */
    getMicrophoneManager() {
        return this.microphoneManager;
    }

    /**
     * Перевірка стану ініціалізації
     */
    isReady() {
        return this.isInitialized;
    }
}