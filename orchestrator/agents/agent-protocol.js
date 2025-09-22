/**
 * Стандартний протокол взаємодії між агентами
 */
import logger from '../utils/logger.js';

// Формати повідомлень для спілкування між агентами
const messageTypes = {
  QUERY: 'QUERY',
  RESPONSE: 'RESPONSE',
  ERROR: 'ERROR',
  NOTIFICATION: 'NOTIFICATION',
  STATUS_UPDATE: 'STATUS_UPDATE'
};

// Форматування повідомлення для агента
function formatMessage(type, content, metadata = {}) {
  return {
    type,
    content,
    metadata: {
      timestamp: new Date().toISOString(),
      ...metadata
    }
  };
}

// Валідація повідомлення
function validateMessage(message) {
  if (!message || typeof message !== 'object') {
    return false;
  }
  
  if (!Object.values(messageTypes).includes(message.type)) {
    return false;
  }
  
  if (message.content === undefined) {
    return false;
  }
  
  return true;
}

// Створення запиту до агента
function createQuery(content, metadata = {}) {
  return formatMessage(messageTypes.QUERY, content, metadata);
}

// Створення відповіді
function createResponse(content, metadata = {}) {
  return formatMessage(messageTypes.RESPONSE, content, metadata);
}

// Створення повідомлення про помилку
function createError(errorMessage, errorCode = 'UNKNOWN_ERROR', metadata = {}) {
  return formatMessage(messageTypes.ERROR, {
    message: errorMessage,
    code: errorCode
  }, metadata);
}

export {
  messageTypes,
  formatMessage,
  validateMessage,
  createQuery,
  createResponse,
  createError
};