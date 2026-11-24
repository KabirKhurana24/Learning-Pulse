@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Learning Pulse - Teacher Workspace

echo.
echo  ================================================
echo       LEARNING PULSE - TEACHER WORKSPACE
echo  ================================================
echo.

where node >nul 2>nul
if errorlevel 1 goto missing_node

node -e "const v=process.versions.node.split('.').map(Number);if(!((v[0]===20&&v[1]>=19)||(v[0]===22&&v[1]>=12)||v[0]>22)){console.error('Unsupported Node.js '+process.versions.node);process.exit(1)}"
if errorlevel 1 goto old_node

where npm >nul 2>nul
if errorlevel 1 goto missing_npm

if not exist "node_modules\vite\bin\vite.js" goto install_deps
if not exist "node_modules\react\package.json" goto install_deps
if not exist "node_modules\react-dom\package.json" goto install_deps
if not exist "node_modules\lucide-react\package.json" goto install_deps
if not exist "node_modules\recharts\package.json" goto install_deps
if not exist "node_modules\papaparse\package.json" goto install_deps
if not exist "node_modules\xlsx\package.json" goto install_deps
goto start_app

:install_deps
echo Installing Learning Pulse dependencies for the first run...
echo An internet connection is required for this one-time setup.
echo.
call npm install --no-audit --no-fund
if errorlevel 1 goto install_failed

:start_app
echo.
echo Starting the Vite + React application...
echo Your browser will open at http://localhost:5173
echo Keep this terminal window open while using Learning Pulse.
echo Press Ctrl+C here to stop the app.
echo.
call npm run dev -- --host 127.0.0.1 --open
if errorlevel 1 goto app_failed
goto end

:missing_node
echo [ERROR] Node.js was not found.
echo Install Node.js 22 LTS from https://nodejs.org/ and reopen run.bat.
echo Node.js 22.12+ or 20.19+ is required.
goto failed

:old_node
echo [ERROR] Your Node.js version is too old for this Vite project.
echo Install Node.js 22 LTS (22.12 or newer) from https://nodejs.org/.
goto failed

:missing_npm
echo [ERROR] npm was not found. Reinstall Node.js with npm enabled.
goto failed

:install_failed
echo.
echo [ERROR] Dependency installation failed.
echo Check your internet connection and run run.bat again.
echo If npm prints a package or certificate error, share the full output.
goto failed

:app_failed
echo.
echo [ERROR] Learning Pulse stopped. Review the error printed above.
goto failed

:failed
echo.
pause

:end
endlocal
