#!/bin/bash

# Install Goose AI CLI - DEPRECATED: Use system Homebrew installation instead
echo "⚠️  DEPRECATED: This script installs local Goose AI CLI"
echo "🎆 RECOMMENDED: Use system Homebrew installation instead:"
echo "   brew install goose"
echo ""
echo "System binary location: /opt/homebrew/bin/goose"
echo "This provides better performance and integration."
echo ""
read -p "Do you still want to install local Goose AI CLI? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "ℹ️ Skipping local installation. Use: brew install goose"
    exit 0
fi

echo "📦 Installing local Goose AI CLI..."

# Use pipx to install goose properly
if ! command -v pipx >/dev/null 2>&1; then
    echo "Installing pipx..."
    python3 -m pip install --user pipx
    python3 -m pipx ensurepath
fi

# Install goose-ai using pipx
echo "Installing goose-ai..."
pipx install goose-ai

# If pipx fails, try direct pip install
if [ $? -ne 0 ]; then
    echo "Trying pip install..."
    pip3 install --user goose-ai
fi

# Add to PATH if not already there
if ! echo $PATH | grep -q "$HOME/.local/bin"; then
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
    export PATH="$HOME/.local/bin:$PATH"
fi

echo "✅ Local Goose AI CLI installed"
echo "⚠️  NOTE: System binary /opt/homebrew/bin/goose is preferred for better performance"
echo "   Please restart your terminal or run: source ~/.zshrc"
