#!/bin/bash

# =============================================================================
# Goose Desktop Web Mode Starter
# =============================================================================
# Запускає Goose Desktop та налаштовує його для роботи в web режимі на порту 3000
# =============================================================================

set -e

# ANSI escape codes для кольорового виводу
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_success() {
    echo -e "${GREEN}✅${NC} $1"
}

# Перевірка чи встановлений Goose Desktop
if [ ! -d "/Applications/Goose.app" ]; then
    log_error "Goose Desktop не знайдено в /Applications/Goose.app"
    log_info "Встановіть Goose Desktop через: brew install --cask block-goose"
    exit 1
fi

# Зупинка існуючих процесів Goose
log_info "Зупинка існуючих процесів Goose..."
pkill -f "Goose" 2>/dev/null || true
sleep 2

# Очищення порту 3000
if lsof -ti:3000 > /dev/null 2>&1; then
    log_warn "Порт 3000 зайнятий, звільняємо..."
    lsof -ti:3000 | xargs kill -9 2>/dev/null || true
    sleep 1
fi

# Запуск Goose Desktop
log_info "Запуск Goose Desktop..."
open /Applications/Goose.app

# Очікування запуску
log_info "Очікування запуску Goose Desktop..."
sleep 5

# Перевірка чи запустився Goose
if ! pgrep -f "Goose" > /dev/null; then
    log_error "Goose Desktop не запустився"
    exit 1
fi

log_success "Goose Desktop запущений"

# Інструкції для користувача
echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║${NC}                     ІНСТРУКЦІЇ                                ${BLUE}║${NC}"
echo -e "${BLUE}╠════════════════════════════════════════════════════════════════╣${NC}"
echo -e "${BLUE}║${NC} 1. Відкрийте Goose Desktop (має запуститися автоматично)      ${BLUE}║${NC}"
echo -e "${BLUE}║${NC} 2. Налаштуйте GitHub Copilot або інший провайдер             ${BLUE}║${NC}"
echo -e "${BLUE}║${NC} 3. Goose Desktop має працювати на одному з портів             ${BLUE}║${NC}"
echo -e "${BLUE}║${NC} 4. Запустіть ATLAS: ./restart_system.sh start                ${BLUE}║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Перевірка портів
log_info "Перевірка активних портів Goose..."
for port in 3000 49299 51958 65459 8080 8000; do
    if lsof -ti:$port > /dev/null 2>&1; then
        log_success "Знайдено сервіс на порту $port"
        if command -v curl >/dev/null 2>&1; then
            response=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$port" 2>/dev/null || echo "000")
            if [ "$response" != "000" ]; then
                log_success "HTTP відповідь на порту $port: $response"
                if [ "$response" = "401" ]; then
                    log_success "✅ Goose API готовий до роботи на порту $port"
                fi
            fi
        fi
    fi
done

echo ""
log_info "Goose Desktop готовий до використання!"
log_info "Тепер можете запустити ATLAS через ./restart_system.sh start"
