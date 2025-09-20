# ATLAS Frontend - Refactored Architecture

## 🏗️ Архітектура

Фронтенд рефакторено з монолітної структури в модульну архітектуру, синхронізовану з orchestrator.

### 📁 Структура папок

```
js/
├── core/                    # Основні модулі
│   ├── logger.js           # Єдина система логування
│   ├── config.js           # Спільні конфігурації (синхронізовано з orchestrator)
│   └── api-client.js       # Уніфікований API клієнт
├── modules/                # Функціональні модулі
│   ├── chat-manager.js     # Управління чатом (замість 104KB файлу)
│   └── tts-manager.js      # Управління TTS системою
├── app-refactored.js       # Головний додаток
├── index.js               # Точка входу
└── README.md              # Ця документація
```

## 🔧 Основні модулі

### Core Modules

#### `core/logger.js`
- **Призначення**: Єдина система логування для всього фронтенду
- **Заміняє**: Дублювання log() функцій в кожному файлі
- **API**:
  ```javascript
  import { logger } from './core/logger.js';
  
  logger.info('Message');
  logger.error('Error', errorData);
  logger.debug('Debug info');
  ```

#### `core/config.js`
- **Призначення**: Спільні конфігурації, синхронізовані з orchestrator
- **Містить**: AGENTS, API_ENDPOINTS, TTS_CONFIG, WORKFLOW_STAGES
- **API**:
  ```javascript
  import { AGENTS, API_ENDPOINTS } from './core/config.js';
  
  const atlasAgent = AGENTS.atlas;
  const orchestratorUrl = API_ENDPOINTS.orchestrator;
  ```

#### `core/api-client.js`
- **Призначення**: Уніфікований клієнт для всіх API викликів
- **Підтримує**: REST API, Streaming, різні типи контенту
- **API**:
  ```javascript
  import { orchestratorClient } from './core/api-client.js';
  
  const response = await orchestratorClient.post('/chat', data);
  await orchestratorClient.stream('/chat/stream', data, onMessage);
  ```

### Feature Modules

#### `modules/tts-manager.js`
- **Призначення**: Управління TTS системою
- **Винесено з**: intelligent-chat-manager.js (зменшення на ~30KB)
- **Функції**: Синтез мови, відтворення, синхронізація з orchestrator
- **API**:
  ```javascript
  import { TTSManager } from './modules/tts-manager.js';
  
  const tts = new TTSManager();
  await tts.speak('Текст', 'atlas');
  ```

#### `modules/chat-manager.js`
- **Призначення**: Управління чатом та повідомленнями
- **Винесено з**: intelligent-chat-manager.js (зменшення на ~50KB)
- **Функції**: Відправка повідомлень, streaming, UI управління
- **API**:
  ```javascript
  import { ChatManager } from './modules/chat-manager.js';
  
  const chat = new ChatManager();
  await chat.sendMessage('Привіт');
  ```

## 🚀 Використання

### Швидкий старт

```javascript
// Імпорт головного додатку
import atlasApp from './app-refactored.js';

// Або імпорт окремих модулів
import { ChatManager, TTSManager } from './index.js';

// Додаток ініціалізується автоматично
// Доступний через window.atlasApp
```

### Міграція з старого коду

Старий код залишається сумісним через глобальні змінні:

```javascript
// Старий спосіб (все ще працює)
window.atlasChat.sendMessage('text');

// Новий спосіб (рекомендований)
import { ChatManager } from './modules/chat-manager.js';
const chat = new ChatManager();
chat.sendMessage('text');
```

## 🔄 Синхронізація з Orchestrator

### Спільні конфігурації
- `AGENTS` - ідентичні конфігурації агентів
- `WORKFLOW_STAGES` - синхронізовані етапи workflow
- `API_ENDPOINTS` - правильні порти та URL

### TTS Events
Система подій для синхронізації TTS:
```javascript
// Фронтенд → Orchestrator
POST /tts/completed { "voice": "dmytro" }

// Orchestrator чекає події замість таймерів
await completionPromise; // Реальна подія, не setTimeout
```

## 📊 Переваги рефакторингу

### До рефакторингу:
- ❌ `intelligent-chat-manager.js`: 104KB
- ❌ Дублювання логування в кожному файлі
- ❌ Різні конфігурації агентів
- ❌ Монолітна архітектура

### Після рефакторингу:
- ✅ Модульна архітектура: ~20KB на модуль
- ✅ Єдина система логування
- ✅ Синхронізовані конфігурації
- ✅ Чистий розділ відповідальності
- ✅ Легке тестування та підтримка

## 🧪 Тестування

```javascript
// Тестування окремих модулів
import { TTSManager } from './modules/tts-manager.js';

const tts = new TTSManager();
await tts.init();
console.log('TTS enabled:', tts.isEnabled());
```

## 🔧 Налаштування

### Конфігурація в `core/config.js`:

```javascript
export const API_ENDPOINTS = {
    orchestrator: 'http://localhost:5101',
    frontend: 'http://localhost:5002',  // Реальний порт
    tts: 'http://localhost:3001',
    goose: 'http://localhost:3000'
};

export const TTS_CONFIG = {
    enabled: true,
    defaultVoice: 'dmytro',
    supportedVoices: ['dmytro', 'tetiana', 'mykyta', 'oleksa']
};
```

## 🚨 Відомі проблеми

1. **Lint помилки в `intelligent-chat-manager.js`**: Старий файл має синтаксичні помилки, використовуйте нові модулі
2. **Порт frontend**: Використовується 5002 замість 5001 (згідно з atlas_server.py)
3. **Зворотна сумісність**: Глобальні змінні підтримуються для старого коду

## 📝 TODO

- [ ] Повна міграція HTML шаблонів на нові модулі
- [ ] Видалення старого `intelligent-chat-manager.js`
- [ ] Додавання unit тестів
- [ ] Оптимізація bundle size

## 🤝 Співпраця

При додаванні нових функцій:
1. Створюйте окремі модулі в `modules/`
2. Використовуйте спільні конфігурації з `core/config.js`
3. Логуйте через `core/logger.js`
4. Синхронізуйте з orchestrator архітектурою
