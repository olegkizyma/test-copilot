/**
 * TTS MANAGER MODULE
 * Винесена TTS логіка з intelligent-chat-manager.js
 */

import { logger } from '../core/logger.js';
import { TTS_CONFIG, VOICE_CONFIG, AGENTS } from '../core/config.js';
import { ttsClient, orchestratorClient } from '../core/api-client.js';

export class TTSManager {
    constructor() {
        this.logger = new logger.constructor('TTS');
        this.enabled = TTS_CONFIG.enabled;
        this.currentAudio = null;
        this.queue = [];
        this.isProcessing = false;
        this.mode = localStorage.getItem('atlas_tts_mode') || 'standard';
        
        this.init();
    }

    async init() {
        try {
            this.logger.debug('Initializing TTSManager...');
            const { data } = await ttsClient.get('/health');
            this.logger.debug('TTS health check response:', data);
            this.enabled = data.status === 'ok' && data.tts_ready === true;
            this.logger.info(`TTS service ${this.enabled ? 'available' : 'unavailable'}`);
        } catch (error) {
            this.logger.error('TTS service initialization failed:', error.message);
            this.enabled = false;
        }
    }

    setMode(mode) {
        if (TTS_CONFIG.modes[mode]) {
            this.mode = mode;
            localStorage.setItem('atlas_tts_mode', mode);
            this.logger.info(`TTS mode set to: ${mode}`);
        }
    }

    getMode() {
        return this.mode;
    }

    isEnabled() {
        return this.enabled && localStorage.getItem('atlas_voice_enabled') !== 'false';
    }

    async synthesize(text, voice = TTS_CONFIG.defaultVoice, options = {}) {
        if (!this.enabled) {
            throw new Error('TTS service not available');
        }

        try {
            const { data } = await ttsClient.request('/tts', {
                method: 'POST',
                body: JSON.stringify({
                    text,
                    voice,
                    return_audio: options.returnAudio || false,
                    ...options
                }),
                responseType: options.return_audio || options.responseType === 'blob' ? 'blob' : undefined
            });

            return data;
        } catch (error) {
            this.logger.error(`TTS synthesis failed for voice ${voice}`, error.message);
            throw error;
        }
    }

    async playAudio(audioBlob, agent = 'atlas') {
        return new Promise((resolve, reject) => {
            this.logger.info(`Creating audio URL for ${agent}, blob size: ${audioBlob?.size || 'unknown'}`);
            
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            
            this.currentAudio = audio;

            audio.onended = () => {
                URL.revokeObjectURL(audioUrl);
                this.currentAudio = null;
                this.logger.info(`Audio playback completed for ${agent}`);
                // Emit DOM event about TTS completion
                try {
                    window.dispatchEvent(new CustomEvent('atlas-tts-completed', { detail: { agent } }));
                } catch (_) {}
                
                // Сповіщаємо orchestrator про завершення
                this.notifyPlaybackCompleted(agent);
                
                resolve();
            };
            
            audio.onerror = (error) => {
                URL.revokeObjectURL(audioUrl);
                this.currentAudio = null;
                this.logger.error(`Audio playback error for ${agent}:`, error);
                reject(error);
            };

            audio.onloadstart = () => {
                this.logger.info(`Audio loading started for ${agent}`);
            };

            audio.oncanplay = () => {
                this.logger.info(`Audio can play for ${agent}`);
            };

            // Запускаємо відтворення
            this.logger.info(`Starting audio playback for ${agent}`);
            // Emit DOM event about TTS start
            try {
                window.dispatchEvent(new CustomEvent('atlas-tts-started', { detail: { agent } }));
            } catch (_) {}
            audio.play().catch((playError) => {
                URL.revokeObjectURL(audioUrl);
                this.currentAudio = null;
                this.logger.error(`Audio play failed for ${agent}:`, playError);
                reject(playError);
            });
        });
    }

    async notifyPlaybackCompleted(agent) {
        try {
            // Якщо agent є голосом (string), використовуємо його напряму
            // Якщо agent є ім'ям агента, отримуємо voice з конфігурації
            const voice = (typeof agent === 'string' && !AGENTS[agent]) ? agent : (AGENTS[agent]?.voice || agent || TTS_CONFIG.defaultVoice);
            await orchestratorClient.post('/tts/completed', { voice });
            this.logger.info(`Notified orchestrator: TTS completed for ${agent} (voice: ${voice})`);
        } catch (error) {
            this.logger.error(`Failed to notify orchestrator about TTS completion`, error.message);
        }
    }

    async speak(text, agent = 'atlas', options = {}) {
        if (!this.isEnabled()) {
            this.logger.debug('TTS disabled, skipping speech');
            return;
        }

        // Визначаємо voice: якщо agent є голосом, використовуємо його, інакше отримуємо з конфігурації
        let voice;
        if (typeof agent === 'string' && !AGENTS[agent]) {
            // agent є голосом напряму
            voice = agent;
        } else if (AGENTS[agent]) {
            // agent є ім'ям агента, отримуємо voice з конфігурації
            voice = AGENTS[agent].voice;
        } else {
            // fallback до default voice
            voice = TTS_CONFIG.defaultVoice;
        }
        
        const maxRetries = TTS_CONFIG.maxRetries || 3;
        let attempt = 0;
        let lastError = null;

        this.logger.info(`Speaking for ${agent} (${voice}): ${text.substring(0, 80)}...`);
        while (attempt <= maxRetries) {
            try {
                // Генеруємо аудіо з поверненням blob
                this.logger.info(`Requesting TTS (attempt ${attempt + 1}/${maxRetries + 1})`);
                const audioBlob = await this.synthesize(text, voice, { returnAudio: true, responseType: 'blob' });
                this.logger.info(`Received TTS blob, size: ${audioBlob?.size || 'unknown'}`);
                await this.playAudio(audioBlob, voice);
                return; // success
            } catch (error) {
                lastError = error;
                const statusText = error?.message || '';
                const isServerError = /HTTP\s*5\d\d/i.test(statusText) || /Internal Server Error/i.test(statusText);
                const shouldRetry = isServerError && attempt < maxRetries;
                this.logger.error(`[TTS] Speech failed for ${agent} ${statusText}`);
                if (shouldRetry) {
                    const backoff = Math.min(1000 * Math.pow(2, attempt), 6000) + Math.floor(Math.random() * 250);
                    this.logger.info(`Retrying TTS in ${backoff}ms...`);
                    await new Promise(r => setTimeout(r, backoff));
                    attempt++;
                    continue;
                }
                break;
            }
        }

        // Фолбек: браузерний speechSynthesis, якщо доступний
        try {
            if ('speechSynthesis' in window && 'SpeechSynthesisUtterance' in window) {
                await new Promise((resolve) => {
                    try {
                        const utter = new SpeechSynthesisUtterance(text);
                        const pickVoice = () => {
                            const voices = window.speechSynthesis.getVoices();
                            const ua = voices.find(v => (v.lang || '').toLowerCase().startsWith('uk'));
                            const ru = voices.find(v => (v.lang || '').toLowerCase().startsWith('ru'));
                            const en = voices.find(v => (v.lang || '').toLowerCase().startsWith('en'));
                            return ua || ru || en || voices[0];
                        };
                        const setVoice = () => {
                            const v = pickVoice();
                            if (v) utter.voice = v;
                        };
                        if (window.speechSynthesis.onvoiceschanged !== undefined) {
                            const once = () => { window.speechSynthesis.onvoiceschanged = null; setVoice(); };
                            window.speechSynthesis.onvoiceschanged = once;
                        }
                        setVoice();
                        utter.onend = () => resolve();
                        utter.onerror = () => resolve();
                        // Emit TTS started/completed around browser TTS too
                        try { window.dispatchEvent(new CustomEvent('atlas-tts-started', { detail: { agent: voice } })); } catch(_) {}
                        window.speechSynthesis.speak(utter);
                        utter.onend = () => {
                            try { window.dispatchEvent(new CustomEvent('atlas-tts-completed', { detail: { agent: voice } })); } catch(_) {}
                            resolve();
                        };
                    } catch (_) { resolve(); }
                });
            }
        } catch (_) {}
        
        // Завершение для оркестратора (чтобы снять ожидание), даже при фолбэке/ошибке
        try { await this.notifyPlaybackCompleted(voice); } catch(_) {}
        // Пробрасываем последнюю ошибку для логики наверху, если нужно
        if (lastError) throw lastError;
    }

    segmentText(text, maxLength = VOICE_CONFIG.maxSegmentLength) {
        if (!text || text.length <= maxLength) {
            return [text];
        }

        const sentences = text.split(/[.!?]+/).filter(s => s.trim());
        const segments = [];
        let currentSegment = '';

        for (const sentence of sentences) {
            const trimmed = sentence.trim();
            if (!trimmed) continue;

            if (currentSegment.length + trimmed.length + 1 <= maxLength) {
                currentSegment += (currentSegment ? '. ' : '') + trimmed;
            } else {
                if (currentSegment) {
                    segments.push(currentSegment + '.');
                }
                currentSegment = trimmed;
            }
        }

        if (currentSegment) {
            segments.push(currentSegment + '.');
        }

        return segments.slice(0, VOICE_CONFIG.maxSegments);
    }

    async speakSegmented(text, agent = 'atlas') {
        const segments = this.segmentText(text);
        
        for (const segment of segments) {
            await this.speak(segment, agent);
        }
    }

    stop() {
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio = null;
        }
        this.queue = [];
        this.isProcessing = false;
    }

    // Queue management for sequential playback
    async addToQueue(text, agent = 'atlas') {
        return new Promise((resolve, reject) => {
            this.queue.push({
                text,
                agent,
                resolve,
                reject
            });

            this.processQueue();
        });
    }

    async processQueue() {
        if (this.isProcessing || this.queue.length === 0) {
            return;
        }

        this.isProcessing = true;

        while (this.queue.length > 0) {
            const item = this.queue.shift();
            
            try {
                await this.speak(item.text, item.agent);
                item.resolve();
            } catch (error) {
                item.reject(error);
            }
        }

        this.isProcessing = false;
    }
}
