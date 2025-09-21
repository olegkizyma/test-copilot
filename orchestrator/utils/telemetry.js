/**
 * Модуль телеметрії для збору метрик та статистики
 */
const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

const METRICS_PATH = path.join(__dirname, '../../logs/metrics');

// Створюємо директорію для метрик, якщо не існує
async function ensureMetricsDirectory() {
  try {
    await fs.mkdir(METRICS_PATH, { recursive: true });
  } catch (err) {
    logger.error('Помилка створення директорії для метрик', err);
  }
}

class Telemetry {
  constructor() {
    this.metricsBuffer = [];
    this.flushInterval = 60000; // Збереження метрик кожну хвилину
    this.startPeriodicFlush();
  }
  
  startPeriodicFlush() {
    setInterval(() => {
      this.flush().catch(err => {
        logger.error('Помилка при збереженні метрик', err);
      });
    }, this.flushInterval);
  }
  
  async flush() {
    if (this.metricsBuffer.length === 0) {
      return;
    }
    
    await ensureMetricsDirectory();
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(METRICS_PATH, `metrics-${timestamp}.json`);
    
    try {
      const metrics = [...this.metricsBuffer];
      this.metricsBuffer = [];
      await fs.writeFile(filePath, JSON.stringify(metrics, null, 2), 'utf-8');
      logger.info(`Метрики збережено: ${filePath} (${metrics.length} записів)`);
    } catch (err) {
      logger.error('Помилка при збереженні метрик', err);
      // Повертаємо метрики в буфер
      this.metricsBuffer = [...metrics, ...this.metricsBuffer];
    }
  }
  
  recordMetric(category, name, value, tags = {}) {
    const metric = {
      timestamp: new Date().toISOString(),
      category,
      name,
      value,
      tags
    };
    
    this.metricsBuffer.push(metric);
    
    if (this.metricsBuffer.length >= 1000) {
      // Асинхронно зберігаємо при досягненні порогового значення
      this.flush().catch(err => {
        logger.error('Помилка при збереженні метрик', err);
      });
    }
    
    return metric;
  }
  
  // Метрика виконання
  recordExecution(component, duration, success, details = {}) {
    return this.recordMetric('execution', component, duration, {
      success,
      ...details
    });
  }
  
  // Метрика продуктивності
  recordPerformance(component, value, details = {}) {
    return this.recordMetric('performance', component, value, details);
  }
  
  // Метрика використання ресурсів
  recordResourceUsage(resource, value, details = {}) {
    return this.recordMetric('resource', resource, value, details);
  }
}

module.exports = new Telemetry();