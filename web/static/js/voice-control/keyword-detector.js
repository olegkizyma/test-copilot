/**
 * Менеджер розпізнавання ключового слова ATLAS
 * Відповідає за детекцію слова "Атлас" та генерацію відповідей
 */

import { VOICE_CONFIG } from './config.js';
import { logger } from '../core/logger.js';

export class KeywordDetectionManager {
    constructor() {
        this.logger = new logger.constructor('KEYWORD_DETECTOR');
        this.isActive = false;
        this.recognition = null;
        this.isInitialized = false;
        this._recognitionRunning = false;
        this._manualStop = false;
        this.onKeywordDetected = null;
        this.onSpeechResult = null;
        this.noSpeechCount = 0;
        this.totalNoSpeechErrors = 0;
        this.maxNoSpeechAttempts = 3;
        this.isRestarting = false;
        this.baseRestartDelay = 100;
        this.maxRestartDelay = 10000; // максимум 10 секунд
        
        this.logger.info('Keyword Detection Manager initialized');
    }

    /**
     * Ініціалізація розпізнавання мови для детекції ключового слова
     */
    initialize() {
        if (this.isInitialized && this.recognition) {
            return true;
        }
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            this.logger.error('Speech Recognition not supported in this browser');
            return false;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();
        
        // Налаштування розпізнавання
        this.recognition.lang = VOICE_CONFIG.SPEECH_RECOGNITION.language;
        this.recognition.continuous = VOICE_CONFIG.SPEECH_RECOGNITION.continuous;
        this.recognition.interimResults = VOICE_CONFIG.SPEECH_RECOGNITION.interimResults;
        this.recognition.maxAlternatives = VOICE_CONFIG.SPEECH_RECOGNITION.maxAlternatives;

        this.setupEventListeners();
        this.isInitialized = true;
        return true;
    }

    /**
     * Налаштування обробників подій для розпізнавання мови
     */
    setupEventListeners() {
        this.recognition.onstart = () => {
            this._recognitionRunning = true;
            this.logger.info('🎤 Keyword detection started');
        };

        this.recognition.onresult = (event) => {
            // Успішне розпізнавання - скидаємо лічильник no-speech помилок
            if (this.noSpeechCount > 0) {
                this.logger.debug(`Speech detected, resetting consecutive no-speech counter from ${this.noSpeechCount} to 0.`);
                this.noSpeechCount = 0;
            }

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                const transcript = result[0].transcript.toLowerCase().trim();
                
                this.logger.debug(`Speech result: "${transcript}" (confidence: ${result[0].confidence})`);

                if (result.isFinal) {
                    this.logger.debug(`Final speech successfully recognized, full transcript: "${transcript}"`);
                    
                    // Перевіряємо наявність ключового слова
                    if (this.containsKeyword(transcript)) {
                        this.handleKeywordDetection(transcript);
                    }
                    
                    // Відправляємо результат для обробки як звичайне повідомлення
                    if (this.onSpeechResult) {
                        this.onSpeechResult(transcript);
                    }
                }
            }
        };

        this.recognition.onerror = (event) => {
            // no-speech — нормальный сценарий для пауз, уводим в debug
            if (event.error === 'no-speech') {
                this.logger.debug('Speech recognition: no-speech');
            } else {
                this.logger.error(`Speech recognition error: ${event.error}`);
            }
            // Якщо була ручна зупинка, ігноруємо помилки
            if (this._manualStop) {
                this.logger.debug('Error occurred after manual stop; ignoring.');
                return;
            }
            if (event.error === 'no-speech') {
                this.noSpeechCount++;
                this.totalNoSpeechErrors++;
                this.logger.debug(`No speech detected (consecutive: ${this.noSpeechCount}, total: ${this.totalNoSpeechErrors}), continuing...`);
                
                // Якщо занадто багато спроб без мовлення підряд
                if (this.noSpeechCount >= this.maxNoSpeechAttempts) {
                    this.logger.debug('Too many consecutive no-speech events, increasing restart delay');
                }
            } else {
                // Скидаємо лічильник послідовних помилок для інших помилок
                this.noSpeechCount = 0;
                this.logger.info(`Different error occurred, resetting consecutive no-speech counter: ${event.error}`);
            }
        };

        this.recognition.onend = () => {
            this._recognitionRunning = false;
            this.logger.info('🎤 Keyword detection ended');
            
            // Автоматично перезапускаємо якщо режим активний і не в процесі перезапуску
            if (this.isActive && !this.isRestarting && !this._manualStop) {
                this.isRestarting = true;
                
                // Експоненціальна затримка на основі загальної кількості помилок
                const restartDelay = this.calculateRestartDelay();
                
                this.logger.info(`⏳ Restarting in ${restartDelay}ms (no-speech count: ${this.noSpeechCount})`);
                
                setTimeout(() => {
                    if (this.isActive && !this._manualStop) { // Перевіряємо знову перед перезапуском
                        this.isRestarting = false;
                        this._internalStart();
                    } else {
                        this.isRestarting = false;
                    }
                }, restartDelay);
            }
        };
    }

    /**
     * Перевіряє, чи містить текст ключове слово
     */
    containsKeyword(text) {
        const keyword = VOICE_CONFIG.ACTIVATION_KEYWORD;
        const normalizedText = this.normalizeText(text);
        const normalizedKeyword = this.normalizeText(keyword);
        
        return normalizedText.includes(normalizedKeyword);
    }

    /**
     * Нормалізація тексту для порівняння
     */
    normalizeText(text) {
        return text.toLowerCase()
                  .replace(/['".,!?;:]/g, '')
                  .replace(/\s+/g, ' ')
                  .trim();
    }

    /**
     * Обробка виявлення ключового слова
     */
    handleKeywordDetection(transcript) {
        this.logger.info(`🎯 Keyword detected in: "${transcript}"`);
        
        // Генеруємо випадкову відповідь
        const response = this.getRandomResponse();
        this.logger.info(`🗣️ Generated response: "${response}"`);
        
        // Викликаємо callback якщо встановлений
        if (this.onKeywordDetected) {
            this.onKeywordDetected(response, transcript);
        }
    }

    /**
     * Отримання випадкової відповіді з конфігурації
     */
    getRandomResponse() {
        const responses = VOICE_CONFIG.ACTIVATION_RESPONSES;
        const randomIndex = Math.floor(Math.random() * responses.length);
        return responses[randomIndex];
    }

    /**
     * Розрахунок адаптивної затримки перезапуску
     */
    calculateRestartDelay() {
        // Базова затримка для перших спроб
        if (this.noSpeechCount < this.maxNoSpeechAttempts) {
            return this.baseRestartDelay;
        }
        
        // Експоненціальна затримка для послідовних помилок
        const multiplier = Math.min(this.noSpeechCount - this.maxNoSpeechAttempts + 1, 6); // Максимум 2^6
        const delay = this.baseRestartDelay * Math.pow(2, multiplier);
        
        return Math.min(delay, this.maxRestartDelay);
    }

    /**
     * Внутрішній метод запуску (для автоматичного перезапуску)
     */
    _internalStart() {
        if (!this.recognition) {
            this.logger.error('Speech recognition not initialized');
            return false;
        }

        try {
            // Не запускати, якщо вже запущено
            if (this.isRecognitionActive()) {
                this.logger.warn('Recognition is already active, skipping start call.');
                return false;
            }
            this.recognition.start();
            this.logger.info('🔄 Keyword detection restarted');
            return true;
        } catch (error) {
            this.logger.error('Failed to restart keyword detection:', error);
            // Спробуємо зупинити розпізнавання, щоб вийти з некоректного стану
            try {
                this.recognition.stop();
                this.logger.info('Forced stop of recognition due to restart failure.');
            } catch (stopError) {
                this.logger.error('Failed to force stop recognition:', stopError);
            }
            this.isActive = false;
            return false;
        }
    }

    /**
     * Запуск режиму детекції ключового слова
     */
    start() {
        if (!this.recognition) {
            this.logger.error('Speech recognition not initialized');
            return false;
        }

        if (this.isActive && !this.isRestarting) {
            this.logger.warn('Keyword detection already active');
            return true;
        }

        try {
            this.isActive = true;
            this.isRestarting = false;
            this.noSpeechCount = 0; // Скидаємо лічильник при ручному запуску
            this.totalNoSpeechErrors = 0; // Скидаємо загальний лічільник
            if (!this.isRecognitionActive()) {
                this.recognition.start();
            } else {
                this.logger.warn('Recognition already started by the browser');
            }
            this.logger.info('🎯 Keyword detection mode activated');
            return true;
        } catch (error) {
            this.logger.error('Failed to start keyword detection:', error);
            this.isActive = false;
            this.isRestarting = false;
            return false;
        }
    }

    /**
     * Зупинка режиму детекції ключового слова
     */
    stop() {
        // Always attempt to stop and clear flags
        this.isActive = false;
        this.isRestarting = false;
        this.noSpeechCount = 0;
        this.totalNoSpeechErrors = 0;
        
        if (this.recognition) {
            try {
                this._manualStop = true;
                const originalOnEnd = this.recognition.onend;
                this.recognition.onend = () => {
                    // suppress single onend after manual stop
                    this._recognitionRunning = false;
                    this.logger.info('🎤 Keyword detection ended (manual stop)');
                    // restore original handler for future starts
                    this.recognition.onend = originalOnEnd;
                    // clear manual stop after one cycle
                    setTimeout(() => { this._manualStop = false; }, 0);
                };
                this.recognition.stop();
            } catch (e) {
                this.logger.warn('Error while stopping recognition (ignored):', e);
            }
        }
        this.logger.info('🎯 Keyword detection mode deactivated');
    }

    /**
     * Встановлення callback для виявлення ключового слова
     */
    setKeywordDetectedCallback(callback) {
        this.onKeywordDetected = callback;
    }

    /**
     * Встановлення callback для результатів мови
     */
    setSpeechResultCallback(callback) {
        this.onSpeechResult = callback;
    }

    /**
     * Перевірка, чи активний режим детекції
     */
    isKeywordModeActive() {
        return this.isActive;
    }

    /**
     * Чи активний зараз об'єкт розпізнавання (бразуерний стан)
     */
    isRecognitionActive() {
        // На жаль, Web Speech API не надає офіційного прапорця "running".
        // Опираємось на евристики: якщо ми щойно стартували або у процесі рестарту.
        // Додатково можна відслідковувати onstart/onend, виставляючи флаг.
        return this._recognitionRunning === true;
    }
}