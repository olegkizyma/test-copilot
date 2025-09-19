# =============================================================================
# ATLAS System Makefile
# =============================================================================
# Централізоване управління всією системою
# Використання: make [команда]
# =============================================================================

.PHONY: help install install-python install-node setup start stop restart status logs clean test

# Default command
help:
	@echo "╔════════════════════════════════════════════════════════════════╗"
	@echo "║                ATLAS SYSTEM MANAGEMENT                         ║"
	@echo "╚════════════════════════════════════════════════════════════════╝"
	@echo ""
	@echo "Available commands:"
	@echo "  make install      - Install all dependencies"
	@echo "  make setup        - Initial system setup"
	@echo "  make start        - Start all services"
	@echo "  make stop         - Stop all services"
	@echo "  make restart      - Restart all services"
	@echo "  make status       - Check system status"
	@echo "  make logs         - Follow all logs"
	@echo "  make clean        - Clean logs and temp files"
	@echo "  make test         - Run system tests"
	@echo ""
	@echo "Installation commands:"
	@echo "  make install-python  - Install Python dependencies"
	@echo "  make install-node    - Install Node.js dependencies"
	@echo "  make install-goose   - Install/Update Goose"
	@echo ""

# Complete installation
install: install-python install-node
	@echo "✅ All dependencies installed"

# Install Python dependencies
install-python:
	@echo "🐍 Installing Python dependencies..."
	@if [ ! -d "frontend_new/venv" ]; then \
		echo "Creating Python virtual environment..."; \
		python3 -m venv frontend_new/venv; \
	fi
	@. frontend_new/venv/bin/activate && pip install -q --upgrade pip
	@. frontend_new/venv/bin/activate && pip install -q -r requirements-all.txt
	@echo "✅ Python dependencies installed"

# Install Node.js dependencies
install-node:
	@echo "📦 Installing Node.js dependencies..."
	@npm install --silent
	@echo "✅ Node.js dependencies installed"

# Install/Update Goose
install-goose:
	@echo "🦆 Checking Goose installation..."
	@if [ ! -x "/Applications/Goose.app/Contents/MacOS/goose" ] && [ ! -x "$$HOME/.local/bin/goose" ]; then \
		echo "Installing Goose CLI..."; \
		cd goose && ./download_cli.sh; \
	else \
		echo "✅ Goose is already installed"; \
	fi

# Initial setup
setup: install
	@echo "🔧 Setting up ATLAS system..."
	@mkdir -p logs logs/archive
	@mkdir -p $$HOME/.local/share/goose/sessions
	@echo "✅ System setup complete"

# Start system
start:
	@./restart_system.sh start

# Stop system
stop:
	@./restart_system.sh stop

# Restart system
restart:
	@./restart_system.sh restart

# Check status
status:
	@./restart_system.sh status

# Follow logs
logs:
	@./restart_system.sh logs

# Clean logs and temp files
clean:
	@./restart_system.sh clean

# Run tests
test:
	@echo "🧪 Running system tests..."
	@. frontend_new/venv/bin/activate && python -m pytest tests/ -v
	@echo "✅ Tests completed"

# Quick start (install + start)
quick-start: setup start
	@echo "🚀 ATLAS system is ready!"
	@echo "Access the web interface at: http://localhost:5001"
