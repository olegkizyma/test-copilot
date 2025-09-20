#!/bin/bash

# =============================================================================
# ATLAS Quick Installation Script
# =============================================================================
# Швидка установка всіх залежностей системи
# =============================================================================

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║               ATLAS SYSTEM INSTALLATION                        ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Check for required tools
echo "🔍 Checking system requirements..."

check_command() {
    if command -v $1 >/dev/null 2>&1; then
        echo "✅ $1 is installed"
        return 0
    else
        echo "❌ $1 is not installed"
        return 1
    fi
}

errors=0
check_command python3 || errors=$((errors + 1))
check_command node || errors=$((errors + 1))
check_command npm || errors=$((errors + 1))

if [ $errors -gt 0 ]; then
    echo ""
    echo "❌ Missing system requirements. Please install:"
    [ ! -x "$(command -v python3)" ] && echo "  - Python 3.9+"
    [ ! -x "$(command -v node)" ] && echo "  - Node.js 16+"
    [ ! -x "$(command -v npm)" ] && echo "  - npm"
    exit 1
fi

echo ""
echo "📦 Installing Python dependencies..."

# Create virtual environment for web interface
if [ ! -d "web/venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv web/venv
fi

# Activate and install Python packages
source web/venv/bin/activate
pip install -q --upgrade pip
pip install -q -r requirements-all.txt
echo "✅ Python dependencies installed"

# Create virtual environment for TTS if needed
if [ -d "ukrainian-tts" ]; then
    echo "📦 Setting up Ukrainian TTS environment..."
    if [ ! -d "ukrainian-tts/.venv" ]; then
        python3 -m venv ukrainian-tts/.venv
    fi
    source ukrainian-tts/.venv/bin/activate
    pip install -q --upgrade pip
    
    # Install Ukrainian TTS from GitHub
    echo "Installing Ukrainian TTS package from GitHub..."
    pip install -q git+https://github.com/robinhad/ukrainian-tts.git
    
    # Install additional dependencies if requirements file exists
    if [ -f "ukrainian-tts/requirements.txt" ]; then
        pip install -q -r ukrainian-tts/requirements.txt
    fi
    echo "✅ TTS dependencies installed"
fi

echo ""
echo "🦆 Setting up Goose AI environment..."

# Check if Goose is installed
if command -v goose >/dev/null 2>&1; then
    echo "✅ Goose is installed"
    
    # Run Goose setup script
    if [ -f "scripts/setup_goose.sh" ]; then
        ./scripts/setup_goose.sh
    else
        echo "⚠️  Goose setup script not found"
    fi
    
    # Install Playwright MCP server if not exists
    if [ ! -d "goose/mcp/playwright" ]; then
        echo "Installing Playwright MCP server..."
        mkdir -p goose/mcp
        cd goose/mcp
        git clone https://github.com/modelcontextprotocol/servers.git temp_servers
        cp -r temp_servers/src/playwright ./
        rm -rf temp_servers
        cd playwright
        npm install
        cd ../../..
        echo "✅ Playwright MCP server installed"
    fi
    
    echo "✅ Goose environment configured"
else
    echo "⚠️  Goose not found. Install with: brew install block-goose-cli"
fi

echo ""
echo "📦 Installing Node.js dependencies..."

# Install orchestrator dependencies
if [ -d "orchestrator" ]; then
    echo "Installing orchestrator dependencies..."
    cd orchestrator
    # Install specific dependencies first to ensure they're available
    npm install express cors dotenv axios ws
    # Then install all dependencies from package.json
    npm install --silent
    cd ..
    echo "✅ Orchestrator dependencies installed"
fi

# Install fallback LLM dependencies
if [ -d "fallback_llm" ]; then
    echo "Installing fallback LLM dependencies..."
    cd fallback_llm
    npm install --silent
    cd ..
    echo "✅ Fallback LLM dependencies installed"
fi

echo ""
echo "🦆 Checking Goose installation..."

# Check for Goose installations
if [ -x "/opt/homebrew/bin/goose" ]; then
    echo "✅ Goose CLI is installed (Homebrew)"
elif [ -x "/Applications/Goose.app/Contents/MacOS/goose" ]; then
    echo "✅ Goose Desktop is installed"
elif [ -x "$HOME/.local/bin/goose" ]; then
    echo "✅ Goose CLI is installed (Local)"
elif command -v goose >/dev/null 2>&1; then
    echo "✅ Goose is available in PATH"
else
    echo "⚠️  Goose not found. Please install with:"
    echo "   brew install block-goose-cli"
    echo "   OR curl -fsSL https://goose.build/install.sh | sh"
fi

echo ""
echo "🔄 Verifying Orchestrator setup..."
if [ -d "orchestrator/node_modules" ]; then
    echo "✅ Orchestrator dependencies verified"
else
    echo "⚠️  Orchestrator dependencies may need reinstallation"
fi

# Перевіряємо чи порт 5101 вільний
if lsof -i :5101 > /dev/null; then
    echo "⚠️  Port 5101 is in use. Attempting to kill the process..."
    lsof -ti :5101 | xargs kill -9
fi

echo ""
echo "🔧 Setting up directories..."
mkdir -p logs logs/archive
mkdir -p $HOME/.local/share/goose/sessions
echo "✅ Directories created"

echo ""
echo "🔧 Final system configuration..."

# Check if config.yaml exists and is properly configured
if [ -f "config.yaml" ]; then
    echo "✅ System config.yaml found"
else
    echo "⚠️  System config.yaml not found - using defaults"
fi

# Run configuration check
if [ -f "check_goose_config.sh" ]; then
    echo "🔍 Running Goose configuration check..."
    ./check_goose_config.sh
else
    echo "⚠️  Configuration check script not found"
fi

echo ""
echo "📝 Configuration notes:"
echo ""
echo "1. Configure Goose authentication:"
echo "   /opt/homebrew/bin/goose configure"
echo ""
echo "2. All system settings are in config.yaml"
echo ""
echo "3. For GitHub Copilot, you may need device authentication:"
echo "   Visit: https://github.com/login/device"
echo ""
echo "4. Environment variables (optional):"
echo "   export GOOSE_DESKTOP_PATH=/opt/homebrew/bin/goose"
echo "   export REAL_TTS_MODE=true"
echo "   export TTS_DEVICE=mps"
echo ""

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                  INSTALLATION COMPLETE!                        ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "🚀 To start the system, run:"
echo "   ./restart_system.sh start"
echo ""
echo "Or use Make:"
echo "   make start"
echo ""
