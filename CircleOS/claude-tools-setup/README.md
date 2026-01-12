# Claude Code Tools Setup

**For:** The Geek (Pty) Ltd / The Other Bhengu (Pty) Ltd  
**Purpose:** Full-stack Dev + Business Operations tooling  
**Requirements:** Laptop with Claude Code installed

---

## Quick Start (3 Steps)

### Step 1: Copy This Folder to Your Laptop

Copy the entire `claude-tools-setup` folder to your laptop:

**Recommended location:**
- Windows: `C:\Users\<you>\claude-tools\`
- macOS: `~/claude-tools/`
- Linux: `~/claude-tools/`

### Step 2: Run the Install Script

**Windows (Git Bash or WSL):**
```bash
cd ~/claude-tools
chmod +x install.sh
./install.sh
```

**macOS/Linux:**
```bash
cd ~/claude-tools
chmod +x install.sh
./install.sh
```

### Step 3: Install Claude Code Plugins

Open Claude Code CLI and run:
```
/plugin marketplace add timescale/pg-aiguide
/plugin marketplace add sawyerhood/dev-browser
/plugin marketplace add muratcankoylan/Agent-Skills-for-Context-Engineering
```

---

## What Gets Installed

### Automatic (via script)

| Tool | Location | Purpose |
|------|----------|---------|
| Loki Mode | `~/.claude/skills/loki-mode/` | 37 agents (8 dev, 8 business) |
| Continuous-Claude-v2 | `./skills/` | Session continuity |
| Auto-Claude | `./skills/` | Parallel agents |
| pg-aiguide | `./skills/` | PostgreSQL expertise |
| Dev-Browser | `./skills/` | Browser testing |
| Agent-Skills | `./skills/` | Context engineering |
| Quint-Code | `./skills/` | Documented decisions |
| Tally | `./skills/` | Finance categorization |

### Manual Downloads Required

| Tool | Download From | Purpose |
|------|---------------|---------|
| KnowNote | [Releases](https://github.com/MrSibe/KnowNote/releases) | Business intelligence |
| ProxyPal | [Releases](https://github.com/heyhuynhgiabuu/proxypal/releases) | AI spend tracking |
| Mysti | VS Code: `ext install DeepMyst.mysti` | Multi-AI brainstorming |

---

## Using Loki Mode (Your Key Tool)

Once installed, just say **"Loki Mode"** in Claude Code.

### Business Agent Commands

```
# Marketing
"Loki Mode: biz-marketing create social media campaign for TheJobCenter.co.za"

# Sales
"Loki Mode: biz-sales draft proposal for B2Wise consulting engagement"

# Finance
"Loki Mode: biz-finance analyze monthly expenses and identify savings"

# Legal
"Loki Mode: biz-legal review and update SaaS terms of service"

# Support
"Loki Mode: biz-support create FAQ for BidBaas.co.za"

# Partnerships
"Loki Mode: biz-partnerships draft integration proposal for bruh.co.za super app"
```

### Development Agent Commands

```
# Full feature build
"Loki Mode: Build SmartCircle stokvel group creation feature"

# Code review
"Loki Mode: Review this PR with security focus"

# Architecture
"Loki Mode: Design database schema for collective buying"
```

---

## Folder Structure After Setup

```
~/claude-tools/
├── install.sh              # Main setup script
├── README.md               # This file
├── SETUP-COMPLETE.md       # Generated after install
├── skills/
│   ├── continuous-claude-v2/
│   ├── auto-claude/
│   ├── agent-skills/
│   ├── dev-browser/
│   ├── pg-aiguide/
│   ├── quint-code/
│   └── tally/
├── apps/
│   └── DOWNLOAD-THESE.md   # Links to desktop apps
├── scripts/
│   └── install-plugins.md  # Plugin commands
└── docs/
    └── (your knowledge base files)

~/.claude/skills/
└── loki-mode/              # Installed globally for Claude Code
```

---

## Troubleshooting

### "git: command not found"
Install Git first:
- Windows: https://git-scm.com/download/win
- macOS: `xcode-select --install`
- Linux: `sudo apt install git`

### "Permission denied"
```bash
chmod +x install.sh
```

### Plugin not found in marketplace
Some plugins may need manual installation. Check the repo's README for alternatives.

### Loki Mode not responding
Ensure the skill is in `~/.claude/skills/loki-mode/` and contains `SKILL.md`

---

## Support

These are open-source community tools. For issues:
- Loki Mode: https://github.com/asklokesh/claudeskill-loki-mode/issues
- Auto-Claude: https://github.com/AndyMik90/Auto-Claude/issues
- KnowNote: https://github.com/MrSibe/KnowNote/issues

---

*Slow is smooth. Smooth is fast.*
