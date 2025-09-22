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
        return true;
    }

    /**
     * Налаштування обробників подій для розпізнавання мови
     */
    setupEventListeners() {
        this.recognition.onstart = () => {
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
                    this.logger.debug('Final speech successfully recognized, full transcript: "${transcript}"');
                    
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
            this.logger.error(`Speech recognition error: ${event.error}`);
            if (event.error === 'no-speech') {
                this.noSpeechCount++;
                this.totalNoSpeechErrors++;
                this.logger.warn(`No speech detected (consecutive: ${this.noSpeechCount}, total: ${this.totalNoSpeechErrors}), continuing...`);
                
                // Якщо занадто багато спроб без мовлення підряд
                if (this.noSpeechCount >= this.maxNoSpeechAttempts) {
                    this.logger.warn('Too many consecutive no-speech errors, increasing restart delay');
                }
            } else {
                // Скидаємо лічильник послідовних помилок для інших помилок
                this.noSpeechCount = 0;
                this.logger.info(`Different error occurred, resetting consecutive no-speech counter: ${event.error}`);
            }
        };

        this.recognition.onend = () => {
            this.logger.info('🎤 Keyword detection ended');
            
            // Автоматично перезапускаємо якщо режим активний і не в процесі перезапуску
            if (this.isActive && !this.isRestarting) {
                this.isRestarting = true;
                
                // Експоненціальна затримка на основі загальної кількості помилок
                const restartDelay = this.calculateRestartDelay();
                
                this.logger.info(`⏳ Restarting in ${restartDelay}ms (no-speech count: ${this.noSpeechCount})`);
                
                setTimeout(() => {
                    if (this.isActive) { // Перевіряємо знову перед перезапуском
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
            this.recognition.start();
            this.logger.info('🔄 Keyword detection restarted');
            return true;
        } catch (error) {
            this.logger.error('Failed to restart keyword detection:', error);
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
            this.recognition.start();
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
        if (!this.isActive) {
            return;
        }

        this.isActive = false;
        this.isRestarting = false;
        this.noSpeechCount = 0;
        this.totalNoSpeechErrors = 0;
        
        if (this.recognition) {
            this.recognition.stop();
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
}