# Стандарт промптів ATLAS4

## Структура промптів

Всі промпти повинні відповідати єдиному формату для забезпечення сумісності та зручності підтримки.

### Простий формат (експорт рядка)

```javascript
module.exports = `
Ви помічник по задачі {{taskName}}.
Контекст: {{context}}

Будь ласка, виконайте наступну дію:
{{action}}
`;
```

### Розширений формат (експорт об'єкта)

```javascript
module.exports = {
  // Метадані промпту
  name: 'Назва промпту',
  description: 'Опис промпту та його призначення',
  version: '1.0.0',
  author: 'Ім\'я автора',
  
  // Функція для динамічної генерації промпту
  getPrompt: (data) => {
    return `
    Ви помічник по задачі ${data.taskName}.
    Контекст: ${data.context}

    Будь ласка, виконайте наступну дію:
    ${data.action}
    `;
  },
  
  // Або статичний шаблон
  template: `
  Ви помічник по задачі {{taskName}}.
  Контекст: {{context}}

  Будь ласка, виконайте наступну дію:
  {{action}}
  `
};
```

## Використання промптів

Для використання промптів у коді, використовуйте PromptManager:

```javascript
const promptManager = require('./prompt-manager');

// Отримання та заповнення промпту
const filledPrompt = promptManager.preparePrompt('atlas/stage1_initial_processing', {
  taskName: 'Обробка даних',
  context: 'Дані користувача',
  action: 'Проаналізуйте дані'
});
```

## Структура директорій

- `/atlas/` - промпти для загальної логіки обробки задач
- `/grisha/` - промпти для діагностики та верифікації
- `/tetyana/` - промпти для виконання та повторних спроб
- `/system/` - системні промпти для аналізу стану та службових задач

## Правила іменування

- Використовуйте змістовні назви файлів: `stage1_initial_processing.js`
- Включайте номер стадії для правильного порядку виконання
- Використовуйте англійські назви файлів для сумісності

## Приклади використання

### Базове використання
```javascript
const prompt = promptManager.preparePrompt('atlas/stage1_initial_processing', {
  userQuery: 'Допоможіть з аналізом даних',
  context: 'Файл CSV з продажами'
});
```

### Використання з метаданими
```javascript
const promptModule = promptManager.getPrompt('system/state_analysis_prompts');
if (promptModule.version) {
  console.log(`Використовується промпт версії: ${promptModule.version}`);
}
```