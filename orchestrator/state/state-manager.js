/**
 * Централізований менеджер стану для всієї системи
 */
const EventEmitter = require('events');

class StateManager extends EventEmitter {
  constructor() {
    super();
    this.state = {
      currentStage: null,
      history: [],
      context: {},
      errors: []
    };
  }

  updateState(newState) {
    this.state = { ...this.state, ...newState };
    this.emit('stateChange', this.state);
    return this.state;
  }

  getCurrentState() {
    return { ...this.state };
  }

  pushToHistory(action) {
    const timestamp = new Date().toISOString();
    this.state.history.push({ timestamp, ...action });
    return this.state.history;
  }

  // Методи для роботи зі стадіями
  transitionToStage(stageName, stageData = {}) {
    const previousStage = this.state.currentStage;
    this.updateState({ 
      currentStage: stageName,
      currentStageData: stageData
    });
    
    this.pushToHistory({
      type: 'STAGE_TRANSITION',
      from: previousStage,
      to: stageName
    });
    
    return this.state;
  }
}

module.exports = new StateManager();