/**
 * SHARED CONFIGURATION FOR ATLAS SYSTEM
 * Єдина конфігурація для всіх компонентів системи
 * Використовується в orchestrator, frontend, та інших модулях
 */

// Конфігурація агентів
export const AGENTS = {
    atlas: {
        role: 'strategist_coordinator',
        signature: '[ATLAS]',
        color: '#00ff00',
        voice: 'dmytro',
        priority: 1,
        description: 'Стратег, координатор, завжди починає першим',
        enableTools: false
    },
    tetyana: {
        role: 'executor', 
        name: 'Тетяна',
        model: 'github-copilot',
        signature: '[ТЕТЯНА]',
        color: '#00ffff',
        voice: 'lada',  // Изменено с 'tetiana' на 'lada' для стабильности
        priority: 2,
        description: 'Основний виконавець завдань',
        enableTools: true
    },
    grisha: {
        role: 'verifier_finalizer',
        name: 'Гриша',
        model: 'github-copilot',
        signature: '[ГРИША]', 
        color: '#ffff00',
        voice: 'mykyta',
        priority: 3,
        description: 'Верифікатор результатів та фінальний виконавець',
        enableTools: true
    },
    system: {
        role: 'system_completion',
        name: 'System',
        signature: '[SYSTEM]',
        color: '#888888',
        voice: null,
        priority: 4,
        description: 'Системне завершення workflow',
        enableTools: false
    }
};

// Workflow етапи
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
        description: 'Atlas коригує завдання на основі діагностики Гріші',
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

// Workflow конфігурація
export const WORKFLOW_CONFIG = {
    enableTTS: process.env.ENABLE_TTS !== 'false', // За замовчуванням увімкнено
    shortStatusUpdates: true,
    maxCycles: 3,
    timeoutPerStage: 60000, // 60 секунд
    enableVerification: true,
    fallbackToSimulation: false
};

// API endpoints
export const API_ENDPOINTS = {
    orchestrator: 'http://localhost:5101',
    frontend: 'http://localhost:5002',
    tts: 'http://localhost:3001',
    goose: 'http://localhost:3000'
};

// TTS конфігурація
export const TTS_CONFIG = {
    enabled: true,
    defaultVoice: 'dmytro',
    supportedVoices: ['dmytro', 'tetiana', 'mykyta', 'oleksa'],
    fallbackVoices: ['dmytro', 'oleksa', 'mykyta', 'tetiana'],
    maxRetries: 4,
    timeout: 30000,
    modes: {
        quick: 'quick',
        standard: 'standard'
    }
};

// Voice конфігурація
export const VOICE_CONFIG = {
    enabled: true,
    autoplay: true,
    volume: 1.0,
    playbackRate: 1.0,
    maxSegmentLength: 600,
    maxSegments: 20
};

// Chat конфігурація
export const CHAT_CONFIG = {
    maxMessages: 1000,
    streamingTimeout: 60000,
    retryAttempts: 3,
    retryDelay: 1000
};

// Utility functions
export function getAgentByName(name) {
    return AGENTS[name] || null;
}

export function getWorkflowStage(stageNumber) {
    return WORKFLOW_STAGES.find(stage => stage.stage === stageNumber) || null;
}

export function getApiUrl(service, endpoint = '') {
    const baseUrl = API_ENDPOINTS[service];
    if (!baseUrl) {
        throw new Error(`Unknown service: ${service}`);
    }
    return endpoint ? `${baseUrl}${endpoint}` : baseUrl;
}

export function generateShortStatus(agent, stage, action) {
    const statusMessages = {
        atlas: {
            stage1_initial_processing: "Atlas аналізує ваш запит та готує завдання для Тетяни",
            stage3_clarification: "Atlas надає уточнення для Тетяни",
            stage6_task_adjustment: "Atlas коригує завдання на основі діагностики Гріші",
            stage9_retry_cycle: "Atlas координує новий цикл виконання"
        },
        tetyana: {
            stage2_execution: "Тетяна виконує завдання",
            stage4_retry: "Тетяна повторює виконання з уточненнями"
        },
        grisha: {
            stage5_diagnosis: "Гриша аналізує причини блокування",
            stage7_verification: "Гриша перевіряє результати виконання"
        },
        system: {
            stage8_completion: "Системне завершення workflow"
        }
    };
    
    return statusMessages[agent]?.[stage] || `${agent} виконує ${stage}`;
}
