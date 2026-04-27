#!/bin/bash
set -e

REPO_URL="https://github.com/swarupd227/atlas-agent-platform.git"

if [ -z "$GITHUB_TOKEN" ]; then
  echo "❌  GITHUB_TOKEN secret not found. Make sure it is set in Replit Secrets."
  exit 1
fi

echo "→ Configuring GitHub remote..."
git remote remove github 2>/dev/null || true
git remote add github "https://${GITHUB_TOKEN}@github.com/swarupd227/atlas-agent-platform.git"

echo "→ Pushing to GitHub (this may take a moment for a large codebase)..."
git push github main --force

echo ""
echo "✅  Done! Your code is now on GitHub:"
echo "   https://github.com/swarupd227/atlas-agent-platform"
