/**
 * Менеджер Whisper інтеграції для високоякісного розпізнавання мови
 * Використовує локальний Whisper сервіс для транскрипції
 */

import { logger } from '../core/logger.js';

export class WhisperManager {
    constructor() {
        this.logger = new logger.constructor('WHISPER');
        this.serviceUrl = 'http://localhost:3002';
        this.isServiceAvailable = false;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;
    this._recorderState = 'inactive'; // mirror for safety
    this._initInProgress = false;
        
        this.logger.info('Whisper Manager initialized');
    }

    /**
     * Перевірка доступності Whisper сервісу
     */
    async checkServiceAvailability() {
        try {
            const response = await fetch(`${this.serviceUrl}/health`);
            if (response.ok) {
                const data = await response.json();
                this.isServiceAvailable = true;
                this.logger.info(`✅ Whisper service available: ${data.model} on ${data.device}`);
                return true;
            }
        } catch (error) {
            this.logger.warn(`⚠️ Whisper service not available: ${error.message}`);
            this.isServiceAvailable = false;
        }
        return false;
    }

    /**
     * Ініціалізація медіа-запису
     */
    async initializeRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    sampleRate: 16000,
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true
                } 
            });

            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus'
            });

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                this._recorderState = 'inactive';
                this.isRecording = false;
                this.logger.info('🎤 Recording stopped');
            };

            this.mediaRecorder.onstart = () => {
                this._recorderState = 'recording';
            };

            this.logger.info('🎤 Media recording initialized');
            return true;

        } catch (error) {
            this.logger.error('❌ Failed to initialize recording:', error);
            return false;
        }
    }

    async ensureMediaRecorderReady() {
        if (this.mediaRecorder && this.mediaRecorder.state === 'inactive') {
            return true;
        }
        if (!this.mediaRecorder) {
            if (this._initInProgress) {
                // wait a bit for parallel init
                await new Promise(res => setTimeout(res, 50));
                if (this.mediaRecorder) return true;
            }
            this._initInProgress = true;
            try {
                return await this.initializeRecording();
            } finally {
                this._initInProgress = false;
            }
        }
        // If state is 'recording' unexpectedly, attempt to stop and recreate
        if (this.mediaRecorder?.state === 'recording') {
            try { this.mediaRecorder.stop(); } catch (_) {}
            await new Promise(res => setTimeout(res, 50));
            try { this.cleanup(); } catch (_) {}
            return await this.initializeRecording();
        }
        return true;
    }

    /**
     * Початок запису аудіо
     */
    async startRecording() {
        if (this.isRecording || this.mediaRecorder?.state === 'recording') {
            this.logger.warn('Recording already in progress');
            return false;
        }

        if (!this.mediaRecorder) {
            await this.initializeRecording();
        }

        if (!this.mediaRecorder) {
            this.logger.error('MediaRecorder not available');
            return false;
        }

        try {
            this.audioChunks = [];
            // Інколи браузер кидає NotSupportedError/InvalidStateError — пробуємо ре-ініт/повтор
            try {
                this.mediaRecorder.start();
            } catch (err) {
                this.logger.warn('mediaRecorder.start() failed, attempting recovery:', err?.name || err);
                // Recovery path
                try { this.cleanup(); } catch (_) {}
                const ok = await this.initializeRecording();
                if (!ok) throw err;
                this.mediaRecorder.start();
            }
            this.isRecording = true;
            this._recorderState = 'recording';
            this.logger.info('🎤 Recording started');
            return true;
        } catch (error) {
            this.logger.error('❌ Failed to start recording:', error);
            return false;
        }
    }

    /**
     * Зупинка запису та отримання аудіо
     */
    async stopRecording() {
        if (!this.mediaRecorder) {
            this.logger.warn('No MediaRecorder to stop');
            return null;
        }

        // Якщо вже не пишемо — все одно спробуємо сформувати blob
        if (!this.isRecording && this.mediaRecorder.state !== 'recording') {
            if (this.audioChunks.length === 0) {
                this.logger.warn('No audio data recorded');
                return null;
            }
            const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
            this.logger.info(`🎤 Returning last audio buffer, size: ${audioBlob.size} bytes`);
            return audioBlob;
        }

        return new Promise((resolve) => {
            const finalize = () => {
                this.isRecording = false;
                this._recorderState = 'inactive';
                if (this.audioChunks.length === 0) {
                    this.logger.warn('No audio data recorded');
                    resolve(null);
                    return;
                }
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                this.logger.info(`🎤 Recording stopped, audio size: ${audioBlob.size} bytes`);
                resolve(audioBlob);
            };

            try {
                // restore default onstop, then add a once handler
                this.mediaRecorder.onstop = finalize;
                if (this.mediaRecorder.state === 'recording') {
                    this.mediaRecorder.stop();
                } else {
                    // already inactive
                    finalize();
                }
            } catch (e) {
                this.logger.warn('Error on mediaRecorder.stop(), forcing finalize:', e);
                finalize();
            }
        });
    }

    /**
     * Транскрипція аудіо через Whisper сервіс
     */
    async transcribeAudio(audioBlob, language = 'uk', options = {}) {
        if (!this.isServiceAvailable) {
            await this.checkServiceAvailability();
            if (!this.isServiceAvailable) {
                throw new Error('Whisper service not available');
            }
        }

        try {
            const { useVAD = true } = options;
            this.logger.info(`🤖 Transcribing audio (${audioBlob.size} bytes) with language: ${language}, use_vad: ${useVAD}`);
            
            const formData = new FormData();
            formData.append('audio', audioBlob, 'recording.webm');
            formData.append('language', language);
            formData.append('use_vad', useVAD ? 'true' : 'false');  // Вмикаємо VAD за замовчуванням

            const response = await fetch(`${this.serviceUrl}/transcribe`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`Transcription failed: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();
            
            if (result.status === 'success') {
                this.logger.info(`✅ Transcription successful: "${result.text}"`);
                return {
                    text: result.text,
                    language: result.language,
                    transcriptionTime: result.transcription_time,
                    confidence: 1.0 // Whisper не повертає confidence, але якість висока
                };
            } else if (result.status === 'filtered') {
                this.logger.info(`🚫 Transcription filtered: "${result.original_text}" - ${result.reason}`);
                return {
                    text: '', // Повертаємо порожній текст для відфільтрованих результатів
                    language: result.language || language,
                    transcriptionTime: result.transcription_time,
                    confidence: 0.0,
                    filtered: true,
                    reason: result.reason,
                    originalText: result.original_text
                };
            } else {
                throw new Error(result.error || 'Transcription failed');
            }

        } catch (error) {
            this.logger.error('❌ Transcription error:', error);
            throw error;
        }
    }

    /**
     * Повний цикл: запис -> зупинка -> транскрипція
     */
    async recordAndTranscribe(language = 'uk') {
        try {
            // Починаємо запис
            const started = await this.startRecording();
            if (!started) {
                throw new Error('Failed to start recording');
            }

            // Чекаємо поки користувач завершить (це має контролюватися ззовні)
            // Повертаємо функцію для зупинки та транскрипції
            return {
                stop: async () => {
                    const audioBlob = await this.stopRecording();
                    if (!audioBlob) {
                        throw new Error('No audio recorded');
                    }
                    return await this.transcribeAudio(audioBlob, language, { useVAD: true });
                }
            };

        } catch (error) {
            this.logger.error('❌ Record and transcribe error:', error);
            throw error;
        }
    }

    /**
     * Швидкий запис з автоматичною зупинкою після тиші
     */
    async quickRecord(maxDuration = 10000, language = 'uk') {
        try {
            const started = await this.startRecording();
            if (!started) {
                throw new Error('Failed to start recording');
            }

            // Автоматична зупинка через maxDuration мілісекунд
            setTimeout(async () => {
                if (this.isRecording) {
                    this.logger.info(`⏰ Auto-stopping recording after ${maxDuration}ms`);
                    await this.stopRecording();
                }
            }, maxDuration);

            // Повертаємо Promise, який резолвиться коли запис зупиниться
            return new Promise(async (resolve, reject) => {
                const checkRecording = async () => {
                    if (!this.isRecording) {
                        try {
                            // Отримуємо останній blob
                            const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                            if (audioBlob.size > 0) {
                                const result = await this.transcribeAudio(audioBlob, language);
                                resolve(result);
                            } else {
                                reject(new Error('No audio recorded'));
                            }
                        } catch (error) {
                            reject(error);
                        }
                    } else {
                        // Перевіряємо знову через 100мс
                        setTimeout(checkRecording, 100);
                    }
                };
                
                setTimeout(checkRecording, 100);
            });

        } catch (error) {
            this.logger.error('❌ Quick record error:', error);
            throw error;
        }
    }

    /**
     * Отримання списку доступних моделей
     */
    async getAvailableModels() {
        try {
            const response = await fetch(`${this.serviceUrl}/models`);
            if (response.ok) {
                return await response.json();
            }
            throw new Error(`Failed to get models: ${response.status}`);
        } catch (error) {
            this.logger.error('❌ Failed to get models:', error);
            throw error;
        }
    }

    /**
     * Перевірка стану запису
     */
    getRecordingState() {
        return {
            isRecording: this.isRecording,
            isServiceAvailable: this.isServiceAvailable,
            serviceUrl: this.serviceUrl
        };
    }

    /**
     * Очищення ресурсів
     */
    cleanup() {
        if (this.mediaRecorder && this.mediaRecorder.stream) {
            this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;
        this.logger.info('🧹 Whisper manager cleanup completed');
    }
}