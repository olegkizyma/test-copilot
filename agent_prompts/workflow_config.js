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
        id: 'stage7_completion_check',
        name: 'Перевірка завершення завдання',
        agent: 'system',
        description: 'Перевіряємо чи завдання дійсно завершено успішно',
        required: true,
        condition: 'tetyana_completed_task',
        maxRetries: 0
    },
    {
        id: 'stage8_retry_cycle',
        name: 'Новий цикл після невдалої верифікації',
        agent: 'atlas',
        description: 'Atlas координує новий цикл якщо верифікація не пройшла',
        required: false,
        condition: 'verification_failed',
        maxRetries: 2
    }
];

export const WORKFLOW_CONDITIONS = {
    async tetyana_needs_clarification(response) {
        if (!response || !response.content) return false;
        if (response.agent !== 'tetyana') return false;
        
        const text = response.content.toLowerCase();
        // Спочатку швидка перевірка ключових слів
        const needsClarification = text.includes('уточнення') || 
               text.includes('потрібно знати') || 
               text.includes('не вистачає') ||
               text.includes('незрозуміло') ||
               text.includes('не можу виконати') ||
               text.includes('треба більше інформації');
        
        if (!needsClarification) return false;
        
        // Тільки якщо є підозра - використовуємо AI
        const aiAnalysis = await analyzeAgentResponse('tetyana', response.content, 'clarification_needed');
        return aiAnalysis.predicted_state === 'needs_clarification';
    },

    async atlas_provided_clarification(response) {
        if (!response || !response.agent) return false;
        if (response.agent !== 'atlas') return false;
        const aiAnalysis = await analyzeAgentResponse('atlas', response.content, 'clarification_provided');
        return aiAnalysis.predicted_state === 'clarified';
    },

    async tetyana_completed_task(response) {
        if (!response || !response.content) return false;
        if (response.agent !== 'tetyana') return false;
        
        const text = response.content.toLowerCase();
        // Швидка перевірка позитивних індикаторів завершення
        const completed = text.includes('завдання виконала') || 
               text.includes('завдання виконано') || 
               text.includes('створена') ||
               text.includes('створила') ||
               text.includes('готово') ||
               text.includes('зроблено') ||
               text.includes('успішно') ||
               (text.includes('файл') && text.includes('відкрито'));
        
        if (!completed) return false;
        
        // AI аналіз для підтвердження
        const aiAnalysis = await analyzeAgentResponse('tetyana', response.content, 'task_completion');
        return aiAnalysis.predicted_state === 'completed';
    },

    async atlas_confirmed_completion(response) {
        if (!response || !response.content) return false;
        if (response.agent !== 'atlas') return false;
        
        const text = response.content.toLowerCase();
        // Швидка перевірка підтвердження завершення
        const confirmed = text.includes('завдання повністю виконано') || 
               text.includes('додаткових дій не потрібно') || 
               text.includes('все готово') ||
               text.includes('завершено успішно');
        
        if (!confirmed) return false;
        
        // AI аналіз для підтвердження
        const aiAnalysis = await analyzeAgentResponse('atlas', response.content, 'completion_confirmation');
        return aiAnalysis.predicted_state === 'confirmed_complete';
    },

    async tetyana_still_blocked(responses) {
        if (!Array.isArray(responses)) return false;
        const latestResponse = responses[responses.length - 1];
        if (!latestResponse || latestResponse.agent !== 'tetyana') return false;
        
        const text = latestResponse.content.toLowerCase();
        // Швидка перевірка блокування
        const blocked = text.includes('не можу') ||
               text.includes('неможливо') ||
               text.includes('все одно не зрозуміло') ||
               text.includes('помилка');
        
        if (!blocked) return false;
        
        const aiAnalysis = await analyzeAgentResponse('tetyana', latestResponse.content, 'block_detection');
        return aiAnalysis.predicted_state === 'blocked';
    },

    async verification_failed(response) {
        if (!response || !response.content) return false;
        if (response.agent !== 'grisha' || response.stage !== 'stage6_verification') return false;
        
        const text = response.content.toLowerCase();
        // Швидка перевірка невдалої верифікації
        const failed = text.includes('не підтверджено') || 
               text.includes('❌') ||
               text.includes('проблеми') ||
               text.includes('не виконано') ||
               text.includes('відправляю на доопрацювання') ||
               text.includes('потрібно більше') ||
               text.includes('завдання виконано неповністю');
        
        if (!failed) return false;
        
        const aiAnalysis = await analyzeAgentResponse('grisha', response.content, 'verification_check');
        return aiAnalysis.predicted_state === 'verification_failed';
    }
};

export const WORKFLOW_CONFIG = {
    maxTotalStages: 8,
    maxRetryCycles: 3, // Максимум 3 цикли повторення
    timeoutPerStage: 30000, // 30 секунд на етап
    enableTTS: true,
    enableLogging: true,
    continueOnError: true,
    enableVerification: true, // Завжди перевіряти результати
    shortStatusUpdates: true, // Короткі озвучення для користувача
    // КРИТИЧНО: Зупиняти цикли при успішному завершенні
    stopOnTaskCompletion: true,
    // Умови для зупинки циклів
    completionConditions: [
        'tetyana_completed_task',
        'atlas_confirmed_completion'
    ]
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
    
    // Створюємо спеціалізовані промпти для кожного типу аналізу
    const systemPrompts = {
        clarification_needed: `You are analyzing whether Tetyana (agent assistant) needs clarification for a task. 
        Return JSON: {"predicted_state": "needs_clarification" | "clear_to_proceed", "confidence": 0.0-1.0}
        
        Tetyana needs clarification if she says she doesn't understand, needs more info, can't proceed, or asks questions.
        If she says she completed/did something, she does NOT need clarification.`,
        
        task_completion: `You are analyzing whether Tetyana successfully completed a task.
        Return JSON: {"predicted_state": "completed" | "incomplete", "confidence": 0.0-1.0}
        
        Task is completed if Tetyana reports she finished, created files/folders, or says "ready". 
        Look for words like: виконала, створила, готово, успішно, завершила, зроблено.`,
        
        completion_confirmation: `You are analyzing whether Atlas confirmed task completion.
        Return JSON: {"predicted_state": "confirmed_complete" | "not_confirmed", "confidence": 0.0-1.0}
        
        Atlas confirms completion if he says task is fully done, no additional actions needed, everything ready.
        Look for: "повністю виконано", "додаткових дій не потрібно", "все готово".`,
        
        verification_check: `You are analyzing Grisha's verification response.
        Return JSON: {"predicted_state": "verification_failed" | "verification_passed", "confidence": 0.0-1.0}
        
        Verification FAILED if Grisha says: not confirmed, problems, needs rework, incomplete.
        Verification PASSED if Grisha says: confirmed, successful, task completed correctly.`,
        
        block_detection: `You are analyzing if Tetyana is blocked and cannot proceed.
        Return JSON: {"predicted_state": "blocked" | "not_blocked", "confidence": 0.0-1.0}
        
        Tetyana is blocked if she says she cannot do something, impossible, unclear, errors occurred.`
    };

    const systemPrompt = systemPrompts[stage] || `Analyze the agent response and return JSON with predicted_state and confidence.`;
    
    // Вибір моделі через ротацію  
    const models = [
        'openai/gpt-4o-mini', 'openai/gpt-4o', 'openai/gpt-4.1',
        'meta/meta-llama-3.1-8b-instruct', 'meta/llama-3.3-70b-instruct',
        'microsoft/phi-3.5-mini-instruct', 'mistral-ai/ministral-3b'
    ];

    const selectedModel = models[Math.floor(Math.random() * models.length)];

    try {
        const res = await fetch('http://localhost:4000/v1/chat/completions', {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: selectedModel,
                temperature: 0.1,
                max_tokens: 100,
                messages: [
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: `Agent: ${agent}\nStage: ${stage}\nResponse: "${response}"\n\nAnalyze and return JSON only.` }
                ]
            })
        });
        
        const result = await res.json();
        const content = result.choices?.[0]?.message?.content;
        
        try {
            return JSON.parse(content);
        } catch (e) {
            // Fallback якщо JSON некоректний
            return {
                predicted_state: stage.includes('completion') ? 'completed' : 'needs_analysis',
                confidence: 0.5
            };
        }
    } catch (error) {
        console.error('AI Model Error:', error);
        // Fallback для локального аналізу
        return {
            predicted_state: response.toLowerCase().includes('виконала') ? 'completed' : 'needs_analysis',
            confidence: 0.7
        };
    }
}

export default {
    WORKFLOW_STAGES,
    WORKFLOW_CONDITIONS,
    WORKFLOW_CONFIG
};
