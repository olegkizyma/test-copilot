/**
 * CHAT MANAGER MODULE
 * Основна логіка чату, винесена з intelligent-chat-manager.js
 */

import { logger } from '../core/logger.js';
import { AGENTS, CHAT_CONFIG } from '../core/config.js';
import { orchestratorClient } from '../core/api-client.js';
import { TTSManager } from './tts-manager.js';

export class ChatManager {
    constructor() {
        this.logger = new logger.constructor('CHAT');
        this.ttsManager = new TTSManager();
        
        this.messages = [];
        this.isStreaming = false;
        this.isStreamPending = false;
        this.currentSession = null;
        
        this.init();
    }

    async init() {
        this.logger.info('Initializing Chat Manager...');
        
        // Ініціалізуємо TTS
        await this.ttsManager.init();
        
        // Налаштовуємо UI
        this.setupUI();
        this.setupEventListeners();
        
        this.logger.info('Chat Manager initialized');
    }

    setupUI() {
        // Знаходимо основні елементи
        this.chatContainer = document.getElementById('chat-container');
        this.inputElement = document.getElementById('message-input');
        this.sendButton = document.getElementById('send-button');
        
        // Debug: показуємо які елементи знайдені
        this.logger.info(`UI Elements found: chat-container=${!!this.chatContainer}, message-input=${!!this.inputElement}, send-button=${!!this.sendButton}`);
        
        if (!this.chatContainer || !this.inputElement || !this.sendButton) {
            this.logger.error('Required UI elements not found');
            return;
        }

        // Налаштовуємо автоскрол
        this.setupAutoScroll();
    }

    setupEventListeners() {
        // Кнопка відправки
        if (this.sendButton) {
            this.sendButton.addEventListener('click', () => this.sendMessage());
        }

        // Enter для відправки
        if (this.inputElement) {
            this.inputElement.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
        }

        // Глобальні події
        window.addEventListener('atlas-tts-completed', (e) => {
            this.logger.info(`TTS completed for ${e.detail.agent}`);
        });
    }

    setupAutoScroll() {
        if (!this.chatContainer) return;

        // Автоскрол при додаванні нових повідомлень
        const observer = new MutationObserver(() => {
            this.scrollToBottom();
        });

        observer.observe(this.chatContainer, {
            childList: true,
            subtree: true
        });
    }

    scrollToBottom() {
        if (this.chatContainer) {
            this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
        }
    }

    addMessage(content, agent = 'user', signature = null) {
        const message = {
            id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            content,
            agent,
            signature: signature || AGENTS[agent]?.signature || `[${agent.toUpperCase()}]`,
            timestamp: Date.now(),
            color: AGENTS[agent]?.color || '#ffffff'
        };

        this.messages.push(message);
        this.renderMessage(message);

        // Обмежуємо кількість повідомлень
        if (this.messages.length > CHAT_CONFIG.maxMessages) {
            this.messages.shift();
            this.removeOldestMessage();
        }

        return message;
    }

    renderMessage(message) {
        if (!this.chatContainer) return;

        const messageElement = document.createElement('div');
        messageElement.className = `message ${message.agent}-message`;
        messageElement.setAttribute('data-message-id', message.id);

        const timestamp = new Date(message.timestamp).toLocaleTimeString();
        
        messageElement.innerHTML = `
            <div class="message-header">
                <span class="agent-signature" style="color: ${message.color}">
                    ${message.signature}
                </span>
                <span class="timestamp">${timestamp}</span>
            </div>
            <div class="message-content">
                ${this.formatMessageContent(message.content)}
            </div>
        `;

        this.chatContainer.appendChild(messageElement);
    }

    formatMessageContent(content) {
        // Базове форматування markdown
        return content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br>');
    }

    removeOldestMessage() {
        if (!this.chatContainer) return;
        
        const firstMessage = this.chatContainer.querySelector('.message');
        if (firstMessage) {
            firstMessage.remove();
        }
    }

    async sendMessage() {
        const input = this.inputElement?.value?.trim();
        if (!input || this.isStreaming) {
            return;
        }

        // Очищаємо поле вводу
        if (this.inputElement) {
            this.inputElement.value = '';
        }

        // Додаємо повідомлення користувача
        this.addMessage(input, 'user');

        // Блокуємо інтерфейс
        this.setStreamingState(true);

        try {
            await this.streamFromOrchestrator(input);
        } catch (error) {
            this.logger.error('Failed to send message', error.message);
            this.addMessage(`❌ Помилка: ${error.message}`, 'error');
        } finally {
            this.setStreamingState(false);
        }
    }

    async streamFromOrchestrator(message) {
        this.logger.info(`Streaming message to orchestrator: ${message.substring(0, 50)}...`);

        const sessionId = this.generateSessionId();
        this.currentSession = sessionId;

        return new Promise((resolve, reject) => {
            orchestratorClient.stream(
                '/chat/stream',
                { 
                    message, 
                    sessionId,
                    enableTTS: this.ttsManager.isEnabled()
                },
                // onMessage
                (data) => this.handleStreamMessage(data),
                // onError
                (error) => {
                    this.logger.error('Stream error', error.message);
                    reject(error);
                },
                // onComplete
                () => {
                    this.logger.info('Stream completed');
                    resolve();
                }
            );
        });
    }

    handleStreamMessage(data) {
        switch (data.type) {
            case 'agent_message':
                this.handleAgentMessage(data.data);
                break;
            case 'status_update':
                this.handleStatusUpdate(data.data);
                break;
            case 'error':
                this.handleError(data.data);
                break;
            case 'workflow_complete':
                this.handleWorkflowComplete(data.data);
                break;
            default:
                this.logger.debug('Unknown stream message type', data.type);
        }
    }

    async handleAgentMessage(messageData) {
        const { content, agent, voice } = messageData;
        
        // Додаємо повідомлення в чат
        const message = this.addMessage(content, agent);

        // Озвучуємо якщо потрібно
        if (voice && this.ttsManager.isEnabled()) {
            try {
                await this.ttsManager.speak(content, agent);
            } catch (error) {
                this.logger.warn(`TTS failed for ${agent}`, error.message);
            }
        }

        return message;
    }

    handleStatusUpdate(statusData) {
        const { agent, stage, status } = statusData;
        this.logger.info(`Status update: ${agent} - ${stage} - ${status}`);
        
        // Можна додати візуальні індикатори статусу
        this.showStatusIndicator(agent, stage, status);
    }

    handleError(errorData) {
        const { message, agent } = errorData;
        this.logger.error(`Agent error: ${agent}`, message);
        this.addMessage(`❌ ${agent}: ${message}`, 'error');
    }

    handleWorkflowComplete(data) {
        this.logger.info('Workflow completed', data);
        this.addMessage('✅ Завдання виконано', 'system');
    }

    showStatusIndicator(agent, stage, status) {
        // Тимчасово просто логуємо, можна додати UI індикатори
        const agentName = AGENTS[agent]?.name || agent;
        const statusMessage = `${agentName}: ${stage} - ${status}`;
        
        // Можна додати тимчасове повідомлення або індикатор
        this.logger.debug(statusMessage);
    }

    setStreamingState(isStreaming) {
        this.isStreaming = isStreaming;
        
        // Оновлюємо UI
        if (this.sendButton) {
            this.sendButton.disabled = isStreaming;
            this.sendButton.textContent = isStreaming ? 'Обробка...' : 'Відправити';
        }
        
        if (this.inputElement) {
            this.inputElement.disabled = isStreaming;
        }
    }

    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Методи для управління TTS
    enableTTS() {
        localStorage.setItem('atlas_voice_enabled', 'true');
        this.logger.info('TTS enabled');
    }

    disableTTS() {
        localStorage.setItem('atlas_voice_enabled', 'false');
        this.ttsManager.stop();
        this.logger.info('TTS disabled');
    }

    setTTSMode(mode) {
        this.ttsManager.setMode(mode);
    }

    getTTSMode() {
        return this.ttsManager.getMode();
    }

    // Очищення чату
    clearChat() {
        this.messages = [];
        if (this.chatContainer) {
            this.chatContainer.innerHTML = '';
        }
        this.logger.info('Chat cleared');
    }

    // Експорт історії чату
    exportChatHistory() {
        const history = {
            timestamp: new Date().toISOString(),
            messages: this.messages,
            session: this.currentSession
        };
        
        const blob = new Blob([JSON.stringify(history, null, 2)], {
            type: 'application/json'
        });
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `atlas-chat-${Date.now()}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
        this.logger.info('Chat history exported');
    }
}
