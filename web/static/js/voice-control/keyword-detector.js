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
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                const transcript = result[0].transcript.toLowerCase().trim();
                
                this.logger.debug(`Speech result: "${transcript}" (confidence: ${result[0].confidence})`);

                if (result.isFinal) {
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
                this.logger.warn('No speech detected, continuing...');
            }
        };

        this.recognition.onend = () => {
            this.logger.info('🎤 Keyword detection ended');
            // Автоматично перезапускаємо якщо режим активний
            if (this.isActive) {
                setTimeout(() => this.start(), 100);
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
     * Запуск режиму детекції ключового слова
     */
    start() {
        if (!this.recognition) {
            this.logger.error('Speech recognition not initialized');
            return false;
        }

        if (this.isActive) {
            this.logger.warn('Keyword detection already active');
            return true;
        }

        try {
            this.isActive = true;
            this.recognition.start();
            this.logger.info('🎯 Keyword detection mode activated');
            return true;
        } catch (error) {
            this.logger.error('Failed to start keyword detection:', error);
            this.isActive = false;
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