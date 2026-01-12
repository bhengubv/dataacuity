#!/bin/bash

# ============================================================================
# Claude Code Tools Setup Script
# For: The Geek (Pty) Ltd / The Other Bhengu (Pty) Ltd
# Purpose: Dev + Business Operations tooling
# ============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║         Claude Code Tools - Full Stack Setup                   ║"
echo "║         Dev + Business Operations                              ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Detect OS
OS="unknown"
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="linux"
elif [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macos"
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]]; then
    OS="windows"
fi

echo -e "${YELLOW}Detected OS: $OS${NC}"
echo ""

# Set base directory (where this script lives)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOLS_DIR="$SCRIPT_DIR"

# Create directory structure
echo -e "${GREEN}[1/6] Creating directory structure...${NC}"

mkdir -p "$TOOLS_DIR/skills"           # Claude Code skills
mkdir -p "$TOOLS_DIR/plugins"          # Plugin configs
mkdir -p "$TOOLS_DIR/apps"             # Desktop apps (manual download)
mkdir -p "$TOOLS_DIR/docs"             # Documentation/knowledge base
mkdir -p "$TOOLS_DIR/scripts"          # Helper scripts
mkdir -p "$HOME/.claude/skills"        # Claude's skill directory

echo "  ✓ Created $TOOLS_DIR structure"

# ============================================================================
# TIER 1: CRITICAL TOOLS
# ============================================================================

echo ""
echo -e "${GREEN}[2/6] Installing TIER 1: Critical Tools...${NC}"

# --- Loki Mode (37-agent startup system) ---
echo -e "${YELLOW}  Installing Loki Mode...${NC}"
if [ -d "$HOME/.claude/skills/loki-mode" ]; then
    echo "    Loki Mode already exists, updating..."
    cd "$HOME/.claude/skills/loki-mode" && git pull 2>/dev/null || true
else
    git clone https://github.com/asklokesh/claudeskill-loki-mode.git "$HOME/.claude/skills/loki-mode" 2>/dev/null || {
        echo -e "${RED}    Failed to clone Loki Mode. Check internet connection.${NC}"
    }
fi
echo "  ✓ Loki Mode installed to ~/.claude/skills/loki-mode"

# --- Continuous-Claude-v2 (session continuity) ---
echo -e "${YELLOW}  Installing Continuous-Claude-v2...${NC}"
if [ -d "$TOOLS_DIR/skills/continuous-claude-v2" ]; then
    echo "    Already exists, updating..."
    cd "$TOOLS_DIR/skills/continuous-claude-v2" && git pull 2>/dev/null || true
else
    git clone https://github.com/parcadei/Continuous-Claude-v2.git "$TOOLS_DIR/skills/continuous-claude-v2" 2>/dev/null || {
        echo -e "${RED}    Failed to clone Continuous-Claude-v2.${NC}"
    }
fi
echo "  ✓ Continuous-Claude-v2 cloned"

# --- Quint-Code (documented decisions) ---
echo -e "${YELLOW}  Installing Quint-Code...${NC}"
if [ -d "$TOOLS_DIR/skills/quint-code" ]; then
    echo "    Already exists, updating..."
    cd "$TOOLS_DIR/skills/quint-code" && git pull 2>/dev/null || true
else
    git clone https://github.com/m0n0x41d/quint-code.git "$TOOLS_DIR/skills/quint-code" 2>/dev/null || {
        echo -e "${RED}    Failed to clone Quint-Code.${NC}"
    }
fi
echo "  ✓ Quint-Code cloned"

# ============================================================================
# TIER 2: HIGH VALUE TOOLS
# ============================================================================

echo ""
echo -e "${GREEN}[3/6] Installing TIER 2: High Value Tools...${NC}"

# --- Auto-Claude (parallel agents) ---
echo -e "${YELLOW}  Installing Auto-Claude...${NC}"
if [ -d "$TOOLS_DIR/skills/auto-claude" ]; then
    echo "    Already exists, updating..."
    cd "$TOOLS_DIR/skills/auto-claude" && git pull 2>/dev/null || true
else
    git clone https://github.com/AndyMik90/Auto-Claude.git "$TOOLS_DIR/skills/auto-claude" 2>/dev/null || {
        echo -e "${RED}    Failed to clone Auto-Claude.${NC}"
    }
fi
echo "  ✓ Auto-Claude cloned"

# --- Agent Skills for Context Engineering ---
echo -e "${YELLOW}  Installing Agent-Skills-for-Context-Engineering...${NC}"
if [ -d "$TOOLS_DIR/skills/agent-skills" ]; then
    echo "    Already exists, updating..."
    cd "$TOOLS_DIR/skills/agent-skills" && git pull 2>/dev/null || true
else
    git clone https://github.com/muratcankoylan/Agent-Skills-for-Context-Engineering.git "$TOOLS_DIR/skills/agent-skills" 2>/dev/null || {
        echo -e "${RED}    Failed to clone Agent-Skills.${NC}"
    }
fi
echo "  ✓ Agent-Skills cloned"

# --- Dev-Browser ---
echo -e "${YELLOW}  Installing Dev-Browser...${NC}"
if [ -d "$TOOLS_DIR/skills/dev-browser" ]; then
    echo "    Already exists, updating..."
    cd "$TOOLS_DIR/skills/dev-browser" && git pull 2>/dev/null || true
else
    git clone https://github.com/SawyerHood/dev-browser.git "$TOOLS_DIR/skills/dev-browser" 2>/dev/null || {
        echo -e "${RED}    Failed to clone Dev-Browser.${NC}"
    }
fi
echo "  ✓ Dev-Browser cloned"

# --- pg-aiguide (PostgreSQL) ---
echo -e "${YELLOW}  Installing pg-aiguide...${NC}"
if [ -d "$TOOLS_DIR/skills/pg-aiguide" ]; then
    echo "    Already exists, updating..."
    cd "$TOOLS_DIR/skills/pg-aiguide" && git pull 2>/dev/null || true
else
    git clone https://github.com/timescale/pg-aiguide.git "$TOOLS_DIR/skills/pg-aiguide" 2>/dev/null || {
        echo -e "${RED}    Failed to clone pg-aiguide.${NC}"
    }
fi
echo "  ✓ pg-aiguide cloned"

# ============================================================================
# TIER 3: UTILITY TOOLS
# ============================================================================

echo ""
echo -e "${GREEN}[4/6] Installing TIER 3: Utility Tools...${NC}"

# --- Claude Code Transcripts ---
echo -e "${YELLOW}  Installing claude-code-transcripts...${NC}"
if command -v uv &> /dev/null; then
    uv tool install claude-code-transcripts 2>/dev/null || echo "    (may already be installed)"
    echo "  ✓ claude-code-transcripts installed via uv"
else
    echo -e "${YELLOW}    uv not found. Install with: curl -LsSf https://astral.sh/uv/install.sh | sh${NC}"
    echo "    Then run: uv tool install claude-code-transcripts"
fi

# --- Tally (finance) ---
echo -e "${YELLOW}  Cloning Tally...${NC}"
if [ -d "$TOOLS_DIR/skills/tally" ]; then
    cd "$TOOLS_DIR/skills/tally" && git pull 2>/dev/null || true
else
    git clone https://github.com/davidfowl/tally.git "$TOOLS_DIR/skills/tally" 2>/dev/null || true
fi
echo "  ✓ Tally cloned"

# ============================================================================
# CREATE HELPER SCRIPTS
# ============================================================================

echo ""
echo -e "${GREEN}[5/6] Creating helper scripts...${NC}"

# Create plugin installation script (to run in Claude Code)
cat > "$TOOLS_DIR/scripts/install-plugins.md" << 'EOF'
# Claude Code Plugin Installation

Run these commands inside Claude Code CLI:

```bash
# PostgreSQL expertise
/plugin marketplace add timescale/pg-aiguide

# Browser testing
/plugin marketplace add sawyerhood/dev-browser

# Context engineering skills
/plugin marketplace add muratcankoylan/Agent-Skills-for-Context-Engineering

# Auto-Claude (if available in marketplace)
/plugin marketplace add andymik90/auto-claude
```

## Verify Installation
```bash
/plugin list
```
EOF

echo "  ✓ Created scripts/install-plugins.md"

# Create desktop apps download guide
cat > "$TOOLS_DIR/apps/DOWNLOAD-THESE.md" << 'EOF'
# Desktop Apps to Download

## KnowNote (Local NotebookLM alternative)
- Purpose: Business intelligence, document analysis
- Download: https://github.com/MrSibe/KnowNote/releases
- Get: .exe (Windows) or .dmg (macOS)

## ProxyPal (AI subscription manager)
- Purpose: Use Claude/ChatGPT/Gemini with any tool, track usage
- Download: https://github.com/heyhuynhgiabuu/proxypal/releases
- Get: .exe (Windows) or .dmg (macOS) or .deb (Linux)

## Mysti (VS Code extension)
- Purpose: Multi-AI brainstorming in VS Code
- Install: Open VS Code, press Ctrl+P, paste:
  ext install DeepMyst.mysti
EOF

echo "  ✓ Created apps/DOWNLOAD-THESE.md"

# ============================================================================
# CREATE SUMMARY
# ============================================================================

echo ""
echo -e "${GREEN}[6/6] Creating summary...${NC}"

cat > "$TOOLS_DIR/SETUP-COMPLETE.md" << EOF
# Claude Code Tools Setup Complete

**Setup Date:** $(date)
**Location:** $TOOLS_DIR

## What's Installed

### Skills (in ~/.claude/skills/)
- [x] **loki-mode** - 37-agent startup system (dev + business)

### Skills (in $TOOLS_DIR/skills/)
- [x] continuous-claude-v2 - Session continuity
- [x] quint-code - Documented decisions
- [x] auto-claude - Parallel agents
- [x] agent-skills - Context engineering
- [x] dev-browser - Browser testing
- [x] pg-aiguide - PostgreSQL expertise
- [x] tally - Finance categorization

### CLI Tools
- [ ] claude-code-transcripts (run: uv tool install claude-code-transcripts)

## Next Steps

### 1. Install Claude Code Plugins (REQUIRED)
Open Claude Code and run:
\`\`\`
/plugin marketplace add timescale/pg-aiguide
/plugin marketplace add sawyerhood/dev-browser
/plugin marketplace add muratcankoylan/Agent-Skills-for-Context-Engineering
\`\`\`

### 2. Download Desktop Apps
See: $TOOLS_DIR/apps/DOWNLOAD-THESE.md
- KnowNote (business intelligence)
- ProxyPal (subscription management)

### 3. Install VS Code Extension
- Mysti: \`ext install DeepMyst.mysti\`

### 4. Activate Continuous-Claude-v2
\`\`\`bash
cd $TOOLS_DIR/skills/continuous-claude-v2
./install-global.sh
\`\`\`

### 5. Test Loki Mode
In Claude Code, say: "Loki Mode"

## Quick Reference

| Task | Command |
|------|---------|
| Start 37-agent system | "Loki Mode" in Claude Code |
| Marketing agent | "Loki Mode: biz-marketing create campaign for BidBaas" |
| Finance agent | "Loki Mode: biz-finance analyze Q4 expenses" |
| Legal agent | "Loki Mode: biz-legal review SaaS terms" |
| Session handoff | Automatic via Continuous-Claude-v2 |

## Directory Structure
\`\`\`
$TOOLS_DIR/
├── skills/           # Cloned repositories
├── plugins/          # Plugin configs
├── apps/             # Desktop app downloads
├── docs/             # Your knowledge base
├── scripts/          # Helper scripts
└── SETUP-COMPLETE.md # This file
\`\`\`
EOF

echo "  ✓ Created SETUP-COMPLETE.md"

# ============================================================================
# FINAL OUTPUT
# ============================================================================

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                    SETUP COMPLETE                              ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}All tools cloned to: $TOOLS_DIR${NC}"
echo ""
echo -e "${YELLOW}NEXT STEPS:${NC}"
echo "1. Read: $TOOLS_DIR/SETUP-COMPLETE.md"
echo "2. Run Claude Code plugin installs (see scripts/install-plugins.md)"
echo "3. Download desktop apps (see apps/DOWNLOAD-THESE.md)"
echo "4. Test: Say 'Loki Mode' in Claude Code"
echo ""
echo -e "${GREEN}Slow is smooth. Smooth is fast. ✓${NC}"
