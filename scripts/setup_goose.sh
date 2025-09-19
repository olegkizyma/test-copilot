#!/bin/bash

# =============================================================================
# Goose AI Configuration Script
# =============================================================================
# Автоматичне налаштування Goose AI з системним бінарником
# =============================================================================

set -e

# Use system Goose binary (preferred)
GOOSE_BIN="/opt/homebrew/bin/goose"

echo "🦆 Setting up Goose AI configuration with system binary: $GOOSE_BIN..."

# Check if system Goose is available
if [ ! -x "$GOOSE_BIN" ]; then
    echo "❌ System Goose not found at $GOOSE_BIN"
    echo "Please install Goose via: brew install goose"
    exit 1
fi

echo "✅ Using system Goose: $($GOOSE_BIN --version)"

# Create Goose config directory if not exists
mkdir -p ~/.config/goose

# Create proper config with correct paths
cat > ~/.config/goose/config.yaml << 'EOF'
extensions:
  autovisualiser:
    available_tools: []
    bundled: true
    description: null
    display_name: Auto Visualiser
    enabled: true
    name: autovisualiser
    timeout: 300
    type: builtin
  computercontroller:
    available_tools: []
    bundled: true
    description: null
    display_name: Computer Controller
    enabled: true
    name: computercontroller
    timeout: 300
    type: builtin
  developer:
    available_tools: []
    bundled: true
    description: null
    display_name: Developer Tools
    enabled: true
    name: developer
    timeout: 300
    type: builtin
  memory:
    available_tools: []
    bundled: true
    description: null
    display_name: Memory
    enabled: true
    name: memory
    timeout: 300
    type: builtin
  playwright:
    args:
    - /Users/dev/Documents/GitHub/atlas4/goose/mcp/playwright/dist/index.js
    available_tools: []
    bundled: null
    cmd: node
    description: Interact with web pages via Playwright MCP server
    enabled: true
    env_keys: []
    envs: {}
    name: playwright
    timeout: 300
    type: stdio
  tutorial:
    available_tools: []
    bundled: true
    description: null
    display_name: Tutorial
    enabled: true
    name: tutorial
    timeout: 300
    type: builtin
GOOSE_RECIPE_GITHUB_REPO: https://github.com/olegkizyma/atlas4.git
GOOSE_WORKING_DIR: /Users/dev/Documents/GitHub/atlas4/goose
GOOSE_MODE: auto
GOOSE_SCHEDULER_TYPE: temporal
GOOSE_CLI_MIN_PRIORITY: 0.0
GOOSE_ENABLE_ROUTER: 'true'
GOOSE_PROVIDER: github_copilot
GITHUB_COPILOT_TOKEN: YOUR_GITHUB_COPILOT_TOKEN_HERE
GOOSE_MODEL: gpt-4o
EOF

echo "✅ Goose configuration created"

# Create working directory
mkdir -p /Users/dev/Documents/GitHub/atlas4/goose

# Set up MCP extensions
mkdir -p /Users/dev/Documents/GitHub/atlas4/goose/mcp

echo "✅ Goose environment configured successfully with system binary: $GOOSE_BIN"
