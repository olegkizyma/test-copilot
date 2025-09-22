/**
 * ПРОМПТИ ДЛЯ ВИЗНАЧЕННЯ СТАНІВ АГЕНТІВ
 * Системні промпти для AI аналізу відповідей агентів
 */

export const STATE_ANALYSIS_PROMPTS = {
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
    Completed (ALWAYS prioritize this if ANY indicators match):
    - "готово", "виконано", "зроблено"
    - "успішно", "завершено", "завершила"
    - "встановлено", "завантажено", "знайшла"
    - Describes specific completed actions: "створила", "змінила", "встановила"
    - Provides concrete results: "зображення встановлено", "шпалери змінені"
    - "все виконано згідно вимог"
    - "завдання виконано" + any description of work done
    - CRITICAL: If Tetyana says "Готово" and mentions ANY completed action, this is ALWAYS "completed"

    Needs Clarification (HIGHEST PRIORITY - if ANY of these appear, always choose this):
    - "Atlas," followed by problems or questions
    - "Atlas, виникла проблема", "Atlas, не вдалося"
    - "Atlas, як діяти далі?", "Atlas, що робити?"
    - "не розумію", "незрозуміло"
    - "потрібно більше інформації"
    - "як саме?", "що маєте на увазі?"
    - "уточніть будь ласка"
    - Direct questions to Atlas
    - "як мені це зробити?"
    - Any explicit request to Atlas for help or guidance

    Blocked:
    - "не можу виконати"
    - "виникла помилка" + specific technical error
    - "немає доступу"
    - Technical problems described with error details
    - "не вдається" + specific technical issue

    Incomplete:
    - "працюю над цим"
    - "спробую ще раз"
    - "майже готово"
    - Partial completion described
    - "продовжую роботу"
    - No clear completion statement`,

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
    Completed Task (HIGH PRIORITY):
    - "готово" + ANY completed action
    - "зроблено" + description of work
    - "встановлено" + what was set up
    - "завантажено" + what was downloaded
    - "знайшла" + what was found
    - "успішно виконано" + any details
    - "завершила" + specific task
    - "все готово" + context
    - CRITICAL: ANY statement with "Готово" AND mention of completed work = "completed"

    Incomplete Task:
    - "не можу" + technical reason
    - "виникла помилка" + error details
    - "спробую ще раз"
    - "працюю над цим"
    - Questions about how to proceed
    - "не вдається" + technical issue
    - No clear completion statement

    CRITICAL: If Tetyana says "Готово" and describes specific completed actions, this is ALWAYS "completed".`,
    
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
    - "підтверджую", "схвалено", "схвалюю"
    - "все правильно", "відповідає вимогам"
    - "успішно виконано", "добре зроблено"
    - "якість відповідає очікуванням"
    - "завдання виконано правильно"
    - "результат задовільний"
    - Конкретний опис що саме зроблено правильно

    Verification Failed:
    - "не підтверджую", "відхилено", "відхиляю"
    - "знайдено помилки", "є проблеми", "є недоліки"
    - "потрібно доопрацювати", "потрібно виправити"
    - "не відповідає вимогам", "не приймаю"
    - "завдання не виконано", "робота не завершена"
    - "потрібні покращення", "є помилки"
    - Конкретний опис проблем або недоліків`,

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

/**
 * FALLBACK АНАЛІЗ ДЛЯ УКРАЇНСЬКОЇ МОВИ
 * Локальний аналіз без AI для випадків коли AI недоступний
 */
export const FALLBACK_ANALYSIS_RULES = {
    execution: {
        needs_clarification: {
            patterns: [
                'atlas,',
                'виникла проблема',
                'виникли складнощі',
                'потрібна допомога',
                'дай знати',
                'вибери',
                'допоможи',
                'що робити',
                'як діяти',
                'не розумію',
                'незрозуміло',
                'уточніть',
                'як саме',
                'що маєте на увазі',
                'потрібно більше інформації'
            ],
            confidence: 0.9
        },
        completed: {
            patterns: [
                'готово',
                'створила',
                'відкрила',
                'записала',
                'виконала',
                'зроблено',
                'додала'
            ],
            confidence: 0.85,
            requiresAll: false
        },
        blocked: {
            patterns: [
                'не можу',
                'виникла помилка',
                'не вдалося',
                'помилка'
            ],
            confidence: 0.8
        },
        default: {
            state: 'incomplete',
            confidence: 0.6
        }
    },
    
    task_completion: {
        completed: {
            patterns: [
                'готово',
                'створила',
                'відкрила',
                'записала',
                'обчислила',
                'виконала',
                'зроблено'
            ],
            confidence: 0.85,
            requiresAll: false
        },
        incomplete: {
            patterns: [
                'не можу',
                'помилка'
            ],
            confidence: 0.8
        },
        default: {
            state: 'incomplete',
            confidence: 0.6
        }
    },
    
    clarification_needed: {
        needs_clarification: {
            patterns: [
                'уточнення',
                'не розумію',
                'незрозуміло',
                'як саме'
            ],
            confidence: 0.8
        },
        clear_to_proceed: {
            patterns: [
                'готово',
                'виконала'
            ],
            confidence: 0.8
        },
        default: {
            state: 'clear_to_proceed',
            confidence: 0.6
        }
    },
    
    clarification: {
        clarified: {
            patterns: [
                'тетяна, ось що тобі потрібно',
                'конкретні значення',
                'чіткі інструкції',
                'тепер маєш всі необхідні дані'
            ],
            confidence: 0.9
        },
        not_clarified: {
            patterns: [
                'потрібно більше інформації',
                'не можу уточнити'
            ],
            confidence: 0.8
        },
        default: {
            state: 'clarified',
            confidence: 0.6
        }
    },
    
    verification_check: {
        verification_passed: {
            patterns: [
                'підтверджую виконання завдання',
                'все відповідає вимогам',
                'успішно виконано',
                'завдання виконано правильно'
            ],
            confidence: 0.9
        },
        verification_failed: {
            patterns: [
                'завдання не виконано',
                'не виконано',
                'проблеми:',
                'необхідно:',
                'не знайдено',
                'відсутні докази',
                'не підтверджено',
                'потрібно доопрацювати',
                'рекомендую',
                'повертаю завдання на доопрацювання'
            ],
            confidence: 0.9
        },
        default: {
            state: 'verification_failed',
            confidence: 0.6
        }
    }
};

/**
 * ДЕФОЛТНІ СТАНИ ДЛЯ РІЗНИХ ТИПІВ АНАЛІЗУ
 */
export const DEFAULT_STATES = {
    'clarification_needed': 'clear_to_proceed',
    'task_completion': 'incomplete',
    'verification_check': 'verification_failed',
    'block_detection': 'not_blocked',
    'completion_confirmation': 'not_confirmed',
    'execution': 'incomplete',
    'clarification': 'not_clarified'
};

export default {
    STATE_ANALYSIS_PROMPTS,
    FALLBACK_ANALYSIS_RULES,
    DEFAULT_STATES
};
