/**
 * Централізований обробник помилок системи
 */
import stateManager from '../state/state-manager.js';
import logger from '../utils/logger.js';

class ErrorHandler {
  constructor() {
    this.errorStrategies = new Map();
    this.registerDefaultStrategies();
  }

  registerDefaultStrategies() {
    // Стратегії відновлення для різних типів помилок
    this.registerStrategy('CONNECTION_ERROR', this.handleConnectionError);
    this.registerStrategy('TIMEOUT_ERROR', this.handleTimeoutError);
    this.registerStrategy('INVALID_INPUT', this.handleInvalidInput);
    this.registerStrategy('AGENT_FAILURE', this.handleAgentFailure);
    this.registerStrategy('DEFAULT', this.handleGenericError);
  }

  registerStrategy(errorType, strategyFn) {
    this.errorStrategies.set(errorType, strategyFn);
  }

  async handleError(error, context = {}) {
    const errorType = error.type || 'DEFAULT';
    const strategy = this.errorStrategies.get(errorType) || this.errorStrategies.get('DEFAULT');
    
    // Логуємо помилку
    logger.error(`Помилка [${errorType}]: ${error.message}`, {
      stage: context.stage,
      errorDetails: error
    });
    
    // Зберігаємо в історію станів
    stateManager.pushToHistory({
      type: 'ERROR',
      errorType,
      message: error.message,
      context
    });
    
    // Оновлюємо стан з інформацією про помилку
    stateManager.updateState({
      lastError: {
        type: errorType,
        message: error.message,
        timestamp: new Date().toISOString(),
        context
      }
    });
    
    // Застосовуємо стратегію відновлення
    return strategy.call(this, error, context);
  }

  async handleConnectionError(error, context) {
    // Логіка для відновлення з'єднань
    logger.info('Спроба відновлення з\'єднання...');
    return { action: 'RETRY', delay: 2000 };
  }
  
  async handleTimeoutError(error, context) {
    // Логіка для обробки тайм-аутів
    return { action: 'RETRY', delay: 5000 };
  }
  
  async handleInvalidInput(error, context) {
    // Логіка для запиту уточнення вхідних даних
    return { action: 'REQUEST_CLARIFICATION', details: error.details };
  }
  
  async handleAgentFailure(error, context) {
    // Логіка для відновлення після збою агента
    return { action: 'FALLBACK_AGENT', agent: 'fallback' };
  }
  
  async handleGenericError(error, context) {
    // Обробка за замовчуванням
    return { action: 'NOTIFY', severity: 'HIGH' };
  }
}

export default new ErrorHandler();