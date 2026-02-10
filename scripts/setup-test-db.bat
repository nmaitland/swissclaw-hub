@echo off
REM Integration Test Database Setup Script (Windows)
REM This script sets up the test database for integration tests

echo 🚀 Starting integration test database setup...

REM Check if Docker is running
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker is not running. Please start Docker first.
    exit /b 1
)

REM Stop and remove existing test database container
echo 🧹 Cleaning up existing test database...
docker-compose -f docker-compose.test.yml down -v >nul 2>&1

REM Start the test database
echo 🐳 Starting test database...
docker-compose -f docker-compose.test.yml up -d test-db

REM Wait for database to be ready
echo ⏳ Waiting for database to be ready...
:wait_loop
timeout /t 2 /nobreak >nul
docker-compose -f docker-compose.test.yml exec -T test-db pg_isready -U postgres >nul 2>&1
if %errorlevel% equ 0 (
    goto :ready
)
goto :wait_loop

:ready
echo ✅ Test database is ready!
echo.
echo 📋 Database connection details:
echo    Host: localhost
echo    Port: 5433
echo    Database: swissclaw_hub_test
echo    User: postgres
echo    Password: password
echo.
echo 🧪 You can now run integration tests with:
echo    npm run test:integration
echo.
echo 🛑 To stop the test database:
echo    docker-compose -f docker-compose.test.yml down
