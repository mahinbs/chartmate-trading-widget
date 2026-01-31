#!/bin/bash

# Apply Active Trades Database Migration
# This script applies the database schema for trade tracking

set -e  # Exit on error

echo "🔄 Applying Active Trades Database Migration..."
echo ""

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo "❌ psql not found. Please install PostgreSQL client:"
    echo "   macOS: brew install postgresql"
    echo "   Or apply via Supabase Dashboard SQL Editor"
    echo ""
    echo "Dashboard URL: https://supabase.com/dashboard/project/ssesqiqtndhurfyntgbm/sql"
    exit 1
fi

# Database connection details
DB_HOST="db.ssesqiqtndhurfyntgbm.supabase.co"
DB_PORT="5432"
DB_NAME="postgres"
DB_USER="postgres"

echo "📊 Connecting to Supabase database..."
echo "Host: $DB_HOST"
echo ""

# Prompt for password
echo "Enter your Supabase database password:"
echo "(Find it in: Dashboard > Settings > Database > Connection String)"
read -s DB_PASSWORD

echo ""
echo "🚀 Executing migration..."
echo ""

# Apply migration
PGPASSWORD="$DB_PASSWORD" psql \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  -f "supabase/migrations/20260131_active_trades.sql"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Migration applied successfully!"
    echo ""
    echo "Created tables:"
    echo "  - active_trades"
    echo "  - trade_updates"
    echo "  - trade_notifications"
    echo ""
    echo "Next step: Setup cron job (see instructions below)"
else
    echo ""
    echo "❌ Migration failed. Please check the error above."
    exit 1
fi
