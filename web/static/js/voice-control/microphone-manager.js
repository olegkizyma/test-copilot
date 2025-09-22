/**
 * Менеджер кнопки мікрофону з двома режимами
 * 1. Короткий клік - звичайний запис та відправка
 * 2. Довге утримання - режим очікування ключового слова "Атлас"
 */

import { VOICE_CONFIG } from './config.js';
import { logger } from '../core/logger.js';
import { KeywordDetectionManager } from './keyword-detector.js';
import { WhisperManager } from './whisper-manager.js';
import { WhisperResultsManager } from './whisper-results.js';

export class MicrophoneButtonManager {
    constructor(chatManager) {
        this.logger = new logger.constructor('MIC_BUTTON');
        this.chatManager = chatManager;
        
        // Запускаємо детекцію ключового слова
        this.keywordDetector = new KeywordDetectionManager();
        
        // Менеджер Whisper для високоякісного розпізнавання
        this.whisperManager = new WhisperManager();
        
        // Менеджер результатів Whisper
        this.resultsManager = window.whisperResultsManager || new WhisperResultsManager();
        
        // Стан кнопки та таймери
        this.currentState = VOICE_CONFIG.BUTTON_STATES.IDLE;
        this.holdTimer = null;
        this.clickTimer = null;
        this.clickCount = 0; // Лічильник кліків
        this.isHolding = false;
        this.isLongPressMode = false; // Флаг довгого натискання
        this.longHoldActivated = false;
        this.isRecording = false;
        this.isProcessing = false;
        
        // Стандартне розпізнавання мови для короткого кліку (fallback)
        this.standardRecognition = null;
        this.useWhisper = true; // Переваги Whisper над браузерним STT
        
        // Елементи DOM
        this.micButton = null;
        this.buttonText = null;
        
        this.logger.info('Microphone Button Manager initialized');
    }

    /**
     * Ініціалізація менеджера
     */
    async initialize() {
        // Знаходимо кнопку мікрофону
        this.micButton = document.getElementById('microphone-btn');
        if (!this.micButton) {
            this.logger.error('Microphone button not found');
            return false;
        }

        this.buttonText = this.micButton.querySelector('.btn-text');
        if (!this.buttonText) {
            this.logger.error('Button text element not found');
            return false;
        }

        // Ініціалізуємо детектор ключового слова
        if (!this.keywordDetector.initialize()) {
            this.logger.error('Failed to initialize keyword detector');
            return false;
        }

        // Перевіряємо доступність Whisper сервісу
        const whisperAvailable = await this.whisperManager.checkServiceAvailability();
        if (whisperAvailable) {
            this.logger.info('✅ Using Whisper for high-quality speech recognition');
        } else {
            this.logger.warn('⚠️ Whisper not available, falling back to browser STT');
            this.useWhisper = false;
            
            // Ініціалізуємо стандартне розпізнавання мови як fallback
            if (!this.initializeStandardRecognition()) {
                this.logger.error('Failed to initialize standard speech recognition');
                return false;
            }
        }

        // Налаштовуємо обробники подій
        this.setupEventListeners();
        
        // Оновлюємо стан кнопки
        this.updateButtonState();
        
        this.logger.info('✅ Microphone Button Manager ready');
        return true;
    }

    /**
     * Ініціалізація стандартного розпізнавання мови
     */
    initializeStandardRecognition() {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            return false;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.standardRecognition = new SpeechRecognition();
        
        this.standardRecognition.lang = VOICE_CONFIG.SPEECH_RECOGNITION.language;
        this.standardRecognition.continuous = false;
        this.standardRecognition.interimResults = false;
        this.standardRecognition.maxAlternatives = 1;

        // Обробники подій для стандартного розпізнавання
        this.standardRecognition.onstart = () => {
            this.logger.info('🎤 Standard recognition started');
            this.setState(VOICE_CONFIG.BUTTON_STATES.LISTENING);
        };

        this.standardRecognition.onresult = (event) => {
            const result = event.results[0];
            if (result.isFinal) {
                const transcript = result[0].transcript.trim();
                this.logger.info(`📝 Standard recognition result: "${transcript}"`);
                this.handleStandardSpeechResult(transcript);
            }
        };

        this.standardRecognition.onerror = (event) => {
            this.logger.error(`Standard recognition error: ${event.error}`);
            this.setState(VOICE_CONFIG.BUTTON_STATES.IDLE);
        };

        this.standardRecognition.onend = () => {
            this.logger.info('🎤 Standard recognition ended');
            this.setState(VOICE_CONFIG.BUTTON_STATES.IDLE);
        };

        return true;
    }

    /**
     * Налаштування обробників подій
     */
    setupEventListeners() {
        // Обробка натискання кнопки мікрофону
        this.micButton.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.micButton.addEventListener('touchstart', (e) => this.handleMouseDown(e));
        
        this.micButton.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.micButton.addEventListener('touchend', (e) => this.handleMouseUp(e));
        
        this.micButton.addEventListener('mouseleave', (e) => this.handleMouseUp(e));

        // Callbacks для детектора ключового слова
        this.keywordDetector.setKeywordDetectedCallback((response, transcript) => {
            this.handleKeywordDetected(response, transcript);
        });

        this.keywordDetector.setSpeechResultCallback((transcript) => {
            this.handleKeywordModeSpeech(transcript);
        });
    }

    /**
     * Обробка натискання кнопки - НОВА ЛОГІКА
     */
    handleMouseDown(event) {
        event.preventDefault();
        this.logger.info('🕒 MouseDown: Hold started');
        
        // Reset state
        this.isHolding = true;
        this.longHoldActivated = false;
        
        // Clear any existing timer
        if (this.holdTimer) {
            clearTimeout(this.holdTimer);
            this.holdTimer = null;
        }
        
        // Set new timer
        this.holdTimer = setTimeout(() => {
            if (this.isHolding) {
                this.longHoldActivated = true;
                this.logger.info('✅ Long hold confirmed');
            }
        }, VOICE_CONFIG.MICROPHONE_BUTTON.holdDuration);
    }

    /**
     * Обробка відпускання кнопки - НОВА ЛОГІКА
     */
    async handleMouseUp(event) {
        event.preventDefault();
        this.logger.info(`🖱️ MouseUp: isHolding=${this.isHolding}, longHold=${this.longHoldActivated}`);
        
        if (!this.isHolding) {
            this.logger.info('⚠️  Ignoring mouse up - not currently holding');
            return;
        }
        
        this.isHolding = false;
        
        // Clear the hold timer
        if (this.holdTimer) {
            clearTimeout(this.holdTimer);
            this.holdTimer = null;
        }
        
        // Handle states
        if (this.longHoldActivated) {
            this.logger.info('🔵 Activating BLUE mode (long hold)');
            await this.activateBlueMode();
        } else if (this.currentState === VOICE_CONFIG.BUTTON_STATES.IDLE) {
            this.logger.info('🟢 Activating GREEN mode (short click)');
            await this.activateGreenMode();
        } else {
            this.logger.info('🛑 Turning OFF all modes');
            await this.turnOffAllModes();
        }
        
        // Reset the long hold flag
        this.longHoldActivated = false;
    }

    /**
     * Обробка короткого кліку - звичайний запис
     */
    async handleShortClick() {
        this.logger.info('👆 Short click detected - starting recording');
        
        if (this.useWhisper) {
            await this.startWhisperRecording();
        } else if (this.standardRecognition) {
            try {
                this.standardRecognition.start();
            } catch (error) {
                this.logger.error('Failed to start standard recognition:', error);
                this.setState(VOICE_CONFIG.BUTTON_STATES.IDLE);
            }
        }
    }

    /**
     * Запуск запису через Whisper
     */
    async startWhisperRecording() {
        try {
            this.setState(VOICE_CONFIG.BUTTON_STATES.LISTENING);
            
            // Початок запису
            const success = await this.whisperManager.startRecording();
            if (!success) {
                this.logger.error('Failed to start Whisper recording');
                this.setState(VOICE_CONFIG.BUTTON_STATES.IDLE);
                return;
            }

            // Налаштовуємо автоматичну зупинку через 10 секунд або по повторному кліку
            this.whisperRecordingTimeout = setTimeout(async () => {
                await this.stopWhisperRecording();
            }, 10000);

        } catch (error) {
            this.logger.error('Error starting Whisper recording:', error);
            this.setState(VOICE_CONFIG.BUTTON_STATES.IDLE);
        }
    }

    /**
     * Зупинка запису та обробка результату Whisper
     */
    async stopWhisperRecording() {
        if (this.whisperRecordingTimeout) {
            clearTimeout(this.whisperRecordingTimeout);
            this.whisperRecordingTimeout = null;
        }

        try {
            this.setState(VOICE_CONFIG.BUTTON_STATES.PROCESSING);

            const audioBlob = await this.whisperManager.stopRecording();
            if (!audioBlob) {
                this.logger.warn('No audio recorded');
                this.setState(VOICE_CONFIG.BUTTON_STATES.IDLE);
                return;
            }

            // Транскрибуємо аудіо
            const result = await this.whisperManager.transcribeAudio(audioBlob, 'uk');
            this.handleWhisperResult(result, 'short');

        } catch (error) {
            this.logger.error('Error stopping Whisper recording:', error);
            this.setState(VOICE_CONFIG.BUTTON_STATES.IDLE);
        }
    }

    /**
     * Обробка результату Whisper транскрипції
     */
    handleWhisperResult(result, mode = 'short') {
        // Якщо ми в IDLE станірій формат (тільки текст)
        if (typeof result === 'string') {
            result = { text: result, language: 'uk' };
        }

        const text = result.text || '';
        const language = result.language || 'uk';

        if (result.filtered) {
            this.logger.warn(`🚫 Filtered result: "${result.originalText}" - ${result.reason}`);
            // Додаємо в таблицю як відфільтрований
            this.resultsManager.addWhisperTranscription(
                `[FILTERED] ${result.originalText}`, 
                mode, 
                language, 
                { filtered: true, reason: result.reason }
            );
            this.setState(VOICE_CONFIG.BUTTON_STATES.IDLE);
            return;
        }

        if (!text || text.trim().length === 0) {
            this.logger.warn('Empty transcription result');
            this.resultsManager.addWhisperTranscription('', mode, language);
            this.setState(VOICE_CONFIG.BUTTON_STATES.IDLE);
            return;
        }

        this.logger.info(`📝 Whisper result (${mode}): "${text}"`);
        
        // Додаємо результат в таблицю
        this.resultsManager.addWhisperTranscription(text, mode, language);
        
        // НЕ відправляємо автоматично в чат - користувач сам вирішує
        // this.handleStandardSpeechResult(text);
        
        // Повертаємо кнопку в звичайний стан після обробки
        this.setState(VOICE_CONFIG.BUTTON_STATES.IDLE);
    }

    // ==================== НОВІ МЕТОДИ РЕЖИМІВ ====================
    
    /**
     * Вимкнення всіх активних режимів
     */
    async turnOffAllModes() {
        this.logger.info('🛑 Turning off all active modes');
        
        if (this.currentState === VOICE_CONFIG.BUTTON_STATES.GREEN_MODE || this.currentState === VOICE_CONFIG.BUTTON_STATES.BLUE_MODE) {
            await this.deactivateGreenMode();
        } else if (this.currentState === VOICE_CONFIG.BUTTON_STATES.BLUE_MODE) {
            await this.sendToChatAutomatically(text);
        }
        
        this.setState(VOICE_CONFIG.BUTTON_STATES.IDLE);
    }
    
    /**
     * Активація ЗЕЛЕНОГО режиму - безперервне прослуховування
     */
    async activateGreenMode() {
        this.logger.info('🟢 Activating GREEN mode - continuous listening');
        this.setState(VOICE_CONFIG.BUTTON_STATES.GREEN_MODE);
        
        // Запускаємо безперервне прослуховування через Whisper
        // Поки що просто змінюємо стан
    }
    
    /**
     * Деактивація ЗЕЛЕНОГО режиму
     */
    async deactivateGreenMode() {
        this.logger.info('🛑 Deactivating GREEN mode');
        // Зупиняємо будь-які активні записи Whisper
        if (this.whisperManager) {
            await this.whisperManager.stopRecording();
        }
    }
    
    /**
     * Активація СИНЬОГО режиму - режим ключового слова "Атлас"
     */
    async activateBlueMode() {
        this.logger.info('🔵 Activating BLUE mode - keyword detection');
        this.setState(VOICE_CONFIG.BUTTON_STATES.BLUE_MODE);
        
        try {
            if (!this.keywordDetector.isInitialized) {
                this.keywordDetector.initialize();
            }

            const success = await this.keywordDetector.start();
            if (!success) {
                throw new Error('Failed to start keyword detection');
            }

            this.keywordDetector.setKeywordDetectedCallback((response, transcript) => {
                this.handleKeywordDetected(response, transcript);
            });

            this.keywordDetector.setSpeechResultCallback((transcript) => {
                this.handleKeywordModeSpeech(transcript);
            });

            this.logger.info('🎯 Keyword detection activated for "Атлас"');

        } catch (error) {
            this.logger.error('Failed to activate BLUE mode:', error);
            this.setState(VOICE_CONFIG.BUTTON_STATES.IDLE);
        }
    }
    
    /**
     * Деактивація СИНЬОГО режиму
     */
    async deactivateBlueMode() {
        this.logger.info('🛑 Deactivating BLUE mode');
        
        try {
            this.keywordDetector.stop();
            this.keywordDetector.setKeywordDetectedCallback(null);
            this.keywordDetector.setSpeechResultCallback(null);
            this.logger.info('✅ BLUE mode deactivated successfully');
        } catch (error) {
            this.logger.error('Error deactivating BLUE mode:', error);
        }
    }

    /**
     * Обробка виявлення ключового слова
     */
    async handleKeywordDetected(response, originalTranscript) {
        this.logger.info(`🎯 Keyword detected! Response: "${response}"`);
        
        try {
            await this.playTTSResponse(response);
            await this.startRecordingAfterKeyword();
        } catch (error) {
            this.logger.error('Error handling keyword detection:', error);
        }
    }

    /**
     * Запуск запису після виявлення ключового слова
     */
    async startRecordingAfterKeyword() {
        this.logger.info('🎤 Starting recording after keyword detection');
        this.keywordDetector.stop();
        
        try {
            if (this.useWhisper) {
                await this.startWhisperRecordingForKeyword();
            } else if (this.standardRecognition) {
                this.standardRecognition.start();
            }
        } catch (error) {
            this.logger.error('Failed to start recording after keyword:', error);
            this.setState(VOICE_CONFIG.BUTTON_STATES.IDLE);
        }
    }

    /**
     * Запуск Whisper запису для синього режиму
     */
    async startWhisperRecordingForKeyword() {
        try {
            this.setState(VOICE_CONFIG.BUTTON_STATES.LISTENING);
            
            const success = await this.whisperManager.startRecording();
            if (!success) {
                throw new Error('Failed to start Whisper recording');
            }

            this.keywordWhisperTimeout = null;
            setTimeout(async () => {
                await this.stopWhisperRecordingForKeyword();
            }, 10000);

        } catch (error) {
            this.logger.error('Error starting Whisper recording after keyword:', error);
            this.setState(VOICE_CONFIG.BUTTON_STATES.IDLE);
        }
    }

    /**
     * Зупинка Whisper запису для синього режиму
     */
    async stopWhisperRecordingForKeyword() {
        if (this.keywordWhisperTimeout) {
            clearTimeout(this.keywordWhisperTimeout);
        }

        try {
            this.setState(VOICE_CONFIG.BUTTON_STATES.PROCESSING);
            
            const audioBlob = await this.whisperManager.stopRecording();
            if (!audioBlob) {
                throw new Error('No audio recorded');
            }

            const result = await this.whisperManager.transcribeAudio(audioBlob, 'uk');
            this.handleWhisperResult(result, 'keyword');
            
            this.setState(VOICE_CONFIG.BUTTON_STATES.BLUE_MODE);
            this.keywordDetector.start();

        } catch (error) {
            this.logger.error('Error stopping Whisper recording:', error);
            this.setState(VOICE_CONFIG.BUTTON_STATES.IDLE);
        }
    }

    /**
     * Обробка мови в режимі ключового слова (коли не виявлено ключове слово)
     */
    handleKeywordModeSpeech(transcript) {
        // Це клік без попереднього mousedown - ігноруємо звичайну мову, 
        // але можна додати логіку для обробки команд
        this.logger.debug(`Keyword mode speech (ignored): "${transcript}"`);
    }

    /**
     * Встановлення стану кнопки
     */
    setState(newState) {
        this.currentState = newState;
        this.updateButtonState();
        this.logger.debug(`Button state changed to: ${newState}`);
    }

    /**
     * Отримання поточного стану
     */
    getCurrentState() {
        return this.currentState;
    }

    /**
     * Перевірка, чи активний режим ключового слова
     */
    isKeywordModeActive() {
        return this.currentState === VOICE_CONFIG.BUTTON_STATES.KEYWORD_MODE;
    }

    /**
     * Оновлення візуального стану кнопки
     */
    updateButtonState() {
        if (!this.buttonText || !this.micButton) {
            return;
        }

        const state = this.currentState;
        const icon = VOICE_CONFIG.BUTTON_ICONS[state] || VOICE_CONFIG.BUTTON_ICONS.IDLE;
        
        // Оновлюємо іконку
        this.buttonText.textContent = icon;
        
        // Оновлюємо стилі та tooltip
        switch (state) {
            case VOICE_CONFIG.BUTTON_STATES.IDLE:
                this.micButton.style.background = 'rgba(60, 60, 60, 0.6)';
                this.micButton.title = 'Клік - зелений режим | Утримати 2с - синій режим "Атлас"';
                this.micButton.classList.remove('green-mode', 'blue-mode', 'processing');
                break;
                
            case VOICE_CONFIG.BUTTON_STATES.GREEN_MODE:
                this.micButton.style.background = 'rgba(0, 255, 0, 0.6)';
                this.micButton.title = 'ЗЕЛЕНИЙ режим активний - безперервне прослуховування | Клік - вимкнути';
                this.micButton.classList.add('green-mode');
                this.micButton.classList.remove('blue-mode', 'processing');
                break;
                
            case VOICE_CONFIG.BUTTON_STATES.BLUE_MODE:
                this.micButton.style.background = 'rgba(0, 100, 255, 0.6)';
                this.micButton.title = 'СИНІЙ режим активний - очікування "Атлас" | Клік - вимкнути';
                this.micButton.classList.add('blue-mode');
                this.micButton.classList.remove('green-mode', 'processing');
                break;
                
            case VOICE_CONFIG.BUTTON_STATES.PROCESSING:
                this.micButton.style.background = 'rgba(255, 165, 0, 0.6)';
                this.micButton.title = 'Обробка...';
                this.micButton.classList.add('processing');
                this.micButton.classList.remove('green-mode', 'blue-mode');
                break;
                
            // Підтримка старих станів для зворотної сумісності
            case VOICE_CONFIG.BUTTON_STATES.LISTENING:
                this.micButton.style.background = 'rgba(255, 0, 0, 0.4)';
                this.micButton.title = 'Записую повідомлення...';
                this.micButton.classList.add('listening');
                this.micButton.classList.remove('green-mode', 'blue-mode', 'processing');
                break;
                
            case VOICE_CONFIG.BUTTON_STATES.KEYWORD_MODE:
                this.micButton.style.background = 'rgba(0, 0, 255, 0.4)';
                this.micButton.title = 'Старий режим "Атлас"';
                this.micButton.classList.add('keyword-mode');
                this.micButton.classList.remove('green-mode', 'blue-mode', 'processing');
                break;
        }
    }
}