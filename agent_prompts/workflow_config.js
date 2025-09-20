/**
 * КОНФІГУРАЦІЯ WORKFLOW - Послідовність етапів взаємодії агентів
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

export const WORKFLOW_CONDITIONS = {
    async tetyana_needs_clarification(response) {
        if (!response?.content || response.agent !== 'tetyana') return false;
        const aiAnalysis = await analyzeAgentResponse('tetyana', response.content, 'execution');
        console.log(`[WORKFLOW] Tetyana clarification check: ${aiAnalysis.predicted_state} (confidence: ${aiAnalysis.confidence})`);
        return aiAnalysis.predicted_state === 'needs_clarification';
    },

    async atlas_provided_clarification(response) {
        if (!response?.content || response.agent !== 'atlas') return false;
        const aiAnalysis = await analyzeAgentResponse('atlas', response.content, 'clarification');
        console.log(`[WORKFLOW] Atlas clarification check: ${aiAnalysis.predicted_state} (confidence: ${aiAnalysis.confidence})`);
        return aiAnalysis.predicted_state === 'clarified';
    },

    async tetyana_completed_task(response) {
        if (!response?.content || response.agent !== 'tetyana') return false;
        const aiAnalysis = await analyzeAgentResponse('tetyana', response.content, 'execution');
        console.log(`[WORKFLOW] Tetyana execution state: ${aiAnalysis.predicted_state} (${aiAnalysis.confidence})`);
        return aiAnalysis.predicted_state === 'completed';
    },

    async tetyana_still_blocked(responses) {
        if (!Array.isArray(responses)) return false;
        const latestResponse = responses[responses.length - 1];
        if (!latestResponse?.content || latestResponse.agent !== 'tetyana') return false;
        
        const aiAnalysis = await analyzeAgentResponse('tetyana', latestResponse.content, 'execution');
        return aiAnalysis.predicted_state === 'blocked';
    },

    async grisha_provided_diagnosis(response) {
        if (!response?.content || response.agent !== 'grisha') return false;
        const aiAnalysis = await analyzeAgentResponse('grisha', response.content, 'block_detection');
        console.log(`[WORKFLOW] Grisha diagnosis check: ${aiAnalysis.predicted_state} (confidence: ${aiAnalysis.confidence})`);
        return aiAnalysis.predicted_state === 'blocked';
    },

    async should_complete_workflow(response) {
        // Перевіряємо умови завершення workflow
        
        // 1. Перевірка на timeout
        const hasTimedOut = Date.now() - response?.startTime >= WORKFLOW_CONFIG.timeoutPerStage * WORKFLOW_CONFIG.maxTotalStages;
        if (hasTimedOut) {
            response.predicted_state = 'timeout_exceeded';
            return true;
        }

        // 2. Перевірка на успішну верифікацію
        const verificationPassed = response?.content && response.agent === 'grisha' &&
            (await analyzeAgentResponse('grisha', response.content, 'verification_check')).predicted_state === 'verification_passed';
        if (verificationPassed) {
            response.predicted_state = 'success';
            return true;
        }

        // 3. Перевірка на ліміт спроб
        const reachedRetryLimit = response?.retryCount >= WORKFLOW_CONFIG.maxRetryCycles;
        if (reachedRetryLimit) {
            response.predicted_state = 'failed';
            return true;
        }

        return false;
    },

    async should_retry_cycle(response) {
        if (!response?.content || response.agent !== 'grisha') return false;
        
        const aiAnalysis = await analyzeAgentResponse('grisha', response.content, 'verification_check');
        const verificationFailed = aiAnalysis.predicted_state === 'verification_failed';
        const hasRetries = response.retryCount < WORKFLOW_CONFIG.maxRetryCycles;
        
        console.log(`[WORKFLOW] Grisha verification result: ${aiAnalysis.predicted_state} (confidence: ${aiAnalysis.confidence})`);
        
        // Якщо впевненість низька - також йдем на retry
        const lowConfidence = aiAnalysis.confidence < 0.8;
        
        return (verificationFailed || lowConfidence) && hasRetries;
    }
};

export const WORKFLOW_CONFIG = {
    maxTotalStages: 8,
    maxRetryCycles: 3, // Максимум 3 цикли повторення
    timeoutPerStage: 30000, // 30 секунд на етап

    // Уніфіковані стани для аналізу відповідей агентів
    analysisStates: {
        execution: {
            states: ['completed', 'incomplete', 'blocked', 'needs_clarification'],
            confidence_threshold: 0.7
        },
        retry_cycle: {
            states: ['new_strategy', 'retry_limit_reached', 'user_update', 'auto_fix'],
            confidence_threshold: 0.8
        },
        clarification: {
            states: ['clarified', 'not_clarified'],
            confidence_threshold: 0.8
        },
        diagnosis: {
            states: ['problem_identified', 'cannot_identify'],
            confidence_threshold: 0.8
        },
        verification: {
            states: ['verification_passed', 'verification_failed', 'verification_blocked'],
            confidence_threshold: 0.9
        },
        task_adjustment: {
            states: ['adjusted_task', 'not_adjusted'],
            confidence_threshold: 0.8
        }
    },
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
    // Перевіряємо чи responseText валідний
    if (!responseText || typeof responseText !== 'string' || responseText.trim() === '') {
        console.warn(`[AI Analysis] Empty or invalid responseText for ${agentName}/${stageName}:`, responseText);
        return {
            predicted_state: 'needs_analysis',
            confidence: 0.1
        };
    }
    
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
    
    // Перевіряємо чи response не undefined
    if (!response || response === 'undefined' || typeof response !== 'string') {
        console.warn(`[AI Analysis] Invalid response for ${agent}/${stage}:`, response);
        return {
            predicted_state: getDefaultState(stage),
            confidence: 0.1
        };
    }
    
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
        
        execution: `You are analyzing Ukrainian text from Tetyana to determine her execution state.

        ANALYZE FOR:
        1. Task completion status
        2. Need for clarification or help
        3. Blocking issues or problems
        4. Progress indicators

        RETURN ONLY JSON:
        {
            "predicted_state": "completed" | "incomplete" | "blocked" | "needs_clarification",
            "confidence": number between 0.0-1.0
        }

        KEY INDICATORS:
        Completed:
        - "готово", "виконано", "зроблено"
        - Describes specific completed actions
        - Provides concrete results
        - "завдання виконано"

        Needs Clarification:
        - "не розумію", "незрозуміло"
        - "потрібно більше інформації"
        - "як саме?", "що маєте на увазі?"
        - "уточніть будь ласка"
        - Direct questions to Atlas

        Blocked:
        - "не можу виконати"
        - "виникла помилка"
        - "немає доступу"
        - Technical problems described

        Incomplete:
        - "працюю над цим"
        - "спробую ще раз"
        - Partial completion described
        - "продовжую роботу"`,
        
        clarification: `You are analyzing Ukrainian text from Atlas to determine if he provided clarification.

        ANALYZE FOR:
        1. Direct answers to Tetyana's questions
        2. Specific guidance and instructions
        3. Concrete solutions provided
        4. Clear next steps outlined

        RETURN ONLY JSON:
        {
            "predicted_state": "clarified" | "not_clarified",
            "confidence": number between 0.0-1.0
        }

        KEY INDICATORS:
        Clarified:
        - "Тетяна, ось що тобі потрібно"
        - Provides specific answers to questions
        - Gives concrete values, paths, parameters
        - "Тепер маєш всі необхідні дані"
        - Clear step-by-step instructions

        Not Clarified:
        - Repeats the original task
        - Asks more questions
        - Vague or general responses
        - "потрібно більше інформації"
        - No specific guidance provided`,
        
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
    
    // Використовуємо Mistral 3B для аналізу (найшвидша - 45 req/min)
    const MODEL = 'mistral-ai/ministral-3b';

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
        case 'execution':
            // Перевіряємо на потребу в уточненнях
            if (text.includes('не розумію') || text.includes('незрозуміло') ||
                text.includes('уточніть') || text.includes('як саме') ||
                text.includes('що маєте на увазі') || text.includes('потрібно більше інформації')) {
                return { predicted_state: 'needs_clarification', confidence: 0.9 };
            }
            // Перевіряємо на завершення
            if (text.includes('готово') && 
                (text.includes('створила') || text.includes('відкрила') || 
                 text.includes('записала') || text.includes('виконала') ||
                 text.includes('зроблено') || text.includes('додала'))) {
                return { predicted_state: 'completed', confidence: 0.85 };
            }
            // Перевіряємо на блокування
            if (text.includes('не можу') || text.includes('виникла помилка') ||
                text.includes('не вдалося') || text.includes('помилка')) {
                return { predicted_state: 'blocked', confidence: 0.8 };
            }
            // За замовчуванням - incomplete
            return { predicted_state: 'incomplete', confidence: 0.6 };
            
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
            
        case 'clarification':
            if (text.includes('тетяна, ось що тобі потрібно') || 
                text.includes('конкретні значення') || text.includes('чіткі інструкції') ||
                text.includes('тепер маєш всі необхідні дані')) {
                return { predicted_state: 'clarified', confidence: 0.9 };
            }
            if (text.includes('потрібно більше інформації') || 
                text.includes('не можу уточнити')) {
                return { predicted_state: 'not_clarified', confidence: 0.8 };
            }
            return { predicted_state: 'clarified', confidence: 0.6 };
            
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
