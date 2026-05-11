#!/bin/bash
# Simix — Production start script for Plesk
# Run: bash start.sh
# All environment variables must be set in Plesk before running.
# DB migrations run automatically on each startup (idempotent).

set -e

export NODE_ENV=production

echo "Starting Simix (migrations will run automatically)..."
exec node --enable-source-maps dist/index.cjs
