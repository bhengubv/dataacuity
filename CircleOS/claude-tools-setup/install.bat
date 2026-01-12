@echo off
REM ============================================================================
REM Claude Code Tools Setup Script (Windows)
REM For: The Geek (Pty) Ltd / The Other Bhengu (Pty) Ltd
REM ============================================================================

echo.
echo ========================================================================
echo         Claude Code Tools - Full Stack Setup (Windows)
echo         Dev + Business Operations
echo ========================================================================
echo.

REM Check for git
where git >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: Git is not installed.
    echo Please install Git from: https://git-scm.com/download/win
    echo Then run this script again.
    pause
    exit /b 1
)

REM Set directories
set TOOLS_DIR=%~dp0
set CLAUDE_SKILLS=%USERPROFILE%\.claude\skills

echo Installing to: %TOOLS_DIR%
echo Claude skills: %CLAUDE_SKILLS%
echo.

REM Create directories
echo [1/6] Creating directory structure...
if not exist "%CLAUDE_SKILLS%" mkdir "%CLAUDE_SKILLS%"
if not exist "%TOOLS_DIR%skills" mkdir "%TOOLS_DIR%skills"
if not exist "%TOOLS_DIR%plugins" mkdir "%TOOLS_DIR%plugins"
if not exist "%TOOLS_DIR%apps" mkdir "%TOOLS_DIR%apps"
if not exist "%TOOLS_DIR%docs" mkdir "%TOOLS_DIR%docs"
if not exist "%TOOLS_DIR%scripts" mkdir "%TOOLS_DIR%scripts"
echo   Done.

REM Install Loki Mode
echo.
echo [2/6] Installing Loki Mode (37-agent system)...
if exist "%CLAUDE_SKILLS%\loki-mode" (
    echo   Updating existing installation...
    cd /d "%CLAUDE_SKILLS%\loki-mode"
    git pull
) else (
    git clone https://github.com/asklokesh/claudeskill-loki-mode.git "%CLAUDE_SKILLS%\loki-mode"
)
echo   Done.

REM Install other skills
echo.
echo [3/6] Installing development tools...

echo   - Continuous-Claude-v2...
if not exist "%TOOLS_DIR%skills\continuous-claude-v2" (
    git clone https://github.com/parcadei/Continuous-Claude-v2.git "%TOOLS_DIR%skills\continuous-claude-v2"
)

echo   - Auto-Claude...
if not exist "%TOOLS_DIR%skills\auto-claude" (
    git clone https://github.com/AndyMik90/Auto-Claude.git "%TOOLS_DIR%skills\auto-claude"
)

echo   - pg-aiguide...
if not exist "%TOOLS_DIR%skills\pg-aiguide" (
    git clone https://github.com/timescale/pg-aiguide.git "%TOOLS_DIR%skills\pg-aiguide"
)

echo   - Dev-Browser...
if not exist "%TOOLS_DIR%skills\dev-browser" (
    git clone https://github.com/SawyerHood/dev-browser.git "%TOOLS_DIR%skills\dev-browser"
)

echo   - Agent-Skills...
if not exist "%TOOLS_DIR%skills\agent-skills" (
    git clone https://github.com/muratcankoylan/Agent-Skills-for-Context-Engineering.git "%TOOLS_DIR%skills\agent-skills"
)

echo   Done.

REM Install business tools
echo.
echo [4/6] Installing business tools...

echo   - Quint-Code...
if not exist "%TOOLS_DIR%skills\quint-code" (
    git clone https://github.com/m0n0x41d/quint-code.git "%TOOLS_DIR%skills\quint-code"
)

echo   - Tally...
if not exist "%TOOLS_DIR%skills\tally" (
    git clone https://github.com/davidfowl/tally.git "%TOOLS_DIR%skills\tally"
)

echo   Done.

REM Create helper files
echo.
echo [5/6] Creating helper files...

(
echo # Desktop Apps to Download
echo.
echo ## KnowNote ^(Local NotebookLM^)
echo - Download: https://github.com/MrSibe/KnowNote/releases
echo - Get the .exe file
echo.
echo ## ProxyPal ^(AI subscription manager^)
echo - Download: https://github.com/heyhuynhgiabuu/proxypal/releases
echo - Get the .exe file
echo.
echo ## Mysti ^(VS Code extension^)
echo - Open VS Code
echo - Press Ctrl+P
echo - Paste: ext install DeepMyst.mysti
) > "%TOOLS_DIR%apps\DOWNLOAD-THESE.md"

(
echo # Claude Code Plugin Installation
echo.
echo Run these commands in Claude Code:
echo.
echo ```
echo /plugin marketplace add timescale/pg-aiguide
echo /plugin marketplace add sawyerhood/dev-browser
echo /plugin marketplace add muratcankoylan/Agent-Skills-for-Context-Engineering
echo ```
) > "%TOOLS_DIR%scripts\install-plugins.md"

echo   Done.

REM Summary
echo.
echo [6/6] Setup complete!
echo.
echo ========================================================================
echo                         NEXT STEPS
echo ========================================================================
echo.
echo 1. INSTALL CLAUDE CODE PLUGINS:
echo    Open Claude Code and run:
echo    /plugin marketplace add timescale/pg-aiguide
echo    /plugin marketplace add sawyerhood/dev-browser
echo.
echo 2. DOWNLOAD DESKTOP APPS:
echo    See: %TOOLS_DIR%apps\DOWNLOAD-THESE.md
echo.
echo 3. TEST LOKI MODE:
echo    In Claude Code, say: "Loki Mode"
echo.
echo ========================================================================
echo.
echo Slow is smooth. Smooth is fast.
echo.
pause
