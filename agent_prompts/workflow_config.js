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
        id: 'stage7_task_completion_final',
        name: 'Фінальне завершення після підтвердження Гриші',
        agent: 'system',
        description: 'Завдання успішно завершено та підтверджено Гришею',
        required: false,
        condition: 'verification_passed',
        maxRetries: 0
    },
    {
        id: 'stage8_retry_cycle',
        name: 'Новий цикл після невдалої верифікації',
        agent: 'atlas',
        description: 'Atlas змінює концепцію і координує новий цикл після невдалої верифікації Гриші',
        required: false,
        condition: 'verification_failed',
        maxRetries: 2
    }
];

export const WORKFLOW_CONDITIONS = {
    async tetyana_needs_clarification(response) {
        if (!response || !response.content) return false;
        if (response.agent !== 'tetyana') return false;
        
        // Повністю покладаємося на AI аналіз без фільтрів
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
        
        // Тільки AI аналіз - ніяких ключових слів!
        const aiAnalysis = await analyzeAgentResponse('tetyana', response.content, 'task_completion');
        console.log(`[WORKFLOW] Tetyana completion analysis: ${aiAnalysis.predicted_state}, confidence: ${aiAnalysis.confidence}`);
        return aiAnalysis.predicted_state === 'completed';
    },


    async tetyana_still_blocked(responses) {
        if (!Array.isArray(responses)) return false;
        const latestResponse = responses[responses.length - 1];
        if (!latestResponse || latestResponse.agent !== 'tetyana') return false;
        
        const aiAnalysis = await analyzeAgentResponse('tetyana', latestResponse.content, 'block_detection');
        return aiAnalysis.predicted_state === 'blocked';
    },

    async verification_failed(response) {
        if (!response || !response.content) return false;
        if (response.agent !== 'grisha' || response.stage !== 'stage6_verification') return false;
        
        const aiAnalysis = await analyzeAgentResponse('grisha', response.content, 'verification_check');
        console.log(`[WORKFLOW] Grisha verification: ${aiAnalysis.predicted_state}, confidence: ${aiAnalysis.confidence}`);
        return aiAnalysis.predicted_state === 'verification_failed';
    },

    async verification_passed(response) {
        if (!response || !response.content) return false;
        if (response.agent !== 'grisha' || response.stage !== 'stage6_verification') return false;
        
        const aiAnalysis = await analyzeAgentResponse('grisha', response.content, 'verification_check');
        console.log(`[WORKFLOW] Grisha verification: ${aiAnalysis.predicted_state}, confidence: ${aiAnalysis.confidence}`);
        return aiAnalysis.predicted_state === 'verification_passed';
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
    // Умови для зупинки циклів - тільки після підтвердження Гриші!
    completionConditions: [
        'verification_passed'  // Тільки Гриша може підтвердити завершення
    ],
    // Умови для нового циклу
    retryCycleConditions: [
        'verification_failed'  // Гриша не підтвердив - новий цикл
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
        clarification_needed: `You are analyzing Ukrainian text from Tetyana (virtual assistant) to determine if she needs clarification.

        Return ONLY this JSON format: {"predicted_state": "needs_clarification" | "clear_to_proceed", "confidence": 0.0-1.0}

        NEEDS CLARIFICATION if Tetyana says:
        - She doesn't understand something (не розумію, незрозуміло)
        - Needs more information (потрібно більше інформації, не вистачає)  
        - Cannot complete task due to unclear instructions (не можу виконати)
        - Asks questions or requests clarification (уточнення, як саме?)

        CLEAR TO PROCEED if Tetyana:
        - Reports task completion (готово, виконано, зроблено)
        - Lists specific steps she took
        - Says she's ready or waiting for next task
        - Provides concrete results`,
        
        task_completion: `You are analyzing Ukrainian text from Tetyana to determine if she completed a task.

        Return ONLY this JSON format: {"predicted_state": "completed" | "incomplete", "confidence": 0.0-1.0}

        TASK IS COMPLETED if Tetyana:
        - Says "Готово" and lists what she did
        - Reports specific actions taken (відкрила, створила, записала, обчислила)
        - Provides concrete results or outcomes  
        - States task is done/finished (виконано, зроблено)
        - Describes successful completion of all requested steps

        TASK IS INCOMPLETE if Tetyana:
        - Says she cannot do something (не можу)
        - Reports errors or problems
        - Asks for clarification or help
        - Only partially completed the request

        CRITICAL: If Tetyana says "Готово" and describes specific completed actions, this is ALWAYS "completed".`,
        
        completion_confirmation: `You are analyzing Ukrainian text from Atlas to see if he confirmed task completion.

        Return ONLY this JSON format: {"predicted_state": "confirmed_complete" | "not_confirmed", "confidence": 0.0-1.0}

        CONFIRMED COMPLETE if Atlas says:
        - Task is fully completed (повністю виконано)
        - No additional actions needed (додаткових дій не потрібно) 
        - Everything is ready/done (все готово)
        - Task finished successfully (завершено успішно)

        NOT CONFIRMED if Atlas:
        - Gives new instructions or tasks
        - Says more work is needed
        - Requests modifications or changes`,
        
        verification_check: `You are analyzing Ukrainian text from Grisha's verification response.

        Return ONLY this JSON format: {"predicted_state": "verification_failed" | "verification_passed", "confidence": 0.0-1.0}

        VERIFICATION FAILED if Grisha says:
        - Task not confirmed (не підтверджено)
        - Found problems or issues (проблеми, помилки) 
        - Needs rework (потрібно переробити)
        - Task incomplete (не виконано, неповністю)

        VERIFICATION PASSED if Grisha says:
        - Task confirmed/approved (підтверджено)
        - Everything correct (все правильно)
        - Successfully completed (успішно виконано)
        - Meets requirements (відповідає вимогам)`,
        
        block_detection: `You are analyzing Ukrainian text to see if Tetyana is blocked.

        Return ONLY this JSON format: {"predicted_state": "blocked" | "not_blocked", "confidence": 0.0-1.0}

        BLOCKED if Tetyana says:
        - Cannot do something (не можу зробити)
        - It's impossible (неможливо)
        - Doesn't know how (не знаю як)
        - Encountered errors (помилка, збій)

        NOT BLOCKED if Tetyana:
        - Reports successful completion
        - Describes what she did
        - Says task is ready/done`
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
            console.warn('AI JSON Parse Error:', e, 'Content:', content);
            // Fallback якщо JSON некоректний - робимо локальний аналіз
            return localFallbackAnalysis(stage, response);
        }
    } catch (error) {
        console.error('AI Model Error:', error);
        // Fallback для локального аналізу
        return localFallbackAnalysis(stage, response);
    }
}

// Локальний fallback аналіз для української мови
function localFallbackAnalysis(stage, response) {
    const text = response.toLowerCase();
    
    switch (stage) {
        case 'task_completion':
            // Позитивні індикатори завершення
            if (text.includes('готово') && 
                (text.includes('створила') || text.includes('відкрила') || 
                 text.includes('записала') || text.includes('обчислила') ||
                 text.includes('виконала') || text.includes('зроблено'))) {
                return { predicted_state: 'completed', confidence: 0.85 };
            }
            if (text.includes('не можу') || text.includes('помилка')) {
                return { predicted_state: 'incomplete', confidence: 0.8 };
            }
            return { predicted_state: 'incomplete', confidence: 0.6 };
            
        case 'clarification_needed':
            if (text.includes('уточнення') || text.includes('не розумію') || 
                text.includes('незрозуміло') || text.includes('як саме')) {
                return { predicted_state: 'needs_clarification', confidence: 0.8 };
            }
            if (text.includes('готово') || text.includes('виконала')) {
                return { predicted_state: 'clear_to_proceed', confidence: 0.8 };
            }
            return { predicted_state: 'clear_to_proceed', confidence: 0.6 };
            
        case 'verification_check':
            if (text.includes('підтверджено') || text.includes('все правильно') ||
                text.includes('успішно виконано')) {
                return { predicted_state: 'verification_passed', confidence: 0.8 };
            }
            if (text.includes('не підтверджено') || text.includes('проблеми')) {
                return { predicted_state: 'verification_failed', confidence: 0.8 };
            }
            return { predicted_state: 'verification_passed', confidence: 0.5 };
            
        default:
            return { predicted_state: 'needs_analysis', confidence: 0.3 };
    }
}

export default {
    WORKFLOW_STAGES,
    WORKFLOW_CONDITIONS,
    WORKFLOW_CONFIG
};
