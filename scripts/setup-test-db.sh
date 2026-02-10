#!/bin/bash

# Integration Test Database Setup Script
# This script sets up the test database for integration tests

set -e

echo "🚀 Starting integration test database setup..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Stop and remove existing test database container
echo "🧹 Cleaning up existing test database..."
docker-compose -f docker-compose.test.yml down -v || true

# Start the test database
echo "🐳 Starting test database..."
docker-compose -f docker-compose.test.yml up -d test-db

# Wait for database to be ready
echo "⏳ Waiting for database to be ready..."
timeout 60 bash -c 'until docker-compose -f docker-compose.test.yml exec -T test-db pg_isready -U postgres; do sleep 2; done'

if [ $? -eq 0 ]; then
    echo "✅ Test database is ready!"
    echo ""
    echo "📋 Database connection details:"
    echo "   Host: localhost"
    echo "   Port: 5433"
    echo "   Database: swissclaw_hub_test"
    echo "   User: postgres"
    echo "   Password: password"
    echo ""
    echo "🧪 You can now run integration tests with:"
    echo "   npm run test:integration"
    echo ""
    echo "🛑 To stop the test database:"
    echo "   docker-compose -f docker-compose.test.yml down"
else
    echo "❌ Failed to start test database"
    exit 1
fi
