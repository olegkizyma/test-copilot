/**
 * AGENTS CONFIGURATION
 * Конфігурація агентів для використання з Agent Manager
 */

// Базова конфігурація агентів
const AGENT_CONFIGS = {
  atlas: {
    type: 'goose',
    model: 'atlas',
    description: 'Стратегічний аналітик та координатор',
    priority: 1
  },
  tetyana: {
    type: 'goose', 
    model: 'tetyana',
    description: 'Технічний виконавець задач',
    priority: 2
  },
  grisha: {
    type: 'goose',
    model: 'grisha', 
    description: 'Діагност та верифікатор',
    priority: 3
  },
  fallback: {
    type: 'fallback',
    model: 'fallback-llm',
    description: 'Резервна LLM модель',
    priority: 99
  }
};

// Для зворотної сумісності з існуючим кодом
export const AGENTS = AGENT_CONFIGS;

// Експортуємо конфігурацію для Agent Manager
module.exports = AGENT_CONFIGS;
