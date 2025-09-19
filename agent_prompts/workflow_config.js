/**
 * КОНФІГУРАЦІЯ WORKFLOW - Послідовність етапів взаємодії агентів
 */

export const WORKFLOW_STAGES = [
    {
        stage: 1,
        agent: 'atlas',
        name: 'stage1_initial_processing',
        description: 'Atlas перефразовує та покращує запит користувача',
        required: true,
        maxRetries: 1
    },
    {
        stage: 2,
        agent: 'tetyana',
        name: 'stage2_execution',
        description: 'Тетяна виконує завдання',
        required: true,
        maxRetries: 1
    },
    {
        stage: 3,
        agent: 'atlas',
        name: 'stage3_clarification',
        description: 'Atlas надає уточнення якщо Тетяна потребує',
        required: false,
        condition: 'tetyana_needs_clarification',
        maxRetries: 1
    },
    {
        stage: 4,
        agent: 'tetyana',
        name: 'stage4_retry',
        description: 'Тетяна повторює з уточненнями Atlas',
        required: false,
        condition: 'atlas_provided_clarification',
        maxRetries: 1
    },
    {
        stage: 5,
        agent: 'grisha',
        name: 'stage5_takeover',
        description: 'Гриша бере на себе завдання якщо Тетяна не може',
        required: false,
        condition: 'tetyana_still_blocked',
        maxRetries: 1
    },
    {
        stage: 6,
        agent: 'grisha',
        name: 'stage6_verification',
        description: 'Гриша перевіряє результати виконання',
        required: true,
        maxRetries: 1
    },
    {
        stage: 7,
        agent: 'atlas',
        name: 'stage7_retry_cycle',
        description: 'Atlas координує новий цикл якщо верифікація не пройшла',
        required: false,
        condition: 'verification_failed',
        maxRetries: 2
    }
];

export const WORKFLOW_CONDITIONS = {
    async tetyana_needs_clarification(response) {
        if (!response || !response.content) return false;
        const aiAnalysis = await analyzeAgentResponse('tetyana', response.content, 'clarification');
        return aiAnalysis.predicted_state === 'needs_clarification';
    },

    async atlas_provided_clarification(response) {
        if (!response || !response.agent) return false;
        const aiAnalysis = await analyzeAgentResponse('atlas', response.content, 'clarification_provided');
        return aiAnalysis.predicted_state === 'clarified';
    },

    async tetyana_still_blocked(responses) {
        if (!Array.isArray(responses)) return false;
        const latestResponse = responses[responses.length - 1];
        const aiAnalysis = await analyzeAgentResponse('tetyana', latestResponse.content, 'block_detection');
        return aiAnalysis.predicted_state === 'blocked';
    },

    async verification_failed(response) {
        if (!response || !response.content) return false;
        if (response.agent !== 'grisha' || response.stage !== 'stage6_verification') return false;
        const aiAnalysis = await analyzeAgentResponse('grisha', response.content, 'verification');
        return aiAnalysis.predicted_state === 'verification_failed';
    }
};

export const WORKFLOW_CONFIG = {
    maxTotalStages: 7,
    maxRetryCycles: 3, // Максимум 3 цикли повторення
    timeoutPerStage: 30000, // 30 секунд на етап
    enableTTS: true,
    enableLogging: true,
    continueOnError: true,
    enableVerification: true, // Завжди перевіряти результати
    shortStatusUpdates: true // Короткі озвучення для користувача
};

// Функція для інтеграції AI для аналізу відповіді агентів
async function analyzeAgentResponse(agentName, responseText, stageName) {
    // Виклик до моделі AI для аналізу відповіді
    const result = await callAIModel({
        agent: agentName,
        stage: stageName,
        response: responseText
    });
    return result; // { predicted_state: 'blocked', ... }
}
async function callAIModel({ agent, stage, response }) {
    console.log(`AI MODEL: Аналіз агента: ${agent}, етап: ${stage}, відповідь: ${response}`);
    // TODO: Реалізувати інтеграцію зі справжньою AI-моделлю
    // Вибір моделі через ротацію
    const models = [
        'openai/gpt-4o', 'openai/gpt-4o-mini', 'openai/gpt-4.1',
        'ai21-labs/ai21-jamba-1.5-large', 'ai21-labs/ai21-jamba-1.5-mini',
        'meta/llama-3.2-11b-vision-instruct',
        'meta/llama-3.3-70b-instruct', 'meta/meta-llama-3.1-8b-instruct',
        'microsoft/phi-3.5-mini-instruct', 'microsoft/phi-4-mini-instruct',
        'mistral-ai/ministral-3b', 'mistral-ai/mistral-medium-2505'
    ];

    const selectedModel = models[Math.floor(Math.random() * models.length)];

    const res = await fetch('http://localhost:4000/v1/chat/completions', {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: selectedModel,
            messages: [
              { role: 'system', content: `Analyze agent response.` },
              { role: 'user', content: `Agent: ${agent}, Stage: ${stage}, Response: ${response}` }
            ]
        })
    });
    return await res.json();
}

export default {
    WORKFLOW_STAGES,
    WORKFLOW_CONDITIONS,
    WORKFLOW_CONFIG
};
