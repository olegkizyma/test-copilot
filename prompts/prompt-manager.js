/**
 * Менеджер для роботи з промптами
 */
const prompts = require('./index');
const logger = require('../orchestrator/utils/logger');

class PromptManager {
  constructor() {
    this.prompts = prompts;
    this.defaultTemplate = "{{input}}";
  }
  
  /**
   * Отримання промпту за шляхом namespace/promptName
   */
  getPrompt(promptPath) {
    const [namespace, promptName] = promptPath.split('/');
    
    if (!namespace || !promptName) {
      throw new Error(`Неправильний шлях промпту: ${promptPath}. Формат повинен бути: namespace/promptName`);
    }
    
    if (!this.prompts[namespace] || !this.prompts[namespace][promptName]) {
      logger.warn(`Промпт не знайдено: ${promptPath}`);
      return null;
    }
    
    return this.prompts[namespace][promptName];
  }
  
  /**
   * Заповнення шаблону промпту даними
   */
  fillTemplate(template, data = {}) {
    if (typeof template !== 'string') {
      return this.defaultTemplate;
    }
    
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return data[key] !== undefined ? data[key] : match;
    });
  }
  
  /**
   * Отримання та заповнення промпту
   */
  preparePrompt(promptPath, data = {}) {
    const promptModule = this.getPrompt(promptPath);
    
    if (!promptModule) {
      logger.error(`Не вдалося знайти промпт: ${promptPath}`);
      return this.fillTemplate(this.defaultTemplate, data);
    }
    
    let template;
    
    if (typeof promptModule === 'string') {
      template = promptModule;
    } else if (typeof promptModule.getPrompt === 'function') {
      template = promptModule.getPrompt(data);
    } else if (promptModule.template) {
      template = promptModule.template;
    } else {
      logger.error(`Некоректний формат промпту: ${promptPath}`);
      return this.fillTemplate(this.defaultTemplate, data);
    }
    
    return this.fillTemplate(template, data);
  }
}

module.exports = new PromptManager();