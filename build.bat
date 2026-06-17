@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"
set "ROOT=%CD%"
set "TARGET=%~1"

if /i "%TARGET%"=="" set "TARGET=all"
if /i "%TARGET%"=="?" goto usage
if /i "%TARGET%"=="help" goto usage
if /i "%TARGET%"=="deps" set "TARGET=install"
if /i "%TARGET%"=="dependencies" set "TARGET=install"

set "TARGET_NEEDS_DESKTOP=0"
set "TARGET_NEEDS_MOBILE=0"

if /i "%TARGET%"=="all" set "TARGET_NEEDS_DESKTOP=1"
if /i "%TARGET%"=="all" set "TARGET_NEEDS_MOBILE=1"
if /i "%TARGET%"=="desktop" set "TARGET_NEEDS_DESKTOP=1"
if /i "%TARGET%"=="mobile" set "TARGET_NEEDS_MOBILE=1"
if /i "%TARGET%"=="install" set "TARGET_NEEDS_DESKTOP=1"
if /i "%TARGET%"=="install" set "TARGET_NEEDS_MOBILE=1"

echo UC.Comms local build
echo Target: %TARGET%
echo.

call :ensure_dependencies
if errorlevel 1 exit /b 1

call :install_node_deps
if errorlevel 1 exit /b 1

if /i "%TARGET%"=="install" goto done_install
if /i "%TARGET%"=="all" goto target_all
if /i "%TARGET%"=="typecheck" goto target_typecheck
if /i "%TARGET%"=="web" goto target_web
if /i "%TARGET%"=="server" goto target_server
if /i "%TARGET%"=="desktop" goto target_desktop
if /i "%TARGET%"=="mobile" goto target_mobile

echo Unknown target: %TARGET%
goto usage

:target_all
call :run_typecheck
if errorlevel 1 exit /b 1
call :run_web
if errorlevel 1 exit /b 1
call :run_server
if errorlevel 1 exit /b 1
call :run_desktop
if errorlevel 1 exit /b 1
call :run_mobile
if errorlevel 1 exit /b 1
echo.
echo Build complete.
exit /b 0

:target_typecheck
call :run_typecheck
if errorlevel 1 exit /b 1
exit /b 0

:target_web
call :run_web
if errorlevel 1 exit /b 1
exit /b 0

:target_server
call :run_server
if errorlevel 1 exit /b 1
exit /b 0

:target_desktop
call :run_desktop
if errorlevel 1 exit /b 1
exit /b 0

:target_mobile
call :run_mobile
if errorlevel 1 exit /b 1
exit /b 0

:done_install
echo Dependency setup complete.
exit /b 0

:ensure_dependencies
set "SKIP_NODE=0"
set "SKIP_NPM=0"
set "SKIP_PYTHON=0"
set "SKIP_GIT=0"
set "SKIP_RUST=0"
set "SKIP_CARGO=0"
set "SKIP_CL=0"
set "SKIP_WEBVIEW2=0"
set "SKIP_JAVAC=0"
set "SKIP_ANDROID=0"

call :check_node
if errorlevel 1 goto missing_node
call :check_npm
if errorlevel 1 goto missing_npm
call :check_python
if errorlevel 1 goto missing_python
call :check_git
if errorlevel 1 goto missing_git

if "%TARGET_NEEDS_DESKTOP%"=="1" goto check_desktop_deps
if "%TARGET_NEEDS_MOBILE%"=="1" goto check_mobile_deps
exit /b 0

:check_desktop_deps
call :check_rust
if errorlevel 1 goto missing_rust
call :check_cargo
if errorlevel 1 goto missing_cargo
call :check_cl
if errorlevel 1 goto missing_cl
call :check_webview2
if errorlevel 1 goto missing_webview2
if "%TARGET_NEEDS_MOBILE%"=="1" goto check_mobile_deps
exit /b 0

:check_mobile_deps
if "%TARGET_NEEDS_MOBILE%"=="1" goto check_mobile_required
exit /b 0

:check_mobile_required
call :check_javac
if errorlevel 1 goto missing_javac
call :check_android_sdk
if errorlevel 1 goto missing_android
exit /b 0

:missing_node
call :handle_missing "Node.js 20+" NODE "OpenJS.NodeJS.LTS" "nodejs-lts" "https://nodejs.org/" 1
if errorlevel 1 exit /b 1
call :recheck_dependency NODE
if errorlevel 1 exit /b 1
goto ensure_dependencies_next

:missing_npm
call :handle_missing "npm" NPM "OpenJS.NodeJS.LTS" "nodejs-lts" "https://nodejs.org/" 1
if errorlevel 1 exit /b 1
call :recheck_dependency NPM
if errorlevel 1 exit /b 1
goto ensure_dependencies_next

:missing_python
call :handle_missing "Python 3" PYTHON "Python.Python.3.12" "python3" "https://www.python.org/downloads/" 1
if errorlevel 1 exit /b 1
call :recheck_dependency PYTHON
if errorlevel 1 exit /b 1
goto ensure_dependencies_next

:missing_git
call :handle_missing "Git" GIT "Git.Git" "git" "https://git-scm.com/download/win" 0
if errorlevel 1 exit /b 1
call :recheck_dependency GIT
if errorlevel 1 exit /b 1
goto ensure_dependencies_next

:missing_rust
call :handle_missing "Rust rustup" RUST "Rustlang.Rustup" "rust" "https://rustup.rs/" 1
if errorlevel 1 exit /b 1
call :recheck_dependency RUST
if errorlevel 1 exit /b 1
goto ensure_dependencies_next

:missing_cargo
call :handle_missing "Cargo" CARGO "Rustlang.Rustup" "rust" "https://rustup.rs/" 1
if errorlevel 1 exit /b 1
call :recheck_dependency CARGO
if errorlevel 1 exit /b 1
goto ensure_dependencies_next

:missing_cl
call :handle_missing "Visual Studio C++ Build Tools" CL "Microsoft.VisualStudio.2022.BuildTools" "visualstudio2022buildtools visualstudio2022-workload-vctools" "https://visualstudio.microsoft.com/visual-cpp-build-tools/" 1
if errorlevel 1 exit /b 1
call :recheck_dependency CL
if errorlevel 1 exit /b 1
goto ensure_dependencies_next

:missing_webview2
call :handle_missing "Microsoft Edge WebView2 Runtime" WEBVIEW2 "Microsoft.EdgeWebView2Runtime" "webview2-runtime" "https://developer.microsoft.com/en-us/microsoft-edge/webview2/" 1
if errorlevel 1 exit /b 1
call :recheck_dependency WEBVIEW2
if errorlevel 1 exit /b 1
goto ensure_dependencies_next

:missing_javac
call :handle_missing "Java JDK" JAVAC "EclipseAdoptium.Temurin.21.JDK" "openjdk" "https://adoptium.net/" 1
if errorlevel 1 exit /b 1
call :recheck_dependency JAVAC
if errorlevel 1 exit /b 1
goto ensure_dependencies_next

:missing_android
call :handle_missing "Android SDK" ANDROID "Google.AndroidStudio" "androidstudio" "https://developer.android.com/studio" 1
if errorlevel 1 exit /b 1
call :recheck_dependency ANDROID
if errorlevel 1 exit /b 1

:ensure_dependencies_next
exit /b 0

:handle_missing
set "DEP_NAME=%~1"
set "DEP_SAFE=%~2"
set "DEP_WINGET=%~3"
set "DEP_CHOCO=%~4"
set "DEP_URL=%~5"
set "DEP_REQUIRED=%~6"

echo.
echo Missing dependency: %DEP_NAME%
echo Download page: %DEP_URL%
echo.
echo Choose an action:
echo   1. Open download page
echo   2. Try installing with winget
echo   3. Try installing with Chocolatey
if "%DEP_REQUIRED%"=="1" (
  echo   4. Abort
) else (
  echo   4. Skip this dependency
)

set /p "choice=Choice [1-4]: "

if /i "%choice%"=="1" goto missing_open
if /i "%choice%"=="2" goto missing_winget
if /i "%choice%"=="3" goto missing_choco
if /i "%choice%"=="4" goto missing_skip

echo Invalid choice.
exit /b 1

:missing_open
start "" "%DEP_URL%"
echo After installing, press any key to recheck %DEP_NAME%.
pause >nul
call :recheck_dependency %DEP_SAFE%
if errorlevel 0 exit /b 0
if "%DEP_REQUIRED%"=="1" exit /b 1
echo Skipping %DEP_NAME%.
exit /b 0

:missing_winget
call :try_winget "%DEP_WINGET%" "%DEP_NAME%"
if errorlevel 1 exit /b 1
call :recheck_dependency %DEP_SAFE%
if errorlevel 0 exit /b 0
if "%DEP_REQUIRED%"=="1" exit /b 1
echo Skipping %DEP_NAME%.
exit /b 0

:missing_choco
call :try_choco "%DEP_CHOCO%" "%DEP_NAME%"
if errorlevel 1 exit /b 1
call :recheck_dependency %DEP_SAFE%
if errorlevel 0 exit /b 0
if "%DEP_REQUIRED%"=="1" exit /b 1
echo Skipping %DEP_NAME%.
exit /b 0

:missing_skip
if "%DEP_REQUIRED%"=="1" (
  echo Aborting because %DEP_NAME% is required.
  exit /b 1
)
set "SKIP_%DEP_SAFE%=1"
echo Skipping %DEP_NAME%.
exit /b 0

:recheck_dependency
if /i "%~1"=="NODE" call :check_node
if /i "%~1"=="NPM" call :check_npm
if /i "%~1"=="PYTHON" call :check_python
if /i "%~1"=="GIT" call :check_git
if /i "%~1"=="RUST" call :check_rust
if /i "%~1"=="CARGO" call :check_cargo
if /i "%~1"=="CL" call :check_cl
if /i "%~1"=="WEBVIEW2" call :check_webview2
if /i "%~1"=="JAVAC" call :check_javac
if /i "%~1"=="ANDROID" call :check_android_sdk
exit /b %errorlevel%

:try_winget
where winget >nul 2>nul
if errorlevel 1 (
  echo winget was not found. Opening the Microsoft Store page for Windows Package Manager.
  start "" "https://apps.microsoft.com/detail/9NBLGGH4NNS1"
  exit /b 1
)

echo Installing %~2 with winget...
winget install --id %~1 --exact --interactive
if errorlevel 1 (
  echo winget installation failed or was cancelled for %~2.
  exit /b 1
)

call :refresh_env
exit /b 0

:try_choco
where choco >nul 2>nul
if errorlevel 1 (
  echo Chocolatey was not found. Opening the Chocolatey install page.
  start "" "https://chocolatey.org/install"
  exit /b 1
)

echo Installing %~2 with Chocolatey...
choco install %~1 -y
if errorlevel 1 (
  echo Chocolatey installation failed or was cancelled for %~2.
  exit /b 1
)

call :refresh_env
exit /b 0

:refresh_env
if exist "%ProgramFiles%\Chocolatey\bin\refreshenv.cmd" call "%ProgramFiles%\Chocolatey\bin\refreshenv.cmd" >nul 2>&1
exit /b 0

:install_node_deps
echo.
echo Installing npm workspace dependencies...
if exist "%ROOT%\package-lock.json" (
  cmd /d /c npm ci --include-workspace-root
) else (
  cmd /d /c npm install --include-workspace-root
)

if errorlevel 1 (
  echo npm dependency installation failed.
  exit /b 1
)

exit /b 0

:run_typecheck
echo.
echo Running TypeScript checks...
cmd /d /c npm run typecheck
if errorlevel 1 exit /b 1
exit /b 0

:run_web
echo.
echo Building web client...
cmd /d /c npm --workspace web run build
if errorlevel 1 exit /b 1
exit /b 0

:run_server
echo.
echo Building API server...
cmd /d /c npm --workspace server run build
if errorlevel 1 exit /b 1
exit /b 0

:run_desktop
call :run_web
if errorlevel 1 exit /b 1

echo.
echo Building Tauri desktop app...
cmd /d /c npm --workspace desktop run build
if errorlevel 1 exit /b 1
exit /b 0

:run_mobile
call :run_web
if errorlevel 1 exit /b 1

if not defined ANDROID_HOME if not defined ANDROID_SDK_ROOT (
  echo Android SDK is not configured. Set ANDROID_HOME or ANDROID_SDK_ROOT, then rerun the script.
  exit /b 1
)

echo.
echo Syncing Capacitor mobile projects...
cmd /d /c npm --workspace mobile run cap:sync
if errorlevel 1 exit /b 1

echo.
echo Building Android app...
cmd /d /c npm --workspace mobile run cap:build:android
if errorlevel 1 exit /b 1

echo.
echo iOS builds require macOS with Xcode. Skipping iOS on this Windows host.
exit /b 0

:check_node
where node >nul 2>nul || exit /b 1
for /f "tokens=1 delims=v." %%A in ('node -v 2^>nul') do set "NODE_MAJOR=%%A"
if not defined NODE_MAJOR exit /b 1
if %NODE_MAJOR% LSS 20 exit /b 1
exit /b 0

:check_npm
where npm >nul 2>nul
exit /b %errorlevel%

:check_python
where python >nul 2>nul && exit /b 0
where py >nul 2>nul
exit /b %errorlevel%

:check_git
where git >nul 2>nul
exit /b %errorlevel%

:check_rust
where rustc >nul 2>nul
exit /b %errorlevel%

:check_cargo
where cargo >nul 2>nul
exit /b %errorlevel%

:check_cl
if defined VCINSTALLDIR if exist "%VCINSTALLDIR%\Tools\MSVC\*\bin\Hostx64\x64\cl.exe" exit /b 0
where cl >nul 2>nul
exit /b %errorlevel%

:check_webview2
reg query "HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" /v pv >nul 2>&1 && exit /b 0
reg query "HKLM\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" /v pv >nul 2>&1 && exit /b 0
exit /b 1

:check_javac
where javac >nul 2>nul
exit /b %errorlevel%

:check_android_sdk
if defined ANDROID_HOME if exist "%ANDROID_HOME%\platform-tools\adb.exe" exit /b 0
if defined ANDROID_SDK_ROOT if exist "%ANDROID_SDK_ROOT%\platform-tools\adb.exe" exit /b 0
exit /b 1

:usage
echo.
echo Usage:
echo   build.bat [target]
echo.
echo Targets:
echo   all         Build typecheck, web, server, desktop, and Android mobile when available. Default.
echo   install     Check/install dependencies and npm packages only.
echo   typecheck   Run TypeScript checks.
echo   web         Build the Vite/React web client.
echo   server      Build the Express/Socket.IO server.
echo   desktop     Build web, then the Tauri desktop app.
echo   mobile      Build web, sync Capacitor, and build Android when available.
echo.
exit /b 0
