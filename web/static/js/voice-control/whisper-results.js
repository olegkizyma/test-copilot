/**
 * Менеджер таблицы результатов Whisper
 * Обрабатывает отображение результатов транскрипции на веб-интерфейсе
 */

export class WhisperResultsManager {
    constructor() {
        this.tableBody = null;
        this.resultsTable = null;
        this.initialize();
    }

    initialize() {
        this.tableBody = document.querySelector('#whisper-results-table tbody');
        this.resultsTable = document.querySelector('#whisper-results-table');
        
        if (!this.tableBody) {
            console.warn('Whisper results table not found');
            return false;
        }

        // Додаємо обробник кнопки очистки
        const clearButton = document.getElementById('clear-whisper-results');
        if (clearButton) {
            clearButton.addEventListener('click', () => {
                this.clearAllResults();
            });
        }

        console.log('✅ Whisper Results Manager initialized');
        return true;
    }

    /**
     * Добавляет новый результат транскрипции в таблицу
     * @param {Object} result - Результат транскрипции
     * @param {string} result.text - Распознанный текст
     * @param {string} result.mode - Режим записи (short/long)
     * @param {string} result.language - Язык распознавания
     * @param {string} result.status - Статус (success/error/processing)
     * @param {Date} result.timestamp - Время записи
     */
    addResult(result) {
        if (!this.tableBody) {
            return;
        }

        const row = document.createElement('tr');
        
        // Форматируем время
        const timeStr = result.timestamp ? 
            result.timestamp.toLocaleTimeString('uk-UA', { 
                hour12: false, 
                hour: '2-digit', 
                minute: '2-digit', 
                second: '2-digit' 
            }) : 
            new Date().toLocaleTimeString('uk-UA', { 
                hour12: false, 
                hour: '2-digit', 
                minute: '2-digit', 
                second: '2-digit' 
            });

        // Визначаємо CSS клас та колір для відфільтрованих результатів
        const filteredClass = result.filtered ? 'filtered' : '';
        const textTitle = result.filtered 
            ? `ВІДФІЛЬТРОВАНО: ${result.reason || 'Підозрілий результат'}`
            : `Клікніть щоб відправити в чат: ${result.text || ''}`;

        row.innerHTML = `
            <td class="whisper-timestamp">${timeStr}</td>
            <td class="whisper-mode ${result.mode || 'short'}">${(result.mode || 'short').toUpperCase()}</td>
            <td class="whisper-text ${filteredClass}" title="${textTitle}" data-text="${result.text || ''}">${this.truncateText(result.text || '', 50)}</td>
            <td class="whisper-language">${(result.language || 'uk').toUpperCase()}</td>
            <td class="whisper-status ${result.status || 'processing'}">${(result.status || 'processing').toUpperCase()}</td>
        `;

        // Додаємо обробник кліку на текст для відправки в чат (тільки для не відфільтрованих)
        const textCell = row.querySelector('.whisper-text');
        if (textCell && result.text && result.text.trim() && !result.filtered) {
            textCell.addEventListener('click', () => {
                this.sendToChat(result.text.trim());
            });
            textCell.style.cursor = 'pointer';
            textCell.style.color = '#00ff88';
        } else if (result.filtered) {
            // Для відфільтрованих результатів показуємо сіро-червоний колір
            textCell.style.color = '#ff6666';
            textCell.style.opacity = '0.7';
        }

        // Добавляем в начало таблицы (новые результаты сверху)
        this.tableBody.insertBefore(row, this.tableBody.firstChild);

        // Ограничиваем количество строк в таблице
        this.limitTableRows(20);

        // Прокручиваем к новому результату
        if (this.resultsTable) {
            this.resultsTable.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    /**
     * Обновляет существующий результат
     * @param {number} index - Индекс строки (0 = последняя добавленная)
     * @param {Object} updates - Обновления для строки
     */
    updateResult(index, updates) {
        if (!this.tableBody) {
            return;
        }

        const rows = this.tableBody.querySelectorAll('tr');
        if (index >= 0 && index < rows.length) {
            const row = rows[index];
            
            if (updates.text !== undefined) {
                const textCell = row.querySelector('.whisper-text');
                if (textCell) {
                    textCell.textContent = this.truncateText(updates.text, 50);
                    textCell.title = updates.text;
                }
            }

            if (updates.language !== undefined) {
                const langCell = row.querySelector('.whisper-language');
                if (langCell) {
                    langCell.textContent = updates.language.toUpperCase();
                }
            }

            if (updates.status !== undefined) {
                const statusCell = row.querySelector('.whisper-status');
                if (statusCell) {
                    statusCell.className = `whisper-status ${updates.status}`;
                    statusCell.textContent = updates.status.toUpperCase();
                }
            }
        }
    }

    /**
     * Обрезает текст до указанной длины
     */
    truncateText(text, maxLength) {
        if (!text || text.length <= maxLength) {
            return text || '';
        }
        return text.substring(0, maxLength - 3) + '...';
    }

    /**
     * Ограничивает количество строк в таблице
     */
    limitTableRows(maxRows) {
        if (!this.tableBody) {
            return;
        }

        const rows = this.tableBody.querySelectorAll('tr');
        if (rows.length > maxRows) {
            for (let i = maxRows; i < rows.length; i++) {
                rows[i].remove();
            }
        }
    }

    /**
     * Очищает таблицу результатов
     */
    clearResults() {
        if (this.tableBody) {
            this.tableBody.innerHTML = '';
        }
    }

    /**
     * Добавляет результат с обработкой на основе типа транскрипции
     */
    addWhisperTranscription(text, mode = 'short', language = 'uk', options = {}) {
        const result = {
            text: text,
            mode: mode,
            language: language,
            status: options.filtered ? 'filtered' : (text && text.trim() ? 'success' : 'error'),
            timestamp: new Date(),
            filtered: options.filtered || false,
            reason: options.reason || null
        };

        this.addResult(result);
        
        // Автовідправка у чат, якщо доступний чат-менеджер і результат не відфільтрований
        if (text && text.trim() && !options.filtered && window.atlasChat) {
            try {
                if (typeof window.atlasChat.sendMessage === 'function') {
                    window.atlasChat.sendMessage(text.trim());
                } else if (typeof window.atlasChat.addUserMessage === 'function') {
                    // Фолбек: додати в інтерфейс, якщо пряме відправлення недоступне
                    window.atlasChat.addUserMessage(text.trim());
                }
            } catch (error) {
                console.error('❌ Error adding whisper transcription to chat:', error);
            }
        }

        return result;
    }

    /**
     * Очищає всі результати з таблиці
     */
    clearAllResults() {
        if (this.tableBody) {
            this.tableBody.innerHTML = '';
            console.log('🗑️ Whisper results table cleared');
        }
    }

    /**
     * Відправляє текст в чат
     * @param {string} text - Текст для відправки
     */
    sendToChat(text) {
        try {
            // Встановлюємо текст в input поле
            const inputElement = document.getElementById('message-input');
            if (inputElement) {
                inputElement.value = text;
            }
            
            // Відправляємо повідомлення через чат менеджер
            if (window.atlasChat && typeof window.atlasChat.sendMessage === 'function') {
                window.atlasChat.sendMessage(text);
                console.log(`📤 Sent to chat: "${text}"`);
            } else {
                console.warn('⚠️ Chat manager not available');
            }
        } catch (error) {
            console.error('❌ Error sending to chat:', error);
        }
    }
}

// Создаем глобальный экземпляр для использования
window.whisperResultsManager = new WhisperResultsManager();

export default WhisperResultsManager;