/**
 * WORKFLOW STAGES CONFIGURATION
 * Конфігурація етапів взаємодії агентів
 */

export const WORKFLOW_STAGES = [
    {
        stage: 1,
        agent: 'atlas',
        name: 'stage1_initial_process',
        description: 'Atlas формалізує та структурує завдання',
        required: true,
        maxRetries: 1,
        expectedStates: ['task_processed', 'needs_clarification']
    },
    {
        stage: 2,
        agent: 'tetyana',
        name: 'stage2_execution',
        description: 'Тетяна виконує формалізоване завдання',
        required: true,
        maxRetries: 1,
        expectedStates: ['completed', 'incomplete', 'blocked']
    },
    {
        stage: 3,
        agent: 'atlas',
        name: 'stage3_clarification',
        description: 'Atlas надає уточнення на запит Тетяни',
        required: false,
        condition: 'tetyana_needs_clarification',
        maxRetries: 1,
        expectedStates: ['clarified', 'not_clarified']
    },
    {
        stage: 4,
        agent: 'tetyana',
        name: 'stage4_retry',
        description: 'Тетяна виконує завдання з уточненнями',
        required: false,
        condition: 'atlas_provided_clarification',
        maxRetries: 1,
        expectedStates: ['completed', 'incomplete', 'blocked']
    },
    {
        stage: 5,
        agent: 'grisha',
        name: 'stage5_diagnosis',
        description: 'Гриша аналізує причини блокування Тетяни',
        required: false,
        condition: 'tetyana_still_blocked',
        maxRetries: 1,
        expectedStates: ['problem_identified', 'cannot_identify']
    },
    {
        stage: 6,
        agent: 'atlas',
        name: 'stage6_task_adjustment',
        description: 'Atlas коригує завдання на основі діагностики Гриші',
        required: false,
        condition: 'grisha_provided_diagnosis',
        maxRetries: 1,
        expectedStates: ['adjusted_task', 'not_adjusted']
    },
    {
        stage: 7,
        agent: 'grisha',
        name: 'stage7_verification',
        description: 'Гриша перевіряє правильність виконання',
        required: true,
        maxRetries: 1,
        expectedStates: ['verification_passed', 'verification_failed', 'verification_blocked']
    },
    {
        stage: 8,
        agent: 'system',
        name: 'stage8_completion',
        description: 'Системне завершення workflow',
        required: true,
        condition: 'should_complete_workflow',
        maxRetries: 0,
        expectedStates: ['success', 'failed', 'timeout_exceeded']
    },
    {
        stage: 9,
        agent: 'atlas',
        name: 'stage9_retry_cycle',
        description: 'Atlas ініціює новий цикл виконання',
        required: false,
        condition: 'should_retry_cycle',
        maxRetries: 2,
        expectedStates: ['new_strategy', 'retry_limit_reached', 'user_update', 'auto_fix']
    }
];

export const WORKFLOW_CONFIG = {
    enableTTS: process.env.ENABLE_TTS === 'true',
    shortStatusUpdates: true,
    maxCycles: 3,
    timeoutPerStage: 60000, // 60 секунд
    enableVerification: true,
    fallbackToSimulation: false // Відключено симуляцію
};
