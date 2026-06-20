#!/bin/bash
# ============================================
# App — Quick Setup Script
# ============================================
# This script helps you set up the remaining infrastructure:
# 1. Supabase project + schema migration
# 2. Cloudflare Pages project
# 3. Environment variables
# ============================================

set -e

echo ""
echo "  ╭─────────────────────────────────────╮"
echo "  │     🔄 App Setup Script      │"
echo "  │  Build Recursively. Ship Infinitely. │"
echo "  ╰─────────────────────────────────────╯"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

check_tool() {
  if command -v "$1" &> /dev/null; then
    echo -e "${GREEN}✓${NC} $1 found"
    return 0
  else
    echo -e "${RED}✗${NC} $1 not found"
    return 1
  fi
}

echo -e "${CYAN}Checking prerequisites...${NC}"
echo ""

MISSING=0
check_tool "node" || MISSING=1
check_tool "pnpm" || check_tool "npx" || MISSING=1

echo ""

# ==========================================
# Step 1: Supabase Setup
# ==========================================
echo -e "${CYAN}━━━ Step 1: Supabase ━━━${NC}"
echo ""

if [ -z "$SUPABASE_URL" ] && grep -q "^SUPABASE_URL=$" .env.local 2>/dev/null; then
  echo -e "${YELLOW}⚠ Supabase not configured yet.${NC}"
  echo ""
  echo "To set up Supabase:"
  echo "  1. Go to https://supabase.com/dashboard"
  echo "  2. Create a new project (name: app)"
  echo "  3. Go to Settings → API"
  echo "  4. Copy the Project URL and anon/public key"
  echo "  5. Run the schema migration:"
  echo ""
  echo -e "     ${CYAN}# In the Supabase SQL Editor, paste:${NC}"
  echo "     supabase/migrations/001_initial_schema.sql"
  echo ""
  echo "  6. Update .env.local with your values:"
  echo "     SUPABASE_URL=https://your-project.supabase.co"
  echo "     SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIs..."
  echo ""
  echo -e "  ${YELLOW}Or paste your values now:${NC}"
  echo ""
  read -p "  SUPABASE_URL (or press Enter to skip): " SUPA_URL
  
  if [ -n "$SUPA_URL" ]; then
    read -p "  SUPABASE_PUBLISHABLE_KEY: " SUPA_KEY
    
    # Update .env.local
    sed -i '' "s|^SUPABASE_URL=.*|SUPABASE_URL=$SUPA_URL|" .env.local
    sed -i '' "s|^SUPABASE_PUBLISHABLE_KEY=.*|SUPABASE_PUBLISHABLE_KEY=$SUPA_KEY|" .env.local
    echo -e "  ${GREEN}✓ Supabase credentials saved to .env.local${NC}"
  else
    echo -e "  ${YELLOW}Skipped — you can set these later in .env.local${NC}"
  fi
else
  echo -e "${GREEN}✓ Supabase already configured${NC}"
fi

echo ""

# ==========================================
# Step 2: Auth Providers (Optional)
# ==========================================
echo -e "${CYAN}━━━ Step 2: OAuth Providers (Optional) ━━━${NC}"
echo ""
echo "To enable Google/GitHub OAuth login:"
echo "  1. In Supabase Dashboard → Authentication → Providers"
echo "  2. Enable Google: add Client ID + Secret from Google Cloud Console"
echo "  3. Enable GitHub: add Client ID + Secret from GitHub Developer Settings"
echo "  4. Set the redirect URL in each provider to:"
echo "     https://your-project.supabase.co/auth/v1/callback"
echo ""

# ==========================================
# Step 3: Verify
# ==========================================
echo -e "${CYAN}━━━ Step 3: Verification ━━━${NC}"
echo ""
echo "Running quality checks..."
echo ""

npx pnpm test 2>&1 | tail -3
echo ""

echo -e "${GREEN}━━━ Setup Complete ━━━${NC}"
echo ""
echo "Start the dev server with:"
echo -e "  ${CYAN}pnpm run dev${NC}"
echo ""
echo "Or with Docker:"
echo -e "  ${CYAN}docker compose up${NC}"
echo ""
