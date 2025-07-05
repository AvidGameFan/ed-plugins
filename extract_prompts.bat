@echo off
REM Batch file wrapper for extract_prompts.py
REM Usage: extract_prompts.bat [directory] [output_file]

setlocal

REM Check if Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo Error: Python is not installed or not in PATH
    echo Please install Python from https://python.org
    pause
    exit /b 1
)

REM Set default values
if "%1"=="" (
    set "SEARCH_DIR=."
) else (
    set "SEARCH_DIR=%1"
)

if "%2"=="" (
    set "OUTPUT_FILE=prompts.txt"
) else (
    set "OUTPUT_FILE=%2"
)

echo Running prompt extraction...
echo Search directory: %SEARCH_DIR%
echo Output file: %OUTPUT_FILE%
echo.

python extract_prompts.py "%SEARCH_DIR%" "%OUTPUT_FILE%"

if errorlevel 1 (
    echo.
    echo Extraction failed!
    pause
    exit /b 1
) else (
    echo.
    echo Extraction completed successfully!
    echo Output saved to: %OUTPUT_FILE%
)

pause 