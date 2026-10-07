@echo off
setlocal
cd /d "%~dp0"
set PORT=8777

echo.
echo   Paint the Music - local server
echo   http://localhost:%PORT%/
echo   (Ctrl+C to stop)
echo.
echo   Useful for Web MIDI, and for everything else the browser
echo   refuses when the page is opened over file://
echo.

where py >nul 2>nul
if %errorlevel%==0 (
    start "" http://localhost:%PORT%/
    py -m http.server %PORT% --bind 127.0.0.1
    goto :done
)

where python >nul 2>nul
if %errorlevel%==0 (
    start "" http://localhost:%PORT%/
    python -m http.server %PORT% --bind 127.0.0.1
    goto :done
)

where npx >nul 2>nul
if %errorlevel%==0 (
    start "" http://localhost:%PORT%/
    npx --yes http-server -a 127.0.0.1 -p %PORT% -c-1
    goto :done
)

echo   No server found. Install Python or Node.js,
echo   or just open index.html directly.
pause

:done
endlocal
