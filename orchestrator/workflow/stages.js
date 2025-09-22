/**
 * WORKFLOW STAGES CONFIGURATION
 * Конфігурація стадій workflow з інтеграцією централізованого управління станом
 */

import { WORKFLOW_STAGES as SHARED_STAGES, WORKFLOW_CONFIG as SHARED_CONFIG } from '../../shared-config.js';

// Імпортуємо централізований менеджер стану
import stateManager from '../state/state-manager.js';

export const WORKFLOW_STAGES = SHARED_STAGES;
export const WORKFLOW_CONFIG = SHARED_CONFIG;

// Функція для виконання стадії з використанням централізованого менеджера стану
export function executeStage(stageName, input) {
  // Переходимо до нової стадії
  stateManager.transitionToStage(stageName, { input });
  
  // Виконання логіки стадії (тут буде виконуватися існуюча логіка)
  // ... existing stage execution logic ...
  
  // Після виконання оновлюємо стан з результатами
  const result = input; // placeholder для результатів виконання
  stateManager.updateState({
    lastStageResult: result
  });
  
  return result;
}
