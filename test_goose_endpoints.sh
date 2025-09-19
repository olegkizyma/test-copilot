#!/bin/bash

# =============================================================================
# Goose API Endpoints Tester
# =============================================================================
# Тестує різні API endpoints Goose Desktop для знаходження робочого
# =============================================================================

set -e

# ANSI escape codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

GOOSE_PORT=51958
GITHUB_TOKEN="YOUR_GITHUB_TOKEN_HERE"

echo -e "${CYAN}🦆 Тестування Goose Desktop API Endpoints${NC}"
echo -e "${CYAN}Порт: ${GOOSE_PORT}${NC}"
echo ""

# Функція тестування endpoint
test_endpoint() {
    local method=$1
    local endpoint=$2
    local data=$3
    local description=$4
    
    echo -e "${BLUE}Тестування: ${description}${NC}"
    echo -e "  ${method} http://localhost:${GOOSE_PORT}${endpoint}"
    
    if [ -n "$data" ]; then
        echo -e "  Дані: ${data}"
    fi
    
    # Тест без авторизації
    echo -e "${YELLOW}  Без авторизації:${NC}"
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "HTTP_%{http_code}" "http://localhost:${GOOSE_PORT}${endpoint}" 2>/dev/null || echo "HTTP_000")
    else
        response=$(curl -s -w "HTTP_%{http_code}" -X "$method" -H "Content-Type: application/json" -d "$data" "http://localhost:${GOOSE_PORT}${endpoint}" 2>/dev/null || echo "HTTP_000")
    fi
    
    status_code=$(echo "$response" | grep -o "HTTP_[0-9]*" | cut -d_ -f2)
    content=$(echo "$response" | sed 's/HTTP_[0-9]*$//')
    
    if [ "$status_code" = "200" ]; then
        echo -e "    ${GREEN}✅ ${status_code}${NC} - ${content:0:100}..."
    elif [ "$status_code" = "401" ]; then
        echo -e "    ${YELLOW}🔒 ${status_code}${NC} - Потребує авторизації"
    elif [ "$status_code" = "404" ]; then
        echo -e "    ${RED}❌ ${status_code}${NC} - Endpoint не знайдено"
    else
        echo -e "    ${RED}❌ ${status_code}${NC} - ${content:0:50}..."
    fi
    
    # Тест з авторизацією
    echo -e "${YELLOW}  З GitHub токеном:${NC}"
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "HTTP_%{http_code}" -H "Authorization: Bearer $GITHUB_TOKEN" "http://localhost:${GOOSE_PORT}${endpoint}" 2>/dev/null || echo "HTTP_000")
    else
        response=$(curl -s -w "HTTP_%{http_code}" -X "$method" -H "Authorization: Bearer $GITHUB_TOKEN" -H "Content-Type: application/json" -d "$data" "http://localhost:${GOOSE_PORT}${endpoint}" 2>/dev/null || echo "HTTP_000")
    fi
    
    status_code=$(echo "$response" | grep -o "HTTP_[0-9]*" | cut -d_ -f2)
    content=$(echo "$response" | sed 's/HTTP_[0-9]*$//')
    
    if [ "$status_code" = "200" ]; then
        echo -e "    ${GREEN}✅ ${status_code}${NC} - ${content:0:100}..."
    elif [ "$status_code" = "401" ]; then
        echo -e "    ${YELLOW}🔒 ${status_code}${NC} - Авторизація не працює"
    elif [ "$status_code" = "404" ]; then
        echo -e "    ${RED}❌ ${status_code}${NC} - Endpoint не знайдено"
    else
        echo -e "    ${RED}❌ ${status_code}${NC} - ${content:0:50}..."
    fi
    
    echo ""
}

# Тестуємо різні endpoints
test_endpoint "GET" "/" "Головна сторінка"
test_endpoint "GET" "/health" "Health check"
test_endpoint "GET" "/api" "API info"
test_endpoint "GET" "/api/health" "API health"
test_endpoint "POST" "/api/chat" '{"message":"test"}' "Chat API"
test_endpoint "POST" "/api/v1/chat" '{"message":"test"}' "Chat API v1"
test_endpoint "POST" "/chat" '{"message":"test"}' "Direct chat"
test_endpoint "POST" "/v1/chat/completions" '{"model":"gpt-4o","messages":[{"role":"user","content":"test"}]}' "OpenAI compatible API"

echo -e "${CYAN}🔍 Додаткова діагностика:${NC}"

# Перевірка WebSocket endpoints
echo -e "${BLUE}WebSocket endpoints:${NC}"
echo "  ws://localhost:${GOOSE_PORT}/ws"
echo "  ws://localhost:${GOOSE_PORT}/api/ws"

# Перевірка процесів Goose
echo -e "${BLUE}Goose процеси:${NC}"
ps aux | grep -i goose | grep -v grep | while read line; do
    echo "  $line"
done

echo ""
echo -e "${CYAN}💡 Рекомендації:${NC}"
echo "1. Якщо всі endpoints повертають 401 - налаштуйте Goose через веб-інтерфейс"
echo "2. Відкрийте http://localhost:${GOOSE_PORT} в браузері"
echo "3. Налаштуйте GitHub Copilot в Settings"
echo "4. Перезапустіть ATLAS після налаштування"
