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
        this._listenersBound = false;
        this.onKeywordDetected = null;
        this.onSpeechResult = null;
        this.noSpeechCount = 0;
        this.totalNoSpeechErrors = 0;
        this.maxNoSpeechAttempts = 3;
        this.isRestarting = false;
        this.baseRestartDelay = 100;
        this.maxRestartDelay = 10000; // максимум 10 секунд
        // Додаткові лічильники та флаги для мережевих збоїв/кулдаунів
        this.networkErrorCount = 0;
        this.maxNetworkBackoff = 30000; // до 30 секунд
        this.cooldownUntil = 0;
        this.lastErrorType = null; // 'no-speech' | 'network' | інше | null
        
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
        this.bindGlobalGuards();
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
            // При успішному старті скидаємо помилки мережі/кулдауни
            this.lastErrorType = null;
            this.networkErrorCount = 0;
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
                this.lastErrorType = 'no-speech';
            } else {
                this.logger.error(`Speech recognition error: ${event.error}`);
                this.lastErrorType = event.error;
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
            } else if (event.error === 'network') {
                // Обробка мережевих збоїв: збільшуємо backoff і не спамимо рестартами
                this.networkErrorCount++;
                this.noSpeechCount = 0; // не враховуємо no-speech при мережевих
                const delay = this.calculateNetworkBackoff();
                const now = Date.now();
                this.cooldownUntil = Math.max(this.cooldownUntil, now + delay);
                const online = this.isOnline();
                this.logger.warn(`Network error (${this.networkErrorCount}). ${online ? 'Online' : 'Offline'}; cooldown for ${delay}ms (until ${new Date(this.cooldownUntil).toLocaleTimeString()}).`);
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
            if (this.isActive && !this._manualStop) {
                const guardReason = this.getGuardReason();
                if (guardReason) {
                    this.logger.warn(`⏸️ Restart blocked: ${guardReason}`);
                    // Спробуємо ще раз після невеликої паузи
                    setTimeout(() => this.tryRestart(), 1000);
                    return;
                }
                this.tryRestart();
            }
        };
    }

    bindGlobalGuards() {
        if (this._listenersBound) return;
        this._listenersBound = true;
        window.addEventListener('online', () => {
            this.logger.info('🌐 Browser is online');
            // Знімаємо кулдаун і пробуємо перезапустити, якщо активний режим
            this.cooldownUntil = 0;
            if (this.isActive && !this.isRecognitionActive()) {
                setTimeout(() => this.tryRestart(), 500);
            }
        });
        window.addEventListener('offline', () => {
            this.logger.warn('🌐 Browser is offline — pausing restarts');
        });
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                this.logger.debug('👁️ Tab visible');
                if (this.isActive && !this.isRecognitionActive()) {
                    // невелика пауза, щоб браузер стабілізувався
                    setTimeout(() => this.tryRestart(), 300);
                }
            } else {
                this.logger.debug('👁️ Tab hidden — recognition may pause');
            }
        });
    }

    isOnline() {
        return typeof navigator !== 'undefined' ? (navigator.onLine !== false) : true;
    }

    getGuardReason() {
        if (this.isRestarting) return 'already restarting';
        if (!this.isOnline()) return 'browser offline';
        if (Date.now() < this.cooldownUntil) return 'cooldown active';
        if (document && document.visibilityState === 'hidden') return 'tab hidden';
        return null;
    }

    tryRestart() {
        if (!this.isActive || this._manualStop) return;
        const guardReason = this.getGuardReason();
        if (guardReason) {
            this.logger.debug(`Restart skipped: ${guardReason}`);
            return;
        }
        this.isRestarting = true;
        const restartDelay = this.calculateAdaptiveRestartDelay();
        this.logger.info(`⏳ Restarting in ${restartDelay}ms (reason: ${this.lastErrorType || 'normal'}, no-speech: ${this.noSpeechCount}, network: ${this.networkErrorCount})`);
        setTimeout(() => {
            this.isRestarting = false;
            if (this.isActive && !this._manualStop) {
                this._internalStart();
            }
        }, restartDelay);
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
        // Залишено для зворотньої сумісності: базуємось на no-speech
        if (this.noSpeechCount < this.maxNoSpeechAttempts) return this.baseRestartDelay;
        const multiplier = Math.min(this.noSpeechCount - this.maxNoSpeechAttempts + 1, 6); // Максимум 2^6
        const delay = this.baseRestartDelay * Math.pow(2, multiplier);
        return Math.min(delay, this.maxRestartDelay);
    }

    calculateNetworkBackoff() {
        const base = 1000; // 1s
        const multiplier = Math.min(this.networkErrorCount, 6); // до 64x
        const jitter = Math.floor(Math.random() * 250);
        const delay = base * Math.pow(2, multiplier) + jitter;
        return Math.min(delay, this.maxNetworkBackoff);
    }

    calculateAdaptiveRestartDelay() {
        if (this.lastErrorType === 'network') {
            return this.calculateNetworkBackoff();
        }
        if (this.lastErrorType === 'no-speech') {
            return this.calculateRestartDelay();
        }
        // Інші помилки — помірна затримка
        return 500 + Math.floor(Math.random() * 300);
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
            const guardReason = this.getGuardReason();
            if (guardReason) {
                this.logger.debug(`Start blocked: ${guardReason}`);
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

        // Идемпотентный старт: если уже активен
        if (this.isActive && !this.isRestarting) {
            if (!this.isRecognitionActive()) {
                const guardReason = this.getGuardReason();
                if (guardReason) {
                    this.logger.debug(`Delayed re-start due to: ${guardReason}`);
                    setTimeout(() => this._internalStart(), 300);
                } else {
                    try { this.recognition.start(); } catch (_) {}
                }
            } else {
                this.logger.debug('Keyword detection already active');
            }
            return true;
        }

        try {
            this.isActive = true;
            this.isRestarting = false;
            this.noSpeechCount = 0; // Скидаємо лічильник при ручному запуску
            this.totalNoSpeechErrors = 0; // Скидаємо загальний лічільник
            this.networkErrorCount = 0;
            this.cooldownUntil = 0;
            if (!this.isRecognitionActive()) {
                const guardReason = this.getGuardReason();
                if (guardReason) {
                    this.logger.debug(`Delayed start due to: ${guardReason}`);
                    setTimeout(() => this._internalStart(), 300);
                } else {
                    this.recognition.start();
                }
            } else {
                this.logger.debug('Recognition already started by the browser');
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
        this.networkErrorCount = 0;
        this.cooldownUntil = 0;
        this.lastErrorType = null;
        
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