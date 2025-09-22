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

        row.innerHTML = `
            <td class="whisper-timestamp">${timeStr}</td>
            <td class="whisper-mode ${result.mode || 'short'}">${(result.mode || 'short').toUpperCase()}</td>
            <td class="whisper-text" title="${result.text || ''}">${this.truncateText(result.text || '', 50)}</td>
            <td class="whisper-language">${(result.language || 'uk').toUpperCase()}</td>
            <td class="whisper-status ${result.status || 'processing'}">${(result.status || 'processing').toUpperCase()}</td>
        `;

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
    addWhisperTranscription(text, mode = 'short', language = 'uk') {
        const result = {
            text: text,
            mode: mode,
            language: language,
            status: text && text.trim() ? 'success' : 'error',
            timestamp: new Date()
        };

        this.addResult(result);
        
        // Если текст есть - отправляем в чат (для интеграции с основной системой)
        if (text && text.trim() && window.atlasChat) {
            // Добавляем сообщение в чат как пользовательское
            window.atlasChat.addUserMessage(text.trim());
            
            // Отправляем сообщение через чат-менеджер
            if (window.atlasChat.sendMessage) {
                window.atlasChat.sendMessage(text.trim());
            }
        }

        return result;
    }
}

// Создаем глобальный экземпляр для использования
window.whisperResultsManager = new WhisperResultsManager();

export default WhisperResultsManager;