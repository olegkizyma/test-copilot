# 🦆 Інструкції з налаштування Goose Desktop для ATLAS

## Поточна проблема
ATLAS система успішно виявляє Goose Desktop на порту 51958, але отримує помилку 401 (Unauthorized) при спробі підключення. Це означає, що Goose Desktop потребує додаткового налаштування.

## Кроки для вирішення

### 1. Відкрийте Goose Desktop веб-інтерфейс
```bash
open http://localhost:51958
```

### 2. Налаштуйте GitHub Copilot
1. У веб-інтерфейсі Goose знайдіть розділ "Settings" або "Configuration"
2. Оберіть провайдер "GitHub Copilot"
3. Введіть ваш GitHub токен: `YOUR_GITHUB_TOKEN_HERE`
4. Оберіть модель `gpt-4o`
5. Збережіть налаштування

### 3. Перевірте API доступ
Після налаштування перевірте чи працює API:
```bash
curl -H "Authorization: Bearer YOUR_GITHUB_TOKEN_HERE" \
     -H "Content-Type: application/json" \
     -X POST \
     -d '{"message":"test"}' \
     http://localhost:51958/api/chat
```

### 4. Альтернативний спосіб - через CLI
Якщо веб-інтерфейс не працює, спробуйте через CLI:
```bash
# Встановіть CLI версію Goose
pip3 install goose-ai

# Налаштуйте провайдер
goose configure

# Оберіть GitHub Copilot та введіть токен
```

## Поточний статус системи

✅ **Що працює:**
- Goose Desktop встановлений і запущений
- ATLAS система виявляє Goose на порту 51958
- GitHub токен налаштований в конфігурації
- Всі інші сервіси ATLAS працюють

❌ **Що потребує налаштування:**
- Авторизація API в Goose Desktop
- Підключення GitHub Copilot через веб-інтерфейс

## Команди для діагностики

### Перевірка статусу системи
```bash
./restart_system.sh status
```

### Перевірка конфігурації Goose
```bash
./check_goose_config.sh
```

### Перевірка логів
```bash
tail -f logs/orchestrator.log
```

### Тестування підключення
```bash
curl -X POST -H "Content-Type: application/json" \
     -d '{"message":"тест"}' \
     http://localhost:5101/chat/stream
```

## Очікуваний результат

Після правильного налаштування ви повинні побачити:
```
{"type":"agent_message","data":{"agent":"atlas","content":"Привіт! Я Atlas..."}}
```

Замість:
```
{"type":"workflow_error","data":{"error":"Atlas не може відповісти"}}
```

## Контакти для підтримки

Якщо проблема не вирішується:
1. Перевірте чи правильно налаштований GitHub Copilot в Goose Desktop
2. Переконайтеся що токен `YOUR_GITHUB_TOKEN_HERE` активний
3. Спробуйте перезапустити Goose Desktop: `pkill -f Goose && open /Applications/Goose.app`

---

**Система ATLAS готова до роботи, потрібно лише завершити налаштування Goose Desktop! 🚀**
