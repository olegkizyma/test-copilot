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
        this.stopModeActive = false;
        this._stopResponseIndex = 0; // для циклічного вибору
        // Управление источником ввода и дедупликацией событий
        this._inputActive = false; // true после down/start, сбрасывается на первом up/end
        this._inputSource = null;  // 'mouse' | 'touch'
        this._lastUpAt = 0;
        // Мікро-лок, щоб серіалізувати доступ до мікрофона (MediaRecorder/getUserMedia)
        this._micLock = false;
        this._micLockTimer = null;
        // Прапор, що зараз виконується пост-ключове слово запис (щоб запобігти передчасному «переозброєнню»)
        this._postKeywordRecordingActive = false;
    // TTS активність/заглушка від самоспрацьовування
    this._ttsActive = false;
    this._lastActivationAt = 0;
        
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
     * Відтворити голосову відповідь перед початком запису після ключового слова
     * 1) Перевага: зовнішній TTS через ChatManager.ttsManager
     * 2) Фолбек: браузерний speechSynthesis (якщо доступний)
     */
    async playTTSResponse(text) {
        if (!text || !text.trim()) return;

        // Спроба через TTSManager
        try {
            // На час TTS ставимо детектор на паузу, щоб уникнути зворотного зв’язку та помилок
            const shouldResumeKeyword = this.keywordDetector?.isKeywordModeActive?.() || this.currentState === VOICE_CONFIG.BUTTON_STATES.BLUE_MODE;
            if (shouldResumeKeyword) {
                try {
                    if (VOICE_CONFIG.DETECTION?.allowKeywordDuringTTS) {
                        this.logger.info('TTS response: keeping keyword detector active (concurrent mode)');
                    } else {
                        this.logger.info('⏸️ Pausing keyword detector during TTS');
                        this.keywordDetector.stop();
                    }
                } catch (_) {}
            }
            if (this.chatManager && this.chatManager.ttsManager && this.chatManager.ttsManager.isEnabled()) {
                await this.chatManager.ttsManager.speak(text, 'atlas');
                // Після зовнішнього TTS нічого не робимо — логіка відновлення є у startRecordingAfterKeyword
                if (shouldResumeKeyword && this.currentState === VOICE_CONFIG.BUTTON_STATES.BLUE_MODE) {
                    this.logger.debug('🔁 Keyword detector will be restarted by post-TTS flow');
                }
                return;
            }
        } catch (e) {
            this.logger.warn('External TTS speak failed, falling back to browser TTS:', e?.message || e);
        }

        // Фолбек: браузерний TTS
        if ('speechSynthesis' in window && 'SpeechSynthesisUtterance' in window) {
            await new Promise((resolve) => {
                try {
                    const utter = new SpeechSynthesisUtterance(text);
                    // Намагаймося вибрати український голос, якщо доступний
                    const pickVoice = () => {
                        const voices = window.speechSynthesis.getVoices();
                        const ua = voices.find(v => (v.lang || '').toLowerCase().startsWith('uk'));
                        const ru = voices.find(v => (v.lang || '').toLowerCase().startsWith('ru'));
                        const en = voices.find(v => (v.lang || '').toLowerCase().startsWith('en'));
                        return ua || ru || en || voices[0];
                    };
                    const setVoice = () => {
                        const voice = pickVoice();
                        if (voice) utter.voice = voice;
                    };
                    // Деякі браузери завантажують голоси асинхронно
                    if (window.speechSynthesis.onvoiceschanged !== undefined) {
                        const once = () => {
                            window.speechSynthesis.onvoiceschanged = null;
                            setVoice();
                        };
                        window.speechSynthesis.onvoiceschanged = once;
                    }
                    setVoice();
                    utter.onend = () => resolve();
                    utter.onerror = () => resolve();
                    window.speechSynthesis.speak(utter);
                } catch (_) {
                    resolve();
                }
            });
        }
    }

    /**
     * Налаштування обробників подій
     */
    setupEventListeners() {
        // Переход на Pointer Events: единый стек для мыши/тача/пера
        this._activePointerId = null;

    this.micButton.addEventListener('pointerdown', (e) => this.handlePointerDown(e));
    this.micButton.addEventListener('pointerup', (e) => this.handlePointerUp(e));
    this.micButton.addEventListener('pointerleave', (e) => this.handlePointerUp(e));
    this.micButton.addEventListener('pointercancel', (e) => this.handlePointerCancel(e));
    // Резервные обработчики для браузеров, генерирующих только mouse-события
    this.micButton.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    this.micButton.addEventListener('mouseup', (e) => this.handleMouseUp(e));
    this.micButton.addEventListener('mouseleave', (e) => this.handleMouseUp(e));

        // Callbacks для детектора ключового слова
        this.keywordDetector.setKeywordDetectedCallback((response, transcript) => {
            this.handleKeywordDetected(response, transcript);
        });

        this.keywordDetector.setSpeechResultCallback((transcript) => {
            this.handleKeywordModeSpeech(transcript);
        });

        // Глобально реагуємо на TTS, щоб уникнути само-активації від голосу АТЛАС
        window.addEventListener('atlas-tts-started', () => {
            try {
                this._ttsActive = true;
                this._lastTtsStartedAt = Date.now();
                if (this.isKeywordModeActive()) {
                    // Якщо дозволено — не пауза, інакше пауза як раніше
                    if (VOICE_CONFIG.DETECTION?.allowKeywordDuringTTS) {
                        this.logger.info('TTS started — keyword detection remains active');
                    } else {
                        this.logger.info('⏸️ TTS started — pausing keyword detector');
                        this.keywordDetector.stop();
                    }
                }
            } catch (_) {}
        });

        window.addEventListener('atlas-tts-completed', () => {
            try {
                this._ttsActive = false;
                if (this.currentState === VOICE_CONFIG.BUTTON_STATES.BLUE_MODE && !this.keywordDetector.isKeywordModeActive()) {
                    // Невелика пауза перед переозброєнням
                    const delay = VOICE_CONFIG.TRANSCRIPTION_BEHAVIOR?.postTTSRecordDelayMs || 0;
                    this.logger.info('▶️ TTS completed — rearming keyword detector');
                    setTimeout(() => {
                        try {
                            if (!this.keywordDetector.isKeywordModeActive() && !this.keywordDetector.isRecognitionActive()) {
                                this.keywordDetector.start();
                            }
                        } catch (_) {}
                    }, delay);
                }
            } catch (_) {}
        });
    }

    /**
     * Обробка натискання кнопки - НОВА ЛОГІКА
     */
    handleMouseDown(event) {
        event.preventDefault();
        this.logger.info('🕒 MouseDown: Hold started');
        
        // Reset state
        if (this._inputActive) {
            // Уже активен вход — вероятно, дублированное событие
            this.logger.debug('Input already active, ignoring duplicate down');
            return;
        }
        this._inputActive = true;
        this._inputSource = (event.type?.startsWith('pointer')) ? 'pointer' : ((event.type === 'touchstart') ? 'touch' : 'mouse');
        // Захватываем указатель, чтобы гарантированно получить pointerup, даже если курсор/палец ушёл с кнопки
        if ('pointerId' in event && typeof event.pointerId === 'number') {
            try { this.micButton.setPointerCapture(event.pointerId); } catch (_) {}
            this._activePointerId = event.pointerId;
        }
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
        // Игнорируем уход, если ничего не удерживали
        if ((event.type === 'mouseleave' || event.type === 'pointerleave') && !this.isHolding && !this._inputActive) {
            return;
        }

        // Если есть activePointerId — обрабатываем только соответствующий pointer
        if (this._activePointerId !== null && 'pointerId' in event && typeof event.pointerId === 'number') {
            if (event.pointerId !== this._activePointerId) {
                this.logger.debug('Ignoring pointer up for non-active pointerId');
                return;
            }
        }

        this.logger.info(`🖱️ MouseUp: isHolding=${this.isHolding}, longHold=${this.longHoldActivated}`);
        
        // Дедупликация: если уже неактивно и не удерживали — тихо выходим
        if (!this._inputActive && !this.isHolding) {
            this.logger.debug('Ignoring mouse up - not currently holding');
            return;
        }
        
        // Завершаем текущую сессию ввода
        this._inputActive = false;
        this._inputSource = null;
        this._lastUpAt = Date.now();
        // Сбрасываем захват указателя
        if (this._activePointerId !== null) {
            try { this.micButton.releasePointerCapture(this._activePointerId); } catch (_) {}
            this._activePointerId = null;
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
            // Short click -> start a short Whisper recording (PTT)
            this.logger.info('🟢 Short click detected -> start Whisper PTT recording');
            await this.handleShortClick();
        } else {
            this.logger.info('🛑 Turning OFF all modes');
            await this.turnOffAllModes();
        }
        
        // Reset the long hold flag
        this.longHoldActivated = false;
    }

    // Обработчики Pointer Events: проксируют к существующим методам
    handlePointerDown(event) {
        return this.handleMouseDown(event);
    }

    handlePointerUp(event) {
        return this.handleMouseUp(event);
    }

    handlePointerCancel(event) {
        // В случае отмены — ведём себя как при отпускании (без действий, если нечего отпускать)
        return this.handleMouseUp(event);
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

            // Налаштовуємо автоматичну зупинку через конфігурований час або по повторному кліку
            const maxMs = (VOICE_CONFIG.RECORDING_WINDOWS && VOICE_CONFIG.RECORDING_WINDOWS.shortClickMaxMs) || 10000;
            this.whisperRecordingTimeout = setTimeout(async () => {
                await this.stopWhisperRecording();
            }, maxMs);

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

            try {
                // Транскрибуємо аудіо
                const result = await this.whisperManager.transcribeAudio(audioBlob, 'uk');
                this.handleWhisperResult(result, 'short');
            } catch (transcribeError) {
                this.logger.error('Transcription failed for short click:', transcribeError);
                // Показати в таблиці як помилку
                this.resultsManager.addWhisperTranscription('', 'short', 'uk', { reason: transcribeError?.message || 'Transcription error' });
                this.setState(VOICE_CONFIG.BUTTON_STATES.IDLE);
            }

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

        // Якщо ми в синьому режимі — перевіряємо ключові слова зупинки
        if (mode === 'keyword' && this.isKeywordModeActive() && this.isStopCommand(text)) {
            this.logger.info('⛔ Detected STOP command — entering stop mode');
            this.enterStopMode(text);
            return; // не продовжуємо звичайний флоу
        }
        
        // Додаємо результат в таблицю
        this.resultsManager.addWhisperTranscription(text, mode, language);
        
        // НЕ відправляємо автоматично в чат - користувач сам вирішує
        // this.handleStandardSpeechResult(text);
        
        // Повертаємо кнопку в звичайний стан після обробки
        this.setState(VOICE_CONFIG.BUTTON_STATES.IDLE);
    }

    // Перевірка ключових слів зупинки
    isStopCommand(text) {
        if (!text) return false;
        const lc = text.toLowerCase();
        const keys = VOICE_CONFIG.STOP_KEYWORDS || [];
        return keys.some(k => lc.includes(k));
    }

    // Вхід у режим зупинки: пауза всіх дій, озвучення запиту та очікування пояснення
    async enterStopMode(triggerText) {
        try {
            this.stopModeActive = true;
            // Зупиняємо запис/детектор/ТТС
            try { await this.whisperManager.stopRecording(); } catch (_) {}
            try { this.keywordDetector.stop(); } catch (_) {}
            try { this.chatManager?.ttsManager?.stop(); } catch (_) {}
            // Ставимо сесію на паузу лише якщо є активні процеси
            if (this.chatManager?.isStreaming) {
                try { await this.chatManager.pauseSession(); } catch (_) {}
            }

            // Обираємо відповідь (рандом або по колу)
            const replies = VOICE_CONFIG.STOP_RESPONSES || [];
            let reply = 'Що сталося?';
            if (replies.length) {
                // чергуємо по колу
                reply = replies[this._stopResponseIndex % replies.length];
                this._stopResponseIndex++;
            }

            // Озвучуємо відповідь
            await this.playTTSResponse(reply);

            // Після озвучки — просимо пояснення (швидкий запис) і відправляємо як stop-dispatch
            await this.captureAndDispatchStopReason();
        } catch (e) {
            this.logger.error('Failed to enter stop mode:', e);
        }
    }

    async captureAndDispatchStopReason() {
        try {
            // Запускаємо короткий запис (~6-8с) для пояснення
            await this.startWhisperRecordingForKeyword();
            // Таймер вже встановлено в startWhisperRecordingForKeyword за конфігом keywordMaxMs
            // Коли цей запис завершиться, handleWhisperResult знову спрацює. Обробимо в окремій гілці нижче
        } catch (e) {
            this.logger.error('Failed to start explanation capture:', e);
        }
    }

    // Перевизначаємо обробку результату саме у режимі зупинки і другого запиту
    async handleStopFollowup(text) {
        // Завжди відправляємо пояснення в системний роутер (-1), який вирішить наступний крок
        this.logger.info('🛑 Stop follow-up captured — dispatching to Stage -1 stop router');
        try {
            if (this.chatManager?.streamFromOrchestratorWithOptions) {
                await this.chatManager.streamFromOrchestratorWithOptions(text, { stopDispatch: true });
            }
        } catch (e) {
            this.logger.error('Failed to dispatch stop follow-up to orchestrator:', e);
        } finally {
            this.stopModeActive = false;
            // Після диспатчу повертаємось у BLUE режим очікування ключового слова
            this.setState(VOICE_CONFIG.BUTTON_STATES.BLUE_MODE);
            try {
                if (!this.keywordDetector.isKeywordModeActive() && !this.keywordDetector.isRecognitionActive()) {
                    this.keywordDetector.start();
                }
            } catch (_) {}
        }
    }

    // ==================== НОВІ МЕТОДИ РЕЖИМІВ ====================
    
    /**
     * Вимкнення всіх активних режимів
     */
    async turnOffAllModes() {
        this.logger.info('🛑 Turning off all active modes');

        try {
            if (this.currentState === VOICE_CONFIG.BUTTON_STATES.GREEN_MODE) {
                await this.deactivateGreenMode();
            } else if (this.currentState === VOICE_CONFIG.BUTTON_STATES.BLUE_MODE) {
                await this.deactivateBlueMode();
            }

            // Stop any ongoing Whisper recording as a safety net
            if (this.whisperManager) {
                await this.whisperManager.stopRecording();
            }
        } catch (e) {
            this.logger.error('Error while turning off modes:', e);
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
            // Ensure Whisper recording is stopped to free the microphone
            if (this.whisperManager && this.whisperManager.isRecording) {
                this.logger.info('⏹️ Stopping Whisper recording before starting keyword detection');
                await this.whisperManager.stopRecording();
            }

            // Initialize keyword detector if needed
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
        // Анти-спам між активаціями
        const now = Date.now();
        const minInterval = VOICE_CONFIG.DETECTION?.minMsBetweenActivations || 0;
        if (minInterval && now - this._lastActivationAt < minInterval) {
            this.logger.info('Activation ignored due to min interval guard');
            return;
        }
        this._lastActivationAt = now;
        this.logger.info(`🎯 Keyword detected! Response: "${response}"`);

        // Під час TTS: або ігноруємо тригер в перші ttsTriggerSuppressionMs мс з початку TTS,
        // або якщо suppression вийшла — зупиняємо TTS і переходимо до запису
        if (this._ttsActive && VOICE_CONFIG.DETECTION?.allowKeywordDuringTTS) {
            const suppression = VOICE_CONFIG.DETECTION?.ttsTriggerSuppressionMs || 0;
            const justStarted = (now - this._lastTtsStartedAt) <= suppression;
            if (justStarted) {
                this.logger.info('Keyword ignored due to TTS suppression window');
                return;
            }
            // Зупиняємо поточний TTS та переходимо до запису користувача
            try { this.chatManager?.ttsManager?.stop(); } catch (_) {}
        }
        
        try {
            // Пауза лише якщо є активний процес (стрімінг/виконання)
            const hasActiveProcess = !!this.chatManager?.isStreaming;
            if (hasActiveProcess) {
                try { await this.chatManager?.pauseSession?.(); } catch (_) {}
            }
            // Якщо TTS активний і дозволено ловити keyword — не озвучуємо відповідь, одразу слухаємо користувача
            if (!(this._ttsActive && VOICE_CONFIG.DETECTION?.allowKeywordDuringTTS)) {
                await this.playTTSResponse(response);
            }
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
        // Даємо браузеру трохи часу повністю зупинити розпізнавання
        const stopWait = VOICE_CONFIG.GUARDS?.keywordStopWaitMs || 0;
        if (stopWait > 0) {
            await new Promise(res => setTimeout(res, stopWait));
        }
        
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
            // Мікролок: уникаємо конкурентних стартів MediaRecorder
            await this._acquireMicLock('startWhisperRecordingForKeyword');
            this._postKeywordRecordingActive = true;
            
            // Перша спроба
            let success = await this.whisperManager.startRecording();
            if (!success) {
                // Спроба реанімації: очистка та повторна ініціалізація
                this.logger.warn('First startRecording failed — attempting cleanup and retry');
                try { this.whisperManager.cleanup(); } catch (_) {}
                success = await this.whisperManager.startRecording();
                if (!success) {
                    throw new Error('Failed to start Whisper recording');
                }
            }

            const maxMs = (VOICE_CONFIG.RECORDING_WINDOWS && VOICE_CONFIG.RECORDING_WINDOWS.keywordMaxMs) || 6000;
            this.keywordWhisperTimeout = setTimeout(async () => {
                await this.stopWhisperRecordingForKeyword();
            }, maxMs);

        } catch (error) {
            this.logger.error('Error starting Whisper recording after keyword:', error);
            this.setState(VOICE_CONFIG.BUTTON_STATES.IDLE);
        } finally {
            this._releaseMicLock('startWhisperRecordingForKeyword');
        }
    }

    /**
     * Зупинка Whisper запису для синього режиму
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
                throw new Error('No audio recorded');
            }

            try {
                // Увімкнемо миттєве переозброєння детектора під час транскрипції, якщо дозволено
                if (VOICE_CONFIG.TRANSCRIPTION_BEHAVIOR?.rearmKeywordDuringTranscription && !this._postKeywordRecordingActive) {
                    try {
                        this.setState(VOICE_CONFIG.BUTTON_STATES.BLUE_MODE);
                        if (!this.keywordDetector.isKeywordModeActive() && !this.keywordDetector.isRecognitionActive()) {
                            this.keywordDetector.start();
                        }
                        this.logger.debug('🔁 Keyword detector re-armed during transcription');
                    } catch (_) {}
                }

                const result = await this.whisperManager.transcribeAudio(audioBlob, 'uk', { useVAD: true });

                // Якщо активний стоп-режим — обробляємо як follow-up пояснення
                if (this.stopModeActive) {
                    const text = typeof result === 'string' ? result : (result?.text || '');
                    await this.handleStopFollowup(text);
                } else {
                    this.handleWhisperResult(result, 'keyword');
                }

                // Після завершення обробки — повертаємось у BLUE режим
                if (!this.isKeywordModeActive()) {
                    this.setState(VOICE_CONFIG.BUTTON_STATES.BLUE_MODE);
                    // Невелика пауза перед стартом, якщо була TTS відповідь
                    const delay = VOICE_CONFIG.TRANSCRIPTION_BEHAVIOR?.postTTSRecordDelayMs || 0;
                    setTimeout(() => {
                        try {
                            if (!this.keywordDetector.isKeywordModeActive() && !this.keywordDetector.isRecognitionActive()) {
                                this.keywordDetector.start();
                            }
                        } catch (_) {}
                    }, delay);
                }
            } catch (transcribeError) {
                this.logger.error('Transcription failed after keyword:', transcribeError);
                // Додати рядок у результати як помилку/відфільтрований
                this.resultsManager.addWhisperTranscription('', 'keyword', 'uk', { reason: transcribeError?.message || 'Transcription error' });
                // Незважаючи на помилку — повертаємось у режим очікування ключового слова
                this.setState(VOICE_CONFIG.BUTTON_STATES.BLUE_MODE);
                const delay = VOICE_CONFIG.TRANSCRIPTION_BEHAVIOR?.postTTSRecordDelayMs || 0;
                setTimeout(() => {
                    try {
                        if (!this.keywordDetector.isKeywordModeActive() && !this.keywordDetector.isRecognitionActive()) {
                            this.keywordDetector.start();
                        }
                    } catch (_) {}
                }, delay);
            }

        } catch (error) {
            this.logger.error('Error stopping Whisper recording:', error);
            // У випадку загальної помилки теж намагаємось повернутись у BLUE
            try {
                this.setState(VOICE_CONFIG.BUTTON_STATES.BLUE_MODE);
                const delay = VOICE_CONFIG.TRANSCRIPTION_BEHAVIOR?.postTTSRecordDelayMs || 0;
                setTimeout(() => {
                    try {
                        if (!this.keywordDetector.isKeywordModeActive() && !this.keywordDetector.isRecognitionActive()) {
                            this.keywordDetector.start();
                        }
                    } catch (_) {}
                }, delay);
            } catch (_) {}
        } finally {
            this._postKeywordRecordingActive = false;
        }
    }

    /**
     * Обробка мови в режимі ключового слова (коли не виявлено ключове слово)
     */
    handleKeywordModeSpeech(transcript) {
        const text = (transcript || '').toLowerCase().trim();
        // Просте резюме паузи
        if (/(продовжуй|продовжити|continue|go on|resume)/i.test(text)) {
            this.logger.info('▶️ Resume command detected');
            try { this.chatManager?.resumeSession?.(); } catch(_) {}
            return;
        }
        // Можемо додати інші голосові команди тут; stop-інтент обробляється у Whisper result
        this.logger.debug(`Keyword mode speech: "${transcript}"`);
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
        return this.currentState === VOICE_CONFIG.BUTTON_STATES.BLUE_MODE;
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
                this.micButton.classList.remove('green-mode', 'blue-mode', 'processing', 'listening');
                break;
                
            case VOICE_CONFIG.BUTTON_STATES.GREEN_MODE:
                this.micButton.style.background = 'rgba(0, 255, 0, 0.6)';
                this.micButton.title = 'ЗЕЛЕНИЙ режим активний - безперервне прослуховування | Клік - вимкнути';
                this.micButton.classList.add('green-mode');
                this.micButton.classList.remove('blue-mode', 'processing', 'listening');
                break;
                
            case VOICE_CONFIG.BUTTON_STATES.BLUE_MODE:
                this.micButton.style.background = 'rgba(0, 100, 255, 0.6)';
                this.micButton.title = 'СИНІЙ режим активний - очікування "Атлас" | Клік - вимкнути';
                this.micButton.classList.add('blue-mode');
                this.micButton.classList.remove('green-mode', 'processing', 'listening');
                break;
                
            case VOICE_CONFIG.BUTTON_STATES.PROCESSING:
                this.micButton.style.background = 'rgba(255, 165, 0, 0.6)';
                this.micButton.title = 'Обробка...';
                this.micButton.classList.add('processing');
                this.micButton.classList.remove('green-mode', 'blue-mode', 'listening');
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
                this.micButton.classList.remove('green-mode', 'blue-mode', 'processing', 'listening');
                break;
        }
    }

    // ============== МІКРО ЛОК для мікрофона ==================
    async _acquireMicLock(ctx) {
        const started = Date.now();
        const timeout = VOICE_CONFIG.GUARDS?.micLockTimeoutMs || 1500;
        while (this._micLock) {
            if (Date.now() - started > timeout) {
                this.logger.warn(`micLock timeout in ${ctx}, forcing release`);
                break;
            }
            await new Promise(res => setTimeout(res, 25));
        }
        this._micLock = true;
        if (this._micLockTimer) clearTimeout(this._micLockTimer);
        this._micLockTimer = setTimeout(() => {
            // failsafe release
            this._micLock = false;
        }, timeout + 500);
    }

    _releaseMicLock(ctx) {
        if (this._micLockTimer) {
            clearTimeout(this._micLockTimer);
            this._micLockTimer = null;
        }
        this._micLock = false;
    }
}