# ATLAS - Adaptive Task and Learning Assistant System v4.0
## Modular Architecture Edition

## Швидкий старт

```bash
# 1. Встановити всі залежності
make install

# 2. Запустити систему
make start

# або використовувати єдиний скрипт управління:
./restart_system.sh start
```

## 🎉 Нові можливості v4.0

- **🏗️ Модульна архітектура** - повністю рефакторений фронтенд та orchestrator
- **🔄 Єдина конфігурація** - `shared-config.js` для всієї системи
- **📦 ES6 модулі** - сучасна JavaScript архітектура
- **🎯 Event-based TTS** - синхронізація через реальні події, не таймери
- **🧹 Очищена структура** - видалено дублювання та застарілі файли

## Системні вимоги

- macOS (Apple Silicon або Intel)
- Python 3.9+
- Node.js 16+
- Goose Desktop (рекомендовано) або Goose CLI

## Основні можливості

- **Єдине централізоване управління** - один скрипт для всієї системи
- **Інтеграція з Goose Desktop** - використовує десктопну версію як сервер
- **3 інтелектуальних агенти**: Atlas (координатор), Тетяна (виконавець), Гриша (верифікатор)
- **Автоматична обробка уточнень** - Atlas автоматично бере на себе управління при потребі уточнень
- **Реальний TTS** - підтримка українського Text-to-Speech
- **Централізоване управління залежностями**

## 🛠️ Управління системою

### Команди Make

```bash
make help         # Показати всі команди
make install      # Встановити залежності
make setup        # Початкове налаштування
make start        # Запустити систему
make stop         # Зупинити систему
make restart      # Перезапустити систему
make status       # Перевірити статус
make logs         # Переглядати логи
make clean        # Очистити логи
make test         # Запустити тести
```

### Універсальний скрипт управління

```bash
./restart_system.sh start    # Запустити систему
./restart_system.sh stop     # Зупинити систему
./restart_system.sh restart  # Перезапустити
./restart_system.sh status   # Статус сервісів
./restart_system.sh logs     # Переглядати логи
./restart_system.sh clean    # Очистити логи
./restart_system.sh help     # Довідка
```

### Змінні середовища

```bash
# Goose конфігурація
GOOSE_DESKTOP_PATH=/Applications/Goose.app/Contents/MacOS/goose
GOOSE_USE_DESKTOP=true      # Використовувати десктопну версію
GOOSE_SERVER_PORT=3000      # Порт для Goose сервера

# TTS конфігурація
REAL_TTS_MODE=true          # Реальний TTS замість mock
TTS_DEVICE=mps              # mps для Apple Silicon
TTS_PORT=3001               # Порт TTS сервера

# Додаткові налаштування
ENABLE_LOCAL_FALLBACK=false # Локальний fallback LLM
FORCE_FREE_PORTS=true       # Автоматично звільняти порти
```

## 🏗️ Архітектура

### Основні компоненти

- **Goose Server** (Port 3000) - Інтерфейс користувача та управління завданнями
- **Node.js Orchestrator** (Port 5101) - Координація агентів та workflow
- **Python Frontend** (Port 5001) - Веб-інтерфейс та розумна обробка
- **Recovery Bridge** (Port 5102) - WebSocket мост для відновлення після збоїв
- **TTS Service** (Port 3001) - Український Text-to-Speech сервіс

### Multi-Agent Framework

Всі агенти працюють через Goose Engine з GitHub Copilot:

- **🧠 ATLAS Agent** (зелений) - Координатор, стратег, куратор завдань
- **💪 TETYANA Agent** (блакитний) - Основний виконавець завдань
- **🛡️ GRISHA Agent** (жовтий) - Верифікатор, контроль якості результатів

### Workflow етапи:
1. **Stage 1**: ATLAS - Початкова обробка (формалізація завдання)
2. **Stage 2**: TETYANA - Виконання завдання  
3. **Stage 3**: ATLAS - Уточнення (за потреби)
4. **Stage 4**: TETYANA - Повторне виконання з уточненнями
5. **Stage 5**: GRISHA - Діагностика (якщо блокування)
6. **Stage 6**: ATLAS - Корекція завдання  
7. **Stage 7**: GRISHA - Верифікація результатів ✅
8. **Stage 8**: SYSTEM - Завершення workflow
9. **Stage 9**: ATLAS - Новий цикл (якщо потрібно)

## 🎯 Ключові особливості

### Автоматична система відмовостійкості:
- **WebSocket інтеграція з Goose** - timeout 120 секунд, retry механізм
- **Token limit захист** - автоматичне обрізання тексту до 2000 символів
- **Goose API error handling** - 3 спроби з затримкою 1 секунда
- **HTTP to WebSocket fallback** - автоматичне перемикання при 404 помилках

### Ukrainian TTS система:
- **Множинні голоси**: dmytro, tetiana, mykyta, oleksa
- **Реальний синтез мовлення** - не mock-режим
- **Голосова система агентів** - кожен агент має свій голос
- **Apple Silicon оптимізація** - MPS device для нейронних мереж

### Централізоване управління:
- **restart_system.sh** - єдиний скрипт для всієї системи
- **config.yaml** - головний конфігураційний файл
- **Автоматична діагностика** - вбудована система перевірок
- **Архівування невикористаних файлів** - очищення структури проекту

## 🚀 Швидкий старт

### Передумови

- macOS (Apple Silicon або Intel)
- Python 3.9+
- Node.js 16+
- Goose Desktop або Goose CLI

### Установка

1. **Встановити залежності**
```bash
./install.sh
```

2. **Налаштувати Goose** (за потреби)
```bash
/opt/homebrew/bin/goose configure
```

3. **Запустити систему**
```bash
./restart_system.sh start
```

### Доступ до системи
- **Веб-інтерфейс**: http://localhost:5002 (оновлений порт)
- **Goose Server**: http://localhost:3000  
- **Orchestrator API**: http://localhost:5101
- **Recovery Bridge**: ws://localhost:5102

### Конфігурація

Вся конфігурація системи знаходиться в файлі `config.yaml`. Система підтримує:

- Автоматичне налаштування портів
- Конфігурацію агентів та їх ролей
- TTS налаштування з підтримкою українських голосів
- Workflow параметри та таймаути

## 📁 Структура проекту

```
atlas4/
├── restart_system.sh          # 🎛️ Головний скрипт управління
├── shared-config.js            # 🔄 Єдина конфігурація для всієї системи
├── config.yaml                # ⚙️ Системна конфігурація
├── install.sh                 # 📦 Скрипт установки
├── web/                       # 🌐 Flask веб-інтерфейс
│   └── static/js/             # 📦 Модульний JavaScript
│       ├── core/              # 🔧 Основні модулі (logger, config, api-client)
│       ├── modules/           # 📱 Функціональні модулі (chat, tts)
│       ├── app-refactored.js  # 🚀 Головний додаток
│       └── _unused/           # 🗃️ Застарілі файли
├── orchestrator/              # 🎭 Node.js управління агентами (модульна архітектура)
│   ├── agents/                # 🤖 Клієнти агентів
│   ├── ai/                    # 🧠 AI модулі
│   ├── config/                # ⚙️ Конфігурації (імпорт з shared-config.js)
│   ├── utils/                 # 🛠️ Утиліти
│   └── workflow/              # 🔄 Workflow логіка
├── config/                    # ⚙️ Конфігураційні модулі
├── prompts/                   # 🧠 Промпти агентів
├── ukrainian-tts/             # 🔊 TTS система
├── docs/                      # 📚 Документація системи
├── scripts/                   # 🛠️ Допоміжні скрипти
├── logs/                      # 📝 Логування системи
└── unused_files/              # 🗃️ Архів старих файлів
```

### Ключові файли

- `restart_system.sh` - Управління всією системою
- `shared-config.js` - Єдина конфігурація для всіх компонентів
- `config.yaml` - Системна конфігурація
- `requirements.txt` - Python залежності
- `orchestrator/server.js` - Координація агентів (модульна архітектура)
- `web/atlas_server.py` - Веб-інтерфейс
- `web/static/js/app-refactored.js` - Модульний фронтенд
- `ukrainian-tts/tts_server.py` - TTS сервер

### Документація

Вся детальна документація знаходиться в папці [`docs/`](docs/):
- Архітектура системи
- Технічні специфікації  
- Звіти про рефакторинг
- Історія змін

## 📊 Моніторинг та діагностика

### Статус системи

```bash
./restart_system.sh status    # Статус всіх сервісів
./restart_system.sh diagnose  # Повна діагностика
./restart_system.sh logs      # Перегляд логів
```

### Логування

Система веде детальні логи всіх компонентів:

- `logs/orchestrator.log` - Логи оркестратора та workflow
- `logs/frontend.log` - Логи веб-інтерфейсу
- `logs/goose_web.log` - Логи Goose сервера
- `logs/tts.log` - Логи TTS системи
- `logs/recovery_bridge.log` - Логи мостового сервісу

### Команди діагностики

```bash
# Повна діагностика
./restart_system.sh diagnose

# Перевірка конфігурації Goose
./check_goose_config.sh

# Переконфігурація Goose (за потреби)
/opt/homebrew/bin/goose configure

# Очищення логів
./restart_system.sh clean
```

## 🔧 Підтримка та налагодження

### Відомі проблеми та рішення:

1. **Goose WebSocket timeout** - збільшено до 120 секунд
2. **Token limit exceeded** - автоматичне обрізання до 2000 символів  
3. **Authentication issues** - потрібна переавторизація GitHub
4. **Port conflicts** - автоматичне звільнення зайнятих портів

### Для вирішення проблем:

1. Перевірте статус системи: `./restart_system.sh status`
2. Запустіть діагностику: `./restart_system.sh diagnose` 
3. Перегляньте логи: `./restart_system.sh logs`
4. Перезапустіть систему: `./restart_system.sh restart`

## License

This project is licensed under MIT License - see LICENSE file for details.

---

*ATLAS v4.0 - Adaptive Task and Learning Assistant System with Ukrainian TTS*
