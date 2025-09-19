#!/bin/bash

# =============================================================================
# ATLAS Universal System Management Script
# =============================================================================
# Єдиний скрипт для управління всім стеком ATLAS
# Підтримує запуск, зупинку, рестарт та статус системи
# Підключається до зовнішнього Goose Desktop (не запускає його)
# =============================================================================

set -e

# ANSI escape codes для кольорового виводу
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m' # No Color

# =============================================================================
# Конфігурація системи
# =============================================================================
REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
LOGS_DIR="$REPO_ROOT/logs"
ARCHIVE_DIR="$LOGS_DIR/archive"

# Goose Configuration (External service - managed by user)
GOOSE_SERVER_PORT="${GOOSE_SERVER_PORT:-3000}"

# TTS Configuration
REAL_TTS_MODE="${REAL_TTS_MODE:-true}"
TTS_DEVICE="${TTS_DEVICE:-mps}"
TTS_PORT="${TTS_PORT:-3001}"

# Service Ports
FRONTEND_PORT=5001
ORCHESTRATOR_PORT=5101
RECOVERY_PORT=5102
FALLBACK_PORT=3010

# Features
ENABLE_LOCAL_FALLBACK="${ENABLE_LOCAL_FALLBACK:-false}"
FORCE_FREE_PORTS="${FORCE_FREE_PORTS:-false}"

# Goose Storage
export GOOSE_DISABLE_KEYRING="${GOOSE_DISABLE_KEYRING:-1}"

# =============================================================================
# Utility Functions
# =============================================================================

print_header() {
    echo ""
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${WHITE}               ATLAS INTELLIGENT SYSTEM MANAGER                ${CYAN}║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

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

log_progress() {
    echo -e "${BLUE}⚡${NC} $1"
}

# Create necessary directories
init_directories() {
    mkdir -p "$LOGS_DIR"
    mkdir -p "$ARCHIVE_DIR"
    mkdir -p "$HOME/.local/share/goose/sessions"
}

# Check if port is in use
check_port() {
    local port=$1
    if command -v lsof >/dev/null 2>&1; then
        if lsof -ti:$port > /dev/null 2>&1; then
            return 1
        fi
    elif command -v netstat >/dev/null 2>&1; then
        if netstat -tuln 2>/dev/null | grep -q ":$port "; then
            return 1
        fi
    fi
    return 0
}

# Free port if requested
free_port() {
    local port=$1
    local name=$2
    
    if [ "$FORCE_FREE_PORTS" = "true" ]; then
        log_warn "Freeing port $port ($name)..."
        local pids=$(lsof -ti:$port 2>/dev/null || true)
        if [ -n "$pids" ]; then
            kill $pids 2>/dev/null || true
            sleep 1
            pids=$(lsof -ti:$port 2>/dev/null || true)
            if [ -n "$pids" ]; then
                kill -9 $pids 2>/dev/null || true
            fi
        fi
        if check_port "$port"; then
            log_success "Port $port freed"
            return 0
        else
            log_error "Failed to free port $port"
            return 1
        fi
    fi
    return 1
}

# Stop service by PID file
stop_service() {
    local name=$1
    local pidfile=$2
    local signal=${3:-TERM}
    
    if [ -f "$pidfile" ]; then
        local pid=$(cat "$pidfile")
        if ps -p $pid > /dev/null 2>&1; then
            log_info "Stopping $name (PID: $pid)..."
            kill -$signal $pid 2>/dev/null || true
            
            local count=0
            while ps -p $pid > /dev/null 2>&1 && [ $count -lt 10 ]; do
                sleep 1
                count=$((count + 1))
            done
            
            if ps -p $pid > /dev/null 2>&1; then
                log_warn "Force killing $name..."
                kill -KILL $pid 2>/dev/null || true
                sleep 1
            fi
            
            log_success "$name stopped"
        else
            log_warn "$name was not running (stale PID file)"
        fi
        rm -f "$pidfile"
    fi
}

# Note: Goose executable finding and config setup functions removed
# Goose Desktop is now managed externally by the user

# =============================================================================
# Service Management Functions
# =============================================================================

detect_goose_port() {
    # Try to find Goose port from running processes
    local goose_port=""
    
    # Look for GOOSE_PORT in process environment
    if command -v ps >/dev/null 2>&1; then
        goose_port=$(ps aux | grep -i goose | grep "GOOSE_PORT" | sed -n 's/.*GOOSE_PORT[":]*\([0-9]\+\).*/\1/p' | head -1)
    fi
    
    # If not found, try common ports
    if [ -z "$goose_port" ]; then
        for port in 3000 49299 51958 53769 65459 8080 8000; do
            if ! check_port "$port"; then
                if command -v curl >/dev/null 2>&1; then
                    local response=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$port" 2>/dev/null || echo "000")
                    if [ "$response" = "401" ] || [ "$response" = "200" ] || [ "$response" = "404" ]; then
                        goose_port=$port
                        break
                    fi
                fi
            fi
        done
    fi
    
    echo "$goose_port"
}

start_goose_web_server() {
    log_progress "Starting Goose Web Server on port $GOOSE_SERVER_PORT..."
    
    # Check if port is available
    if ! check_port "$GOOSE_SERVER_PORT"; then
        if [ "$FORCE_FREE_PORTS" = "true" ]; then
            free_port "$GOOSE_SERVER_PORT" "Goose Web Server" || return 1
        else
            log_warn "Port $GOOSE_SERVER_PORT is busy. Checking if it's already Goose..."
            local response=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$GOOSE_SERVER_PORT" 2>/dev/null || echo "000")
            if [ "$response" = "200" ]; then
                log_success "Goose already running on port $GOOSE_SERVER_PORT"
                return 0
            else
                log_error "Port $GOOSE_SERVER_PORT is busy with another service"
                return 1
            fi
        fi
    fi
    
    # Check if Goose CLI is available
    local goose_bin="/opt/homebrew/bin/goose"
    if [ ! -x "$goose_bin" ]; then
        log_error "Goose CLI not found at $goose_bin"
        log_info "Install with: brew install block-goose-cli"
        return 1
    fi
    
    # Start Goose web server
    (
        cd "$REPO_ROOT"
        "$goose_bin" web --port "$GOOSE_SERVER_PORT" > "$LOGS_DIR/goose_web.log" 2>&1 &
        echo $! > "$LOGS_DIR/goose_web.pid"
    )
    
    # Wait for startup
    sleep 3
    
    # Verify it started
    if [ -f "$LOGS_DIR/goose_web.pid" ] && ps -p $(cat "$LOGS_DIR/goose_web.pid") > /dev/null 2>&1; then
        local response=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$GOOSE_SERVER_PORT" 2>/dev/null || echo "000")
        if [ "$response" = "200" ]; then
            log_success "Goose Web Server started (PID: $(cat "$LOGS_DIR/goose_web.pid"))"
            return 0
        else
            log_error "Goose Web Server started but not responding properly"
            return 1
        fi
    else
        log_error "Failed to start Goose Web Server"
        return 1
    fi
}

start_tts_service() {
    log_progress "Starting TTS Service on port $TTS_PORT..."
    
    if ! check_port "$TTS_PORT"; then
        log_warn "Port $TTS_PORT is busy. Skipping TTS."
        return 0
    fi
    
    if [ "$REAL_TTS_MODE" = "true" ]; then
        (
            cd "$REPO_ROOT/ukrainian-tts"
            if [ -f ".venv/bin/activate" ]; then
                source .venv/bin/activate
                log_info "Using TTS virtual environment: .venv"
            elif [ -f "venv/bin/activate" ]; then
                source venv/bin/activate
                log_info "Using TTS virtual environment: venv"
            else
                log_warn "No TTS virtual environment found, using system Python"
            fi
            python3 tts_server.py --host 127.0.0.1 --port "$TTS_PORT" --device "$TTS_DEVICE" > "$LOGS_DIR/tts_real.log" 2>&1 &
            echo $! > "$LOGS_DIR/tts.pid"
        )
        log_success "Real TTS started"
    else
        (
            cd "$REPO_ROOT/frontend_new"
            if [ -f "venv/bin/activate" ]; then
                source venv/bin/activate
            fi
            TTS_PORT="$TTS_PORT" python3 ukrainian_tts_server.py > "$LOGS_DIR/tts.log" 2>&1 &
            echo $! > "$LOGS_DIR/tts.pid"
        )
        log_success "Mock TTS started"
    fi
}

start_orchestrator() {
    log_progress "Starting Node.js Orchestrator on port $ORCHESTRATOR_PORT..."
    
    if ! check_port "$ORCHESTRATOR_PORT"; then
        if ! free_port "$ORCHESTRATOR_PORT" "Orchestrator"; then
            log_error "Cannot start Orchestrator - port $ORCHESTRATOR_PORT is busy"
            return 1
        fi
    fi
    
    (
        cd "$REPO_ROOT/frontend_new/orchestrator"
        if [ ! -d "node_modules" ]; then
            log_info "Installing Node.js dependencies..."
            npm install
        fi
        
        export FALLBACK_API_BASE="http://127.0.0.1:$FALLBACK_PORT/v1"
        export ORCH_SSE_FOR_GITHUB_COPILOT="${ORCH_SSE_FOR_GITHUB_COPILOT:-false}"
        export ORCH_FORCE_GOOSE_REPLY="${ORCH_FORCE_GOOSE_REPLY:-false}"
        
        node server.js > "$LOGS_DIR/orchestrator.log" 2>&1 &
        echo $! > "$LOGS_DIR/orchestrator.pid"
    )
    
    log_success "Orchestrator started (PID: $(cat "$LOGS_DIR/orchestrator.pid"))"
}

start_frontend() {
    log_progress "Starting Python Frontend on port $FRONTEND_PORT..."
    
    if ! check_port "$FRONTEND_PORT"; then
        if ! free_port "$FRONTEND_PORT" "Frontend"; then
            log_error "Cannot start Frontend - port $FRONTEND_PORT is busy"
            return 1
        fi
    fi
    
    (
        cd "$REPO_ROOT/frontend_new"
        if [ -f "venv/bin/activate" ]; then
            source venv/bin/activate
        else
            log_info "Creating Python virtual environment..."
            python3 -m venv venv
            source venv/bin/activate
            pip install -r requirements.txt
        fi
        
        export ATLAS_TTS_URL="${ATLAS_TTS_URL:-http://127.0.0.1:$TTS_PORT/tts}"
        python3 app/atlas_server.py > "$LOGS_DIR/frontend.log" 2>&1 &
        echo $! > "$LOGS_DIR/frontend.pid"
    )
    
    log_success "Frontend started (PID: $(cat "$LOGS_DIR/frontend.pid"))"
}

start_recovery_bridge() {
    log_progress "Starting Recovery Bridge on port $RECOVERY_PORT..."
    
    if ! check_port "$RECOVERY_PORT"; then
        free_port "$RECOVERY_PORT" "Recovery Bridge" || true
    fi
    
    (
        cd "$REPO_ROOT/frontend_new"
        if [ -f "venv/bin/activate" ]; then
            source venv/bin/activate
        fi
        python3 config/recovery_bridge.py > "$LOGS_DIR/recovery.log" 2>&1 &
        echo $! > "$LOGS_DIR/recovery.pid"
    )
    
    log_success "Recovery Bridge started (PID: $(cat "$LOGS_DIR/recovery.pid"))"
}

start_fallback_llm() {
    if [ "$ENABLE_LOCAL_FALLBACK" != "true" ]; then
        log_info "Local Fallback LLM is disabled"
        return 0
    fi
    
    log_progress "Starting Fallback LLM on port $FALLBACK_PORT..."
    
    if ! check_port "$FALLBACK_PORT"; then
        log_info "Port $FALLBACK_PORT already in use (external provider detected)"
        return 0
    fi
    
    (
        cd "$REPO_ROOT/fallback_llm"
        if [ ! -d "node_modules" ]; then
            log_info "Installing Fallback LLM dependencies..."
            npm install
        fi
        node server.js > "$LOGS_DIR/fallback.log" 2>&1 &
        echo $! > "$LOGS_DIR/fallback.pid"
    )
    
    log_success "Fallback LLM started (PID: $(cat "$LOGS_DIR/fallback.pid"))"
}

# =============================================================================
# Main Commands
# =============================================================================

cmd_start() {
    print_header
    log_info "Starting ATLAS System..."
    
    init_directories
    
    # Start Goose Web Server
    start_goose_web_server
    
    # Start all other services in order
    start_tts_service
    start_orchestrator
    start_frontend
    start_recovery_bridge
    start_fallback_llm
    
    # Wait for services to initialize
    log_info "Waiting for services to initialize..."
    sleep 5
    
    # Check health
    cmd_status
    
    echo ""
    log_success "ATLAS System Started Successfully!"
    echo ""
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${WHITE}                     ACCESS POINTS                             ${CYAN}║${NC}"
    echo -e "${CYAN}╠════════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${CYAN}║${WHITE} 🌐 Web Interface:     http://localhost:$FRONTEND_PORT              ${CYAN}║${NC}"
    echo -e "${CYAN}║${WHITE} 🦆 Goose Server:      http://localhost:$GOOSE_SERVER_PORT              ${CYAN}║${NC}"
    echo -e "${CYAN}║${WHITE} 🎭 Orchestrator API:  http://localhost:$ORCHESTRATOR_PORT              ${CYAN}║${NC}"
    echo -e "${CYAN}║${WHITE} 🔧 Recovery Bridge:   ws://localhost:$RECOVERY_PORT               ${CYAN}║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

cmd_stop() {
    print_header
    log_info "Stopping ATLAS System..."
    
    # Stop all services
    stop_service "Recovery Bridge" "$LOGS_DIR/recovery.pid"
    stop_service "Frontend" "$LOGS_DIR/frontend.pid"
    stop_service "Orchestrator" "$LOGS_DIR/orchestrator.pid"
    stop_service "Goose Web Server" "$LOGS_DIR/goose_web.pid"
    stop_service "TTS Service" "$LOGS_DIR/tts.pid"
    stop_service "Fallback LLM" "$LOGS_DIR/fallback.pid"
    
    # Clean up any remaining processes on ports (except Goose port)
    for port in $FRONTEND_PORT $ORCHESTRATOR_PORT $RECOVERY_PORT $TTS_PORT $FALLBACK_PORT; do
        if ! check_port "$port"; then
            local pid=$(lsof -ti:$port 2>/dev/null || true)
            if [ -n "$pid" ]; then
                log_warn "Cleaning up process on port $port (PID: $pid)"
                kill -9 $pid 2>/dev/null || true
            fi
        fi
    done
    
    # Note about Goose port
    if ! check_port "$GOOSE_SERVER_PORT"; then
        log_info "Goose Desktop is still running on port $GOOSE_SERVER_PORT (not touched)"
    fi
    
    # Clean up PID files
    find "$LOGS_DIR" -name "*.pid" -delete 2>/dev/null || true
    
    log_success "ATLAS System Stopped"
}

cmd_restart() {
    cmd_stop
    echo ""
    log_info "Waiting 5 seconds before restart..."
    sleep 5
    echo ""
    cmd_start
}

cmd_status() {
    echo ""
    echo -e "${CYAN}System Status:${NC}"
    echo "─────────────────────────────────────────"
    
    check_service() {
        local name=$1
        local pidfile=$2
        local port=$3
        
        printf "%-20s " "$name:"
        
        if [ -f "$pidfile" ] && ps -p $(cat "$pidfile") > /dev/null 2>&1; then
            echo -e "${GREEN}● RUNNING${NC} (PID: $(cat "$pidfile"), Port: $port)"
        elif check_port "$port"; then
            echo -e "${YELLOW}● PORT IN USE${NC} (Port: $port, external process)"
        else
            echo -e "${RED}● STOPPED${NC}"
        fi
    }
    
    check_service "Goose Web Server" "$LOGS_DIR/goose_web.pid" "$GOOSE_SERVER_PORT"
    check_service "Frontend" "$LOGS_DIR/frontend.pid" "$FRONTEND_PORT"
    check_service "Orchestrator" "$LOGS_DIR/orchestrator.pid" "$ORCHESTRATOR_PORT"
    check_service "Recovery Bridge" "$LOGS_DIR/recovery.pid" "$RECOVERY_PORT"
    check_service "TTS Service" "$LOGS_DIR/tts.pid" "$TTS_PORT"
    
    if [ "$ENABLE_LOCAL_FALLBACK" = "true" ]; then
        check_service "Fallback LLM" "$LOGS_DIR/fallback.pid" "$FALLBACK_PORT"
    fi
}

cmd_logs() {
    local service=$1
    
    if [ -z "$service" ]; then
        log_info "Following all logs... (Press Ctrl+C to stop)"
        tail -f "$LOGS_DIR"/*.log
    else
        case $service in
            goose)
                tail -f "$LOGS_DIR/goose_server.log"
                ;;
            frontend)
                tail -f "$LOGS_DIR/frontend.log"
                ;;
            orchestrator)
                tail -f "$LOGS_DIR/orchestrator.log"
                ;;
            recovery)
                tail -f "$LOGS_DIR/recovery.log"
                ;;
            tts)
                tail -f "$LOGS_DIR/tts.log"
                ;;
            fallback)
                tail -f "$LOGS_DIR/fallback.log"
                ;;
            *)
                log_error "Unknown service: $service"
                echo "Available services: goose, frontend, orchestrator, recovery, tts, fallback"
                exit 1
                ;;
        esac
    fi
}

cmd_clean() {
    log_info "Cleaning logs and temporary files..."
    
    # Archive current logs
    if [ "$(ls -A "$LOGS_DIR"/*.log 2>/dev/null | wc -l)" -gt 0 ]; then
        local ts=$(date +%Y%m%d_%H%M%S)
        tar -czf "$ARCHIVE_DIR/atlas_logs_$ts.tar.gz" -C "$LOGS_DIR" *.log 2>/dev/null || true
        log_success "Logs archived to $ARCHIVE_DIR/atlas_logs_$ts.tar.gz"
    fi
    
    # Remove log files
    rm -f "$LOGS_DIR"/*.log
    rm -f "$LOGS_DIR"/*.pid
    
    log_success "Cleanup completed"
}

cmd_help() {
    print_header
    echo "Usage: $0 {start|stop|restart|status|logs|clean|help}"
    echo ""
    echo "Commands:"
    echo "  start    - Start all ATLAS services"
    echo "  stop     - Stop all ATLAS services"
    echo "  restart  - Restart all ATLAS services"
    echo "  status   - Show status of all services"
    echo "  logs     - Follow logs (optionally specify service)"
    echo "  clean    - Archive and clean log files"
    echo "  help     - Show this help message"
    echo ""
    echo "Environment Variables:"
    echo "  GOOSE_SERVER_PORT     - Goose server port to connect to (default: 3000)"
    echo "  REAL_TTS_MODE         - Use real TTS instead of mock (default: true)"
    echo "  TTS_DEVICE            - TTS device (default: mps for macOS)"
    echo "  ENABLE_LOCAL_FALLBACK - Enable local fallback LLM (default: false)"
    echo "  FORCE_FREE_PORTS      - Force free busy ports (default: false)"
    echo ""
    echo "Important Notes:"
    echo "  • Goose Desktop must be started manually by the user"
    echo "  • Make sure Goose Desktop is running on port $GOOSE_SERVER_PORT"
    echo "  • This script only connects to existing Goose instance"
    echo ""
    echo "Examples:"
    echo "  $0 start                    # Start system"
    echo "  $0 logs orchestrator        # Follow orchestrator logs"
    echo "  FORCE_FREE_PORTS=true $0 start  # Start and force free ports"
    echo ""
}

# =============================================================================
# Main Entry Point
# =============================================================================

case "${1:-help}" in
    start)
        cmd_start
        ;;
    stop)
        cmd_stop
        ;;
    restart)
        cmd_restart
        ;;
    status)
        cmd_status
        ;;
    logs)
        cmd_logs "$2"
        ;;
    clean)
        cmd_clean
        ;;
    help|--help|-h)
        cmd_help
        ;;
    *)
        log_error "Unknown command: $1"
        cmd_help
        exit 1
        ;;
esac
