#!/bin/bash

# =============================================================================
# Goose Configuration Checker
# =============================================================================
# Перевіряє конфігурацію Goose Desktop та GitHub Copilot
# =============================================================================

set -e

# ANSI escape codes для кольорового виводу
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
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

print_header() {
    echo ""
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${WHITE}                GOOSE CONFIGURATION CHECKER                    ${CYAN}║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_header

# 1. Перевірка Goose Desktop
log_info "Перевірка Goose Desktop..."
if [ -d "/Applications/Goose.app" ]; then
    log_success "Goose Desktop встановлений"
else
    log_error "Goose Desktop не знайдено"
    echo "Встановіть через: brew install --cask block-goose"
fi

# 2. Перевірка процесів Goose
log_info "Перевірка запущених процесів Goose..."
if pgrep -f "Goose" > /dev/null; then
    log_success "Goose Desktop запущений"
    
    # Знайти порт
    goose_port=$(ps aux | grep -i goose | grep "GOOSE_PORT" | sed -n 's/.*GOOSE_PORT[":]*\([0-9]\+\).*/\1/p' | head -1)
    if [ -n "$goose_port" ]; then
        log_success "Goose працює на порту: $goose_port"
        
        # Перевірити HTTP відповідь
        if command -v curl >/dev/null 2>&1; then
            response=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$goose_port" 2>/dev/null || echo "000")
            if [ "$response" = "401" ]; then
                log_success "Goose API відповідає правильно (HTTP 401)"
            else
                log_warn "Goose API відповідає з кодом: $response"
            fi
        fi
    else
        log_warn "Не вдалося визначити порт Goose"
    fi
else
    log_error "Goose Desktop не запущений"
    echo "Запустіть через: ./start_goose_web.sh"
fi

# 3. Перевірка конфігураційного файлу
log_info "Перевірка конфігурації Goose..."
if [ -f "$HOME/.config/goose/config.yaml" ]; then
    log_success "Конфігураційний файл знайдено"
    
    # Перевірити провайдер
    if grep -q "provider: github_copilot" "$HOME/.config/goose/config.yaml"; then
        log_success "Провайдер налаштований: GitHub Copilot"
    else
        log_warn "Провайдер не налаштований або не GitHub Copilot"
    fi
    
    # Перевірити API ключ
    if grep -q "api_key:" "$HOME/.config/goose/config.yaml"; then
        log_success "GitHub токен налаштований"
    else
        log_warn "GitHub токен не знайдено в конфігурації"
    fi
else
    log_error "Конфігураційний файл не знайдено"
    echo "Створіть конфігурацію через налаштування"
fi

# 4. Перевірка GitHub CLI
log_info "Перевірка GitHub CLI..."
if command -v gh >/dev/null 2>&1; then
    log_success "GitHub CLI встановлений"
    
    # Перевірити авторизацію
    if gh auth status >/dev/null 2>&1; then
        log_success "GitHub CLI авторизований"
        active_account=$(gh auth status 2>&1 | grep "Active account: true" -B1 | head -1 | awk '{print $4}')
        if [ -n "$active_account" ]; then
            log_success "Активний акаунт: $active_account"
        fi
    else
        log_warn "GitHub CLI не авторизований"
        echo "Авторизуйтесь через: gh auth login"
    fi
else
    log_error "GitHub CLI не встановлений"
    echo "Встановіть через: brew install gh"
fi

# 5. Перевірка директорій
log_info "Перевірка робочих директорій..."
if [ -d "$HOME/.local/share/goose/sessions" ]; then
    log_success "Директорія сесій існує"
else
    log_warn "Директорія сесій не існує"
    mkdir -p "$HOME/.local/share/goose/sessions"
    log_success "Створено директорію сесій"
fi

echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║${WHITE}                        ПІДСУМОК                               ${CYAN}║${NC}"
echo -e "${CYAN}╠════════════════════════════════════════════════════════════════╣${NC}"

if pgrep -f "Goose" > /dev/null && [ -f "$HOME/.config/goose/config.yaml" ] && gh auth status >/dev/null 2>&1; then
    echo -e "${CYAN}║${GREEN} ✅ Goose Desktop готовий до роботи з GitHub Copilot          ${CYAN}║${NC}"
    echo -e "${CYAN}║${WHITE} 🚀 Можете запускати ATLAS: ./restart_system.sh start        ${CYAN}║${NC}"
else
    echo -e "${CYAN}║${YELLOW} ⚠️  Потрібно завершити налаштування Goose Desktop            ${CYAN}║${NC}"
    echo -e "${CYAN}║${WHITE} 📋 Дивіться повідомлення вище для деталей                   ${CYAN}║${NC}"
fi

echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
