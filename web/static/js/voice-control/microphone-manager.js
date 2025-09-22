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
        
        // Менеджер детекції ключового слова
        this.keywordDetector = new KeywordDetectionManager();
        
        // Менеджер Whisper для високоякісного розпізнавання
        this.whisperManager = new WhisperManager();
        
        // Менеджер результатів Whisper
        this.resultsManager = window.whisperResultsManager || new WhisperResultsManager();
        
        // Стан кнопки та таймери
        this.currentState = VOICE_CONFIG.BUTTON_STATES.IDLE;
        this.holdTimer = null;
        this.clickTimer = null;
        this.isHolding = false;
        
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
     * Обробка натискання кнопки
     */
    handleMouseDown(event) {
        event.preventDefault();
        
        // Дозволяємо взаємодію в режимі ключового слова (для його вимкнення)
        if (this.currentState !== VOICE_CONFIG.BUTTON_STATES.IDLE && 
            this.currentState !== VOICE_CONFIG.BUTTON_STATES.KEYWORD_MODE) {
            return;
        }

        this.isHolding = true;
        
        // Встановлюємо таймер для довгого утримання
        this.holdTimer = setTimeout(() => {
            if (this.isHolding) {
                this.startKeywordMode();
            }
        }, VOICE_CONFIG.MICROPHONE_BUTTON.holdDuration);
    }

    /**
     * Обробка відпускання кнопки
     */
    async handleMouseUp(event) {
        event.preventDefault();
        
        if (!this.isHolding) {
            return;
        }

        this.isHolding = false;
        
        // Очищаємо таймер довгого утримання
        if (this.holdTimer) {
            clearTimeout(this.holdTimer);
            this.holdTimer = null;
        }

        // Якщо кнопка була відпущена швидко - короткий клік (тільки якщо в режимі IDLE)
        if (this.currentState === VOICE_CONFIG.BUTTON_STATES.IDLE) {
            this.handleShortClick();
        }
        // Якщо в режимі запису - зупиняємо запис
        else if (this.currentState === VOICE_CONFIG.BUTTON_STATES.LISTENING) {
            if (this.useWhisper) {
                await this.stopWhisperRecording();
            }
        }
        // Якщо в режимі ключового слова - НЕ вимикаємо його автоматично
        // Режим ключового слова повинен залишатися активним для очікування команди "Атлас"
        else if (this.currentState === VOICE_CONFIG.BUTTON_STATES.KEYWORD_MODE) {
            this.logger.info('🎯 Keyword mode remains active after button release');
            // Не викликаємо stopKeywordMode(), щоб режим залишився активним
        }
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
            this.handleWhisperResult(result.text, 'short', result.language || 'uk');

        } catch (error) {
            this.logger.error('Error stopping Whisper recording:', error);
            this.setState(VOICE_CONFIG.BUTTON_STATES.IDLE);
        }
    }

    /**
     * Обробка результату Whisper транскрипції
     */
    handleWhisperResult(text, mode = 'short', language = 'uk') {
        if (!text || text.trim().length === 0) {
            this.logger.warn('Empty transcription result');
            // Все равно добавляем в таблицу с ошибкой
            this.resultsManager.addWhisperTranscription('', mode, language);
            this.setState(VOICE_CONFIG.BUTTON_STATES.IDLE);
            return;
        }

        this.logger.info(`📝 Whisper result (${mode}): "${text}"`);
        
        // Добавляем результат в таблицу
        this.resultsManager.addWhisperTranscription(text, mode, language);
        
        // НЕ відправляємо автоматично в чат - користувач сам вирішує
        // this.handleStandardSpeechResult(text);
    }

    /**
     * Запуск режиму ключового слова
     */
    startKeywordMode() {
        // Якщо режим ключового слова вже активний, вимикаємо його
        if (this.currentState === VOICE_CONFIG.BUTTON_STATES.KEYWORD_MODE) {
            this.logger.info('👂 Long hold detected - stopping keyword mode');
            this.stopKeywordMode();
            return;
        }
        
        this.logger.info('👂 Long hold detected - starting keyword mode');
        
        this.setState(VOICE_CONFIG.BUTTON_STATES.KEYWORD_MODE);
        
        if (this.keywordDetector.start()) {
            this.logger.info('🎯 Keyword detection mode activated');
        } else {
            this.logger.error('Failed to start keyword detection');
            this.setState(VOICE_CONFIG.BUTTON_STATES.IDLE);
        }
    }

    /**
     * Зупинка режиму ключового слова
     */
    stopKeywordMode() {
        this.logger.info('🛑 Stopping keyword mode');
        
        this.keywordDetector.stop();
        this.setState(VOICE_CONFIG.BUTTON_STATES.IDLE);
    }

    /**
     * Обробка виявлення ключового слова
     */
    async handleKeywordDetected(response, originalTranscript) {
        this.logger.info(`🎯 Keyword detected! Response: "${response}"`);
        
        // Відтворюємо відповідь через TTS
        await this.playTTSResponse(response);
        
        // Після відповіді автоматично переходимо в режим запису
        this.startRecordingAfterKeyword();
    }

    /**
     * Відтворення TTS відповіді
     */
    async playTTSResponse(text) {
        try {
            this.setState(VOICE_CONFIG.BUTTON_STATES.PROCESSING);
            
            // Відправляємо текст на TTS сервер
            const response = await fetch('http://localhost:3001/tts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: text,
                    voice: 'dmytro', // можна зробити конфігурабельним
                    return_audio: true
                })
            });

            if (response.ok) {
                const audioBlob = await response.blob();
                this.logger.info(`🔊 Playing TTS response: "${text}"`);
                
                const audioUrl = URL.createObjectURL(audioBlob);
                const audio = new Audio(audioUrl);
                
                // Відтворюємо аудіо
                await new Promise((resolve) => {
                    audio.onended = () => {
                        URL.revokeObjectURL(audioUrl);
                        resolve();
                    };
                    audio.play();
                });
                
                this.logger.info('✅ TTS response completed');
            } else {
                this.logger.error('TTS request failed:', response.status);
            }
        } catch (error) {
            this.logger.error('Error playing TTS response:', error);
        }
    }

    /**
     * Запуск запису після відповіді на ключове слово
     */
    async startRecordingAfterKeyword() {
        this.logger.info('🎤 Starting recording after keyword detection');
        
        // Тимчасово зупиняємо детекцію ключового слова
        this.keywordDetector.stop();
        
        // Використовуємо Whisper для високоякісного розпізнавання після ключового слова
        if (this.useWhisper) {
            await this.startWhisperRecordingForKeyword();
        } else if (this.standardRecognition) {
            try {
                this.standardRecognition.start();
            } catch (error) {
                this.logger.error('Failed to start recording after keyword:', error);
                this.setState(VOICE_CONFIG.BUTTON_STATES.IDLE);
            }
        }
    }

    /**
     * Запуск Whisper запису після ключового слова
     */
    async startWhisperRecordingForKeyword() {
        try {
            this.setState(VOICE_CONFIG.BUTTON_STATES.LISTENING);
            
            const success = await this.whisperManager.startRecording();
            if (!success) {
                this.logger.error('Failed to start Whisper recording after keyword');
                this.setState(VOICE_CONFIG.BUTTON_STATES.IDLE);
                return;
            }

            // Автоматично зупиняємо через 10 секунд
            this.keywordWhisperTimeout = setTimeout(async () => {
                await this.stopWhisperRecordingForKeyword();
            }, 10000);

        } catch (error) {
            this.logger.error('Error starting Whisper recording after keyword:', error);
            this.setState(VOICE_CONFIG.BUTTON_STATES.IDLE);
        }
    }

    /**
     * Зупинка Whisper запису після ключового слова
     */
    async stopWhisperRecordingForKeyword() {
        if (this.keywordWhisperTimeout) {
            clearTimeout(this.keywordWhisperTimeout);
            this.keywordWhisperTimeout = null;
        }

        try {
            this.setState(VOICE_CONFIG.BUTTON_STATES.PROCESSING);

            const audioBlob = await this.whisperManager.stopRecording();
            if (!audioBlob) {
                this.logger.warn('No audio recorded after keyword');
                this.setState(VOICE_CONFIG.BUTTON_STATES.IDLE);
                return;
            }

            // Транскрибуємо аудіо
            const result = await this.whisperManager.transcribeAudio(audioBlob, 'uk');
            this.handleWhisperResult(result.text, 'long', result.language || 'uk');

        } catch (error) {
            this.logger.error('Error stopping Whisper recording after keyword:', error);
            this.setState(VOICE_CONFIG.BUTTON_STATES.IDLE);
        }
    }

    /**
     * Обробка результату стандартного розпізнавання мови
     */
    handleStandardSpeechResult(transcript) {
        this.logger.info(`📝 Sending message: "${transcript}"`);
        
        // Відправляємо повідомлення через чат менеджер
        if (this.chatManager && this.chatManager.sendMessage) {
            // Встановлюємо текст в input поле
            const inputElement = document.getElementById('message-input');
            if (inputElement) {
                inputElement.value = transcript;
            }
            
            // Відправляємо повідомлення
            this.chatManager.sendMessage(transcript);
        }
    }

    /**
     * Обробка мови в режимі ключового слова (коли не виявлено ключове слово)
     */
    handleKeywordModeSpeech(transcript) {
        // В режимі ключового слова ігноруємо звичайну мову, 
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
                this.micButton.style.background = 'rgba(0, 20, 10, 0.6)';
                this.micButton.title = 'Клік - запис повідомлення | Утримати - режим "Атлас"';
                this.micButton.classList.remove('listening', 'keyword-mode', 'processing');
                break;
                
            case VOICE_CONFIG.BUTTON_STATES.LISTENING:
                this.micButton.style.background = 'rgba(255, 0, 0, 0.4)';
                this.micButton.title = 'Записую повідомлення...';
                this.micButton.classList.add('listening');
                this.micButton.classList.remove('keyword-mode', 'processing');
                break;
                
            case VOICE_CONFIG.BUTTON_STATES.KEYWORD_MODE:
                this.micButton.style.background = 'rgba(0, 0, 255, 0.4)';
                this.micButton.title = 'Режим "Атлас" - скажіть "Атлас" для активації';
                this.micButton.classList.add('keyword-mode');
                this.micButton.classList.remove('listening', 'processing');
                break;
                
            case VOICE_CONFIG.BUTTON_STATES.PROCESSING:
                this.micButton.style.background = 'rgba(255, 165, 0, 0.4)';
                this.micButton.title = 'Обробка...';
                this.micButton.classList.add('processing');
                this.micButton.classList.remove('listening', 'keyword-mode');
                break;
        }
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
}