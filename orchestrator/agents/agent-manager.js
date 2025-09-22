/**
 * Централізований менеджер агентів
 */
import logger from '../utils/logger.js';
import gooseClient from './goose-client.js';
import stateManager from '../state/state-manager.js';
import agentConfigs from '../config/agents.js';

class AgentManager {
  constructor() {
    this.agents = new Map();
    this.agentConfigs = agentConfigs;
    this.initializeAgents();
  }
  
  initializeAgents() {
    // Ініціалізація доступних агентів з конфігурації
    Object.entries(this.agentConfigs).forEach(([name, config]) => {
      this.registerAgent(name, config);
    });
  }
  
  registerAgent(name, config) {
    logger.info(`Реєстрація агента: ${name}`);
    this.agents.set(name, {
      name,
      config,
      status: 'idle',
      lastUsed: null
    });
  }
  
  async executeAgent(agentName, input, options = {}) {
    const agent = this.agents.get(agentName);
    if (!agent) {
      throw new Error(`Агент "${agentName}" не знайдено`);
    }
    
    try {
      // Оновлення статусу агента
      agent.status = 'busy';
      agent.lastUsed = new Date();
      
      logger.info(`Запуск агента: ${agentName}`);
      stateManager.pushToHistory({
        type: 'AGENT_EXECUTION',
        agent: agentName
      });
      
      // Визначення типу агента та маршрутизація до відповідного обробника
      let result;
      switch (agent.config.type) {
        case 'goose':
          result = await gooseClient.execute(agent.config.model, input, options);
          break;
        case 'fallback':
          const { default: fallbackLLM } = await import('../ai/fallback-llm.js');
          result = await fallbackLLM.process(input, options);
          break;
        default:
          throw new Error(`Невідомий тип агента: ${agent.config.type}`);
      }
      
      // Оновлення статусу по завершенні
      agent.status = 'idle';
      
      // Збереження результату в історію
      stateManager.pushToHistory({
        type: 'AGENT_RESULT',
        agent: agentName,
        success: true
      });
      
      return result;
    } catch (error) {
      // Обробка помилки
      agent.status = 'error';
      
      stateManager.pushToHistory({
        type: 'AGENT_ERROR',
        agent: agentName,
        error: error.message
      });
      
      throw error;
    }
  }
  
  getAgentStatus(agentName) {
    return this.agents.get(agentName) || { status: 'unknown' };
  }
  
  getAllAgentStatuses() {
    const statuses = {};
    this.agents.forEach((agent, name) => {
      statuses[name] = {
        status: agent.status,
        lastUsed: agent.lastUsed,
        type: agent.config.type
      };
    });
    return statuses;
  }
}

export default new AgentManager();