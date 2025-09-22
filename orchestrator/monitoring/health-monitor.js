/**
 * Моніторинг здоров'я системи
 */
import logger from '../utils/logger.js';
import telemetry from '../utils/telemetry.js';
import os from 'os';

class HealthMonitor {
  constructor() {
    this.status = {
      system: 'healthy',
      components: {}
    };
    this.checkInterval = 60000; // Перевірка кожну хвилину
    this.startMonitoring();
  }
  
  startMonitoring() {
    setInterval(() => {
      this.checkSystemHealth();
    }, this.checkInterval);
    
    // Ініціюємо першу перевірку відразу
    this.checkSystemHealth();
  }
  
  checkSystemHealth() {
    try {
      // Перевірка завантаження процесора
      const cpuUsage = os.loadavg()[0]; // 1-хвилинне завантаження
      const memoryUsage = 1 - (os.freemem() / os.totalmem());
      
      // Запис метрик
      telemetry.recordResourceUsage('cpu', cpuUsage);
      telemetry.recordResourceUsage('memory', memoryUsage);
      
      // Оновлення статусу системи
      this.updateComponentStatus('system_cpu', 
        cpuUsage > 0.8 ? 'warning' : 'healthy',
        { value: cpuUsage }
      );
      
      this.updateComponentStatus('system_memory',
        memoryUsage > 0.9 ? 'warning' : 'healthy',
        { value: memoryUsage }
      );
      
      // Визначення загального статусу системи
      this.calculateOverallStatus();
      
      logger.debug('Перевірка здоров\'я системи завершена', {
        status: this.status.system,
        cpu: cpuUsage.toFixed(2),
        memory: (memoryUsage * 100).toFixed(1) + '%'
      });
    } catch (error) {
      logger.error('Помилка при перевірці здоров\'я системи', error);
    }
  }
  
  updateComponentStatus(componentName, status, details = {}) {
    this.status.components[componentName] = {
      status,
      lastUpdate: new Date().toISOString(),
      details
    };
  }
  
  calculateOverallStatus() {
    let hasWarning = false;
    let hasCritical = false;
    
    Object.values(this.status.components).forEach(component => {
      if (component.status === 'warning') hasWarning = true;
      if (component.status === 'critical') hasCritical = true;
    });
    
    if (hasCritical) {
      this.status.system = 'critical';
    } else if (hasWarning) {
      this.status.system = 'warning';
    } else {
      this.status.system = 'healthy';
    }
  }
  
  getHealthStatus() {
    return {
      ...this.status,
      timestamp: new Date().toISOString()
    };
  }
}

export default new HealthMonitor();