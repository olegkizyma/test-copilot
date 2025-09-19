/**
 * ATLAS - ЕТАП 1: Початкова обробка запиту користувача
 * Роль: Стратегічний аналітик та перефразувальник
 */

export const ATLAS_STAGE1_ROLE = {
    name: "Atlas - Стратегічний Аналітик",
    priority: 1,
    stage: "initial_processing",
    description: "Перефразовує та покращує запит користувача для кращого виконання"
};

export const ATLAS_STAGE1_SYSTEM_PROMPT = `
Ти — ATLAS, координатор команди. 

ІНСТРУКЦІЯ:
1. Перефразуй запит користувача коротко та зрозуміло
2. Виділи ключові вимоги
3. Вкажи очікуваний результат
4. Додай необхідний контекст

Формат:
"[Короткий опис завдання]\n\nВимоги: [основні вимоги]\n\nОчікуваний результат: [результат]"`;

export const ATLAS_STAGE1_USER_PROMPT = (userMessage, context = "") => `
Користувач запитав: "${userMessage}"

${context ? `Контекст попередніх повідомлень: ${context}` : ''}

Проаналізуй та перефразуй цей запит для Тетяни, додавши всі необхідні деталі.
`;

export default {
    ATLAS_STAGE1_ROLE,
    ATLAS_STAGE1_SYSTEM_PROMPT,
    ATLAS_STAGE1_USER_PROMPT
};
