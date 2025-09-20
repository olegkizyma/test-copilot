# ATLAS - Технічна Специфікація v4.0

## Системні вимоги

### Операційна система
- **macOS** (Apple Silicon або Intel)
- **Python 3.9+**
- **Node.js 16+**
- **npm** (включено з Node.js)

### Залежності
- **Goose CLI/Desktop** - AI движок для агентів
- **GitHub Copilot** - базова модель для Goose
- **Flask** - веб-фреймворк для інтерфейсу
- **Express.js** - API сервер для оркестратора

## Архітектура портів

### Основні сервіси
- **Port 3000**: Goose Web Server (AI Backend Engine)
- **Port 3001**: TTS Server (Ukrainian Text-to-Speech)
- **Port 5001**: Web Interface (Flask Frontend)
- **Port 5101**: Orchestrator Server (Agent Management)
- **Port 5102**: Recovery Bridge (System Recovery)

### Fallback сервіси
- **Port 8080**: Fallback LLM Server (за потреби)

## Структура даних

### Workflow етапи
1. **Stage 1**: ATLAS - Початкова обробка
2. **Stage 2**: TETYANA - Виконання завдання
3. **Stage 3**: ATLAS - Уточнення (за потреби)
4. **Stage 4**: TETYANA - Повторне виконання
5. **Stage 5**: GRISHA - Діагностика
6. **Stage 6**: ATLAS - Корекція завдання
7. **Stage 7**: GRISHA - Верифікація результатів
8. **Stage 8**: SYSTEM - Завершення workflow
9. **Stage 9**: ATLAS - Новий цикл (за потреби)

### Ролі агентів
- **ATLAS** (Coordinator) - Формалізація, координація, уточнення
- **TETYANA** (Executor) - Виконання завдань, використання інструментів
- **GRISHA** (Verificator) - Перевірка результатів, контроль якості

## Конфігурація

### Основні файли
- `config.yaml` - Головна конфігурація системи
- `orchestrator/workflow/stages.js` - Конфігурація workflow
- `web/requirements.txt` - Python залежності
- `orchestrator/package.json` - Node.js залежності

### Змінні середовища
```bash
# Goose конфігурація
GOOSE_DESKTOP_PATH=/opt/homebrew/bin/goose
GOOSE_SERVER_PORT=3000

# TTS конфігурація
TTS_PORT=3001
TTS_DEVICE=mps  # для Apple Silicon

# Веб-інтерфейс
FRONTEND_PORT=5001

# Оркестратор
ORCHESTRATOR_PORT=5101

# Recovery Bridge
RECOVERY_PORT=5102
```

## Безпека та обмеження

### API обмеження
- **Token limit**: 4000 символів для повідомлень
- **WebSocket timeout**: 120 секунд
- **Retry mechanism**: 3 спроби з затримкою 1 секунда

### Tools конфігурація
- **ATLAS**: enableTools: false (тільки текстові відповіді)
- **TETYANA**: enableTools: true (виконання завдань)
- **GRISHA**: enableTools: true (верифікація результатів)

## Логування

### Файли логів
- `logs/orchestrator.log` - Логи оркестратора та workflow
- `logs/frontend.log` - Логи веб-інтерфейсу
- `logs/goose_web.log` - Логи Goose сервера
- `logs/tts.log` - Логи TTS системи
- `logs/recovery_bridge.log` - Логи мостового сервісу

### Рівні логування
- **INFO** - Загальна інформація
- **WARN** - Попередження
- **ERROR** - Помилки

## Продуктивність

### Оптимізації
- **Унікальні сесії** для кожного виклику агента
- **Текстове обрізання** до 4000 символів
- **WebSocket fallback** при HTTP помилках
- **Автоматичне звільнення портів**

### Моніторинг
- Перевірка статусу всіх сервісів
- Діагностика конфігурації Goose
- Автоматичне відновлення після збоїв

---

*Документ створено автоматично системою ATLAS v4.0*
*Останнє оновлення: 2025-09-20*
