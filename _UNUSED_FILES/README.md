# Невикористовувані файли ATLAS

Ця папка містить файли та директорії, які були видалені з основної структури проекту ATLAS через їх неактивне використання в поточній системі.

## Переміщені файли та папки:

### 📁 Директорії:
- `frontend_new copy/` - Дублююча папка frontend
- `DOCS/` - Порожня папка документації
- `goose_workspace/` - Порожня робоча папка Goose
- `snake_game/` - Невикористована гра
- `config/` - Порожня папка конфігурації
- `Users/` - Помилково створена папка в agent_prompts

### 📄 Файли:
- `agent_prompts.zip` - Архів промптів (дублікат)
- `example.txt` - Тестовий файл
- `install_goose_ai.sh` - Невикористаний скрипт установки
- `test_goose_connection.js` - Тестовий файл підключення до Goose
- `test_goose_endpoints.sh` - Тестовий файл API endpoints
- `test_workflow_logic.js` - Тестовий файл логіки workflow
- `test_tts.wav` - Тестовий аудіо файл
- `tts_log.txt` - Старий лог файл TTS

### 📖 Документаційні файли (замінені новою архітектурою):
- `ATLAS_ANALYSIS.md` - Замінено на `ATLAS_SYSTEM_ARCHITECTURE.md`
- `MIGRATION_PLAN.md` - Застарілий план міграції
- `GOOSE_SETUP_INSTRUCTIONS.md` - Старі інструкції
- `STARTUP_GUIDE.md` - Замінено оновленим README.md
- `TTS_AND_AGENTS_FIXES.md` - Застарілі виправлення
- `WORKFLOW_STAGES.md` - Замінено на workflow_config.js

## ✅ Активні файли (залишились в основній папці):

### Основні файли управління:
- `restart_system.sh` - Головний скрипт управління ✅
- `Makefile` - Команди збірки ✅
- `README.md` - Основна документація ✅
- `TECHNICAL_SPECIFICATION.md` - Технічні вимоги ✅
- `ATLAS_SYSTEM_ARCHITECTURE.md` - Нова повна архітектура ✅

### Файли конфігурації:
- `package.json` / `package-lock.json` - Node.js залежності ✅
- `requirements.txt` / `requirements-all.txt` - Python залежності ✅
- `config.yaml` - Головна конфігурація системи ✅

### Скрипти:
- `install.sh` - Скрипт установки системи ✅
- `check_goose_config.sh` - Перевірка Goose конфігурації ✅
- `start_goose_web.sh` - Запуск Goose веб-сервера ✅

### Основні директорії:
- `agent_prompts/` - Промпти агентів ✅
- `frontend_new/` - Веб-інтерфейс та оркестратор ✅
- `ukrainian-tts/` - TTS система ✅
- `fallback_llm/` - Резервний LLM ✅
- `scripts/` - Допоміжні скрипти ✅
- `logs/` - Логування системи ✅

## 🔄 Дії з відновлення:

Якщо потрібно відновити будь-який файл:
```bash
# Повернути файл назад в корінь
mv _UNUSED_FILES/filename.ext ./

# Повернути всю папку
mv _UNUSED_FILES/dirname/ ./
```

## 📊 Статистика очищення:

- **Видалено файлів**: 8
- **Видалено папок**: 6  
- **Видалено документів**: 6
- **Звільнено місця**: ~500MB (через видалення дублікату frontend_new copy)

---

*Створено системою ATLAS v4.0 - 2025-01-20*
