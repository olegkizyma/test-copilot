/**
 * AGENTS CONFIGURATION
 * Конфігурація агентів системи ATLAS
 */

export const AGENTS = {
    atlas: {
        role: 'strategist_coordinator',
        signature: '[ATLAS]',
        color: '#00ff00',
        voice: 'dmytro',
        priority: 1,
        description: 'Стратег, координатор, завжди починає першим',
        enableTools: false // Atlas працює тільки з текстом
    },
    tetyana: {
        role: 'executor', 
        signature: '[ТЕТЯНА]',
        color: '#00ffff',
        voice: 'tetiana',
        priority: 2,
        description: 'Основний виконавець завдань',
        enableTools: true // Тетяна має доступ до всіх інструментів
    },
    grisha: {
        role: 'verifier_finalizer',
        signature: '[ГРИША]', 
        color: '#ffff00',
        voice: 'mykyta',
        priority: 3,
        description: 'Верифікатор результатів та фінальний виконавець',
        enableTools: true // Гриша має доступ до інструментів для верифікації
    }
};

// Генерація короткого статусу для користувача (без емодзі)
export function generateShortStatus(agent, stage, action) {
    const statusMessages = {
        atlas: {
            stage1_initial_processing: "Atlas аналізує ваш запит та готує завдання для Тетяни",
            stage3_clarification: "Atlas надає уточнення для Тетяни",
            stage7_retry_cycle: "Atlas координує новий цикл виконання"
        },
        tetyana: {
            stage2_execution: "Тетяна виконує завдання",
            stage4_retry: "Тетяна повторює виконання з уточненнями"
        },
        grisha: {
            stage5_takeover: "Гриша бере на себе завдання",
            stage6_verification: "Гриша перевіряє результати виконання"
        }
    };
    
    return statusMessages[agent]?.[stage] || `${agent} виконує ${stage}`;
}
