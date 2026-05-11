#!/bin/bash
# Plesk deployment start script
# Usage: bash start.sh
# Make sure all env vars are set in Plesk environment before running.

export NODE_ENV=production

node --enable-source-maps dist/index.cjs
