---
name: AI token balance visibility
description: Honest balance and health reporting for OpenAI and Anthropic token pools.
---

Do not promise a monetary credit balance for every OpenAI or Anthropic API token. Their inference APIs may validate a token and return quota/rate-limit headers without exposing the account's cash balance.

**Why:** A successful balance dashboard must distinguish provider-reported money from operational health. Fabricating a numeric balance would mislead administrators; a minimal inference check can reliably detect valid, exhausted, rate-limited, or invalid credentials.

**How to apply:** Display monetary credit only when the provider explicitly returns it. Otherwise show “not communicated by provider,” plus the last verified status, remaining request/token limits, reset time, and safe error category.