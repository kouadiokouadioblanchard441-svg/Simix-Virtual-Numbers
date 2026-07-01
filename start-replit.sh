#!/bin/bash
export PORT=5000
export DATABASE_URL="${SUPABASE_DATABASE_URL:-$DATABASE_URL}"
node index.cjs
