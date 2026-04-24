@echo off
setlocal

cd /d "d:\Docs\Moblie\mobile_testing_tool"

if exist ".venv\Scripts\python.exe" (
    start "Mobile Testing Tool" cmd /k ".venv\Scripts\python.exe app.py"
    goto :eof
)

where py >nul 2>&1
if %errorlevel%==0 (
    start "Mobile Testing Tool" cmd /k "py -3 app.py"
    goto :eof
)

start "Mobile Testing Tool" cmd /k "python app.py"
