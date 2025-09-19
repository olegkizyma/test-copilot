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
    // Функція для отримання дефолтного стану
    function getDefaultState(stage) {
        const defaults = {
            'clarification_needed': 'clear_to_proceed',
            'task_completion': 'incomplete',
            'verification_check': 'verification_failed',
            'block_detection': 'not_blocked',
            'completion_confirmation': 'not_confirmed'
        };
        return defaults[stage] || 'needs_analysis';
    }

    const systemPrompts = {
        clarification_needed: `You are analyzing Ukrainian text from Tetyana to determine if she needs clarification.

        ANALYZE FOR:
        1. Direct requests for clarification or help
        2. Expressions of uncertainty or confusion
        3. Questions about the task
        4. Statements about missing information

        RETURN ONLY JSON:
        {
            "predicted_state": "needs_clarification" | "clear_to_proceed",
            "confidence": number between 0.0-1.0
        }

        KEY INDICATORS:
        Needs Clarification:
        - "не розумію", "незрозуміло"
        - "потрібно більше інформації"
        - "не можу виконати"
        - "як саме?", "що маєте на увазі?"
        - "уточніть будь ласка"

        Clear to Proceed:
        - "готово", "виконано", "зроблено"
        - Описує конкретні виконані кроки
        - Надає результати роботи
        - "можу продовжувати"`,
        
        task_completion: `You are analyzing Ukrainian text from Tetyana to determine task completion status.

        ANALYZE FOR:
        1. Explicit completion statements
        2. Concrete actions and results
        3. Error reports or blockers
        4. Task progress indicators

        RETURN ONLY JSON:
        {
            "predicted_state": "completed" | "incomplete",
            "confidence": number between 0.0-1.0
        }

        KEY INDICATORS:
        Completed Task:
        - "готово" + конкретні виконані дії
        - Дієслова виконання: "створила", "змінила", "оновила"
        - "завдання виконано" + опис результату
        - Повний опис всіх виконаних кроків
        - Надання конкретних результатів

        Incomplete Task:
        - "не можу", "виникла помилка"
        - Запитання про уточнення
        - Опис проблем без рішення
        - Часткове виконання
        - "спробую ще раз", "працюю над цим"
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

        ANALYZE FOR:
        1. Explicit approval/rejection statements
        2. Quality assessment comments
        3. Required modifications
        4. Completion status confirmation

        RETURN ONLY JSON:
        {
            "predicted_state": "verification_passed" | "verification_failed",
            "confidence": number between 0.0-1.0
        }

        KEY INDICATORS:
        Verification Passed:
        - "підтверджую", "схвалено"
        - "все правильно", "відповідає вимогам"
        - "успішно виконано"
        - "якість відповідає очікуванням"
        - Конкретний опис що саме зроблено правильно

        Verification Failed:
        - "не підтверджую", "відхилено"
        - "знайдено помилки", "є проблеми"
        - "потрібно доопрацювати"
        - "не відповідає вимогам"
        - Конкретний опис проблем`,

        block_detection: `You are analyzing Ukrainian text from Tetyana for blocking issues.

        ANALYZE FOR:
        1. Direct statements of inability
        2. Technical blockers
        3. Knowledge gaps
        4. Error conditions

        RETURN ONLY JSON:
        {
            "predicted_state": "blocked" | "not_blocked",
            "confidence": number between 0.0-1.0
        }

        KEY INDICATORS:
        Blocked State:
        - "не можу виконати" + конкретна причина
        - "виникла помилка" + опис помилки
        - "не знаю як" + конкретний аспект
        - "технічні обмеження" + деталі
        - "неможливо через" + пояснення

        Not Blocked:
        - "працюю над цим"
        - "майже готово"
        - "знайшла рішення"
        - Опис прогресу
        - "вже виконую"`
    };

    const systemPrompt = systemPrompts[stage] || `You are analyzing Ukrainian agent responses.
Return ONLY a valid JSON object with these exact fields:
{
    "predicted_state": string,
    "confidence": number (0.0-1.0)
}
DO NOT include any additional text, markdown formatting or explanation.`;
    
    // Використовуємо найбільш стабільну модель для аналізу
    const MODEL = 'openai/gpt-4o';

    // Формуємо чіткий prompt для аналізу
    const userPrompt = `
CONTEXT:
Agent: ${agent}
Current Stage: ${stage}
Response to Analyze: "${response.trim()}"

TASK:
1. Analyze the response considering:
   - Agent's role and current workflow stage
   - Overall meaning and intent of the message
   - Specific phrases and context clues in Ukrainian
   
2. Return ONLY a valid JSON object with:
   - predicted_state: String matching the stage requirements
   - confidence: Number between 0.0 and 1.0

RESPONSE FORMAT:
{"predicted_state": "state_value", "confidence": 0.95}

DO NOT include any explanations or additional text.`;

    try {
        const res = await fetch('http://localhost:4000/v1/chat/completions', {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: MODEL,
                temperature: 0.1,
                max_tokens: 100,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ]
            })
        });
        
        const result = await res.json();
        let content = result.choices?.[0]?.message?.content;
        
        // Очищаємо контент від markdown та форматування
        if (content) {
            content = content
                .replace(/```json\n?/g, '')  // Видаляємо ```json
                .replace(/```\n?/g, '')      // Видаляємо ```
                .replace(/`/g, '')           // Видаляємо окремі `
                .replace(/^\s*\n/gm, '')     // Видаляємо порожні рядки
                .trim();                     // Видаляємо зайві пробіли
        }
        
        try {
            const parsed = JSON.parse(content);
            console.log(`[AI Analysis] ${agent}/${stage}:`, parsed);
            return parsed;
        } catch (e) {
            console.warn('[AI Analysis] JSON Parse Error:', e, 'Content:', content);
            // Повертаємо безпечний fallback з низькою впевненістю
            return {
                predicted_state: getDefaultState(stage),
                confidence: 0.3
            };
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
