#!/bin/bash
set -e
pnpm install --frozen-lockfile
# Use migrate (non-interactive) instead of push to avoid interactive prompts
# that block automated post-merge execution.
pnpm --filter db migrate
