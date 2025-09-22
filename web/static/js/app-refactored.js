/**
 * ATLAS APPLICATION - REFACTORED
 * Модульна архітектура з чистим розділенням відповідальності
 */

import { logger } from './core/logger.js';
import { AGENTS } from './core/config.js';
import { ChatManager } from './modules/chat-manager.js';
import { VoiceControlSystem } from './voice-control/index.js';

class AtlasApp {
    constructor() {
        this.logger = new logger.constructor('APP');
        this.isInitialized = false;
        this.pageLoadId = `load_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        
        this.managers = {
            chat: null,
            status: null,
            logger: null,
            voiceControl: null
        };
    }

    async init() {
        if (this.isInitialized) return;
        
        this.logger.info(`🚀 ATLAS APP INIT: ${this.pageLoadId}`);
        
        try {
            // Ініціалізуємо менеджери в правильному порядку
            await this.initializeManagers();
            
            // Налаштовуємо UI
            this.setupUI();
            
            // Налаштовуємо глобальні обробники
            this.setupGlobalHandlers();
            
            this.isInitialized = true;
            this.logger.info('✅ Atlas Application initialized successfully');
            
        } catch (error) {
            this.logger.error('❌ Failed to initialize Atlas Application', error.message);
            this.showErrorMessage('Помилка ініціалізації додатку');
        }
    }

    async initializeManagers() {
        // Ініціалізуємо Chat Manager
        this.managers.chat = new ChatManager();
        await this.managers.chat.init();
        
        // Ініціалізуємо систему голосового управління
        this.managers.voiceControl = new VoiceControlSystem(this.managers.chat);
        await this.managers.voiceControl.initialize();
        
        // Ініціалізуємо Status Manager (якщо потрібен)
        if (document.getElementById('status-container')) {
            this.logger.info('Status container found - initializing basic status display');
            this.managers.status = { initialized: true }; // Простий заглушка
        }
        
        // Ініціалізуємо Logger Manager (якщо потрібен)
        if (document.getElementById('logs-container')) {
            this.logger.info('Logs container found - initializing basic logs display');
            this.managers.logger = { initialized: true }; // Простий заглушка
        }
        
        // Робимо менеджери доступними глобально для зворотної сумісності
        window.atlasChat = this.managers.chat;
        window.atlasStatus = this.managers.status;
        window.atlasLogger = this.managers.logger;
    }

    setupUI() {
        // Налаштовуємо таби
        this.setupTabs();
        
        // Налаштовуємо контроли TTS
        this.setupTTSControls();
        
        // Налаштовуємо клавіатурні скорочення
        this.setupKeyboardShortcuts();
    }

    setupTabs() {
        const tabChat = document.getElementById('tab-chat');
        const tabLogs = document.getElementById('tab-logs');
        const chatContent = document.getElementById('chat-content');
        const logsContent = document.getElementById('logs-content');

        if (tabChat && chatContent) {
            tabChat.addEventListener('click', () => {
                this.switchTab('chat');
            });
        }

        if (tabLogs && logsContent) {
            tabLogs.addEventListener('click', () => {
                this.switchTab('logs');
            });
        }

        // За замовчуванням показуємо чат
        this.switchTab('chat');
    }

    switchTab(tab) {
        const tabs = ['chat', 'logs'];
        
        tabs.forEach(t => {
            const tabElement = document.getElementById(`tab-${t}`);
            const contentElement = document.getElementById(`${t}-content`);
            
            if (tabElement && contentElement) {
                if (t === tab) {
                    tabElement.classList.add('active');
                    contentElement.style.display = 'block';
                } else {
                    tabElement.classList.remove('active');
                    contentElement.style.display = 'none';
                }
            }
        });

        this.logger.debug(`Switched to ${tab} tab`);
    }

    setupTTSControls() {
        // Кнопка увімкнення/вимкнення TTS
        const ttsToggle = document.getElementById('tts-toggle');
        if (ttsToggle && this.managers.chat) {
            ttsToggle.addEventListener('click', () => {
                const isEnabled = this.managers.chat.ttsManager.isEnabled();
                if (isEnabled) {
                    this.managers.chat.disableTTS();
                    ttsToggle.textContent = '🔇 Увімкнути озвучення';
                } else {
                    this.managers.chat.enableTTS();
                    ttsToggle.textContent = '🔊 Вимкнути озвучення';
                }
            });

            // Встановлюємо початковий стан
            const isEnabled = this.managers.chat.ttsManager.isEnabled();
            ttsToggle.textContent = isEnabled ? '🔊 Вимкнути озвучення' : '🔇 Увімкнути озвучення';
        }

        // Перемикач режиму TTS
        const ttsModeToggle = document.getElementById('tts-mode-toggle');
        if (ttsModeToggle && this.managers.chat) {
            ttsModeToggle.addEventListener('click', () => {
                const currentMode = this.managers.chat.getTTSMode();
                const newMode = currentMode === 'quick' ? 'standard' : 'quick';
                this.managers.chat.setTTSMode(newMode);
                
                ttsModeToggle.textContent = newMode === 'quick' ? 
                    '⚡ Швидкий режим' : '🎵 Стандартний режим';
                
                this.logger.info(`TTS mode changed to: ${newMode}`);
            });

            // Встановлюємо початковий стан
            const currentMode = this.managers.chat.getTTSMode();
            ttsModeToggle.textContent = currentMode === 'quick' ? 
                '⚡ Швидкий режим' : '🎵 Стандартний режим';
        }
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl+Enter - відправити повідомлення
            if (e.ctrlKey && e.key === 'Enter') {
                if (this.managers.chat) {
                    this.managers.chat.sendMessage();
                }
            }
            
            // Ctrl+L - очистити чат
            if (e.ctrlKey && e.key === 'l') {
                e.preventDefault();
                if (this.managers.chat) {
                    this.managers.chat.clearChat();
                }
            }
            
            // Ctrl+E - експорт історії
            if (e.ctrlKey && e.key === 'e') {
                e.preventDefault();
                if (this.managers.chat) {
                    this.managers.chat.exportChatHistory();
                }
            }
            
            // Ctrl+1/2 - перемикання табів
            if (e.ctrlKey && e.key === '1') {
                e.preventDefault();
                this.switchTab('chat');
            }
            if (e.ctrlKey && e.key === '2') {
                e.preventDefault();
                this.switchTab('logs');
            }
        });
    }

    setupGlobalHandlers() {
        // Захист від випадкових перезавантажень
        window.addEventListener('beforeunload', (e) => {
            const pageAge = Date.now() - performance.timing.navigationStart;
            const isStreaming = this.managers.chat && this.managers.chat.isStreaming;
            const isRecentLoad = pageAge < 10000;
            
            if (isStreaming || isRecentLoad) {
                this.logger.warn(`Preventing reload: streaming=${isStreaming}, recentLoad=${isRecentLoad}`);
                
                const message = isStreaming ? 
                    'Зачекайте завершення обробки повідомлення...' :
                    'Зачекайте кілька секунд...';
                
                e.preventDefault();
                e.returnValue = message;
                return message;
            }
        });

        // Глобальний обробник помилок
        window.addEventListener('error', (e) => {
            this.logger.error('Global error', e.error?.message || 'Unknown error');
            this.showErrorMessage(`Помилка: ${e.error?.message || 'Невідома помилка'}`);
        });

        window.addEventListener('unhandledrejection', (e) => {
            this.logger.error('Unhandled promise rejection', e.reason?.message || 'Unknown reason');
            this.showErrorMessage(`Promise помилка: ${e.reason?.message || 'Невідома причина'}`);
        });

        // Обробка втрати з'єднання
        window.addEventListener('online', () => {
            this.logger.info('Connection restored');
            this.showSuccessMessage('З\'єднання відновлено');
        });

        window.addEventListener('offline', () => {
            this.logger.warn('Connection lost');
            this.showErrorMessage('З\'єднання втрачено');
        });
    }

    showErrorMessage(message) {
        this.showNotification(message, 'error');
    }

    showSuccessMessage(message) {
        this.showNotification(message, 'success');
    }

    showNotification(message, type = 'info') {
        // Створюємо простий toast notification
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 6px;
            color: white;
            font-weight: 500;
            z-index: 10000;
            max-width: 300px;
            word-wrap: break-word;
            background-color: ${type === 'error' ? '#dc3545' : type === 'success' ? '#28a745' : '#17a2b8'};
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            transform: translateX(100%);
            transition: transform 0.3s ease;
        `;

        document.body.appendChild(notification);

        // Анімація появи
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);

        // Автоматичне приховування
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 5000);

        // Клік для закриття
        notification.addEventListener('click', () => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        });
    }

    // Методи для зовнішнього API
    sendMessage(message) {
        if (this.managers.chat) {
            return this.managers.chat.sendMessage(message);
        }
    }

    clearChat() {
        if (this.managers.chat) {
            this.managers.chat.clearChat();
        }
    }

    getStatus() {
        return {
            initialized: this.isInitialized,
            pageLoadId: this.pageLoadId,
            managers: Object.keys(this.managers).reduce((acc, key) => {
                acc[key] = !!this.managers[key];
                return acc;
            }, {}),
            streaming: this.managers.chat?.isStreaming || false
        };
    }
}

// Ініціалізація додатку
const atlasApp = new AtlasApp();

// Запуск після завантаження DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => atlasApp.init());
} else {
    atlasApp.init();
}

// Глобальний доступ для зворотної сумісності
window.atlasApp = atlasApp;

export default atlasApp;
