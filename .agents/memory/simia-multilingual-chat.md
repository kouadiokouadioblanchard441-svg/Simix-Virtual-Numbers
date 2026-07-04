---
name: SIMIA multilingual support chat
description: How the AI support chatbot (SIMIA) auto-detects and switches languages, and lessons for prompting multilingual LLM behavior.
---

## Approach
Language handling for the AI support chatbot lives entirely in the system prompt sent to the model (OpenAI/Gemini/Groq/OpenRouter) — the model itself detects the user's language from their latest message and responds in kind. A small heuristic (`detectLanguage` in `support.ts`, script-based + stopword scoring for ~10 languages) only feeds a *hint* into the prompt and persists the conversation's current language for analytics/scripted-fallback; it never overrides the model's own judgment.

## Why not hard-code a language switch (e.g. `language === "en" ? ... : ...`)
That pattern actively breaks multilingual support: any message not exactly "en" falls into the French branch, so a bilingual/multilingual bot ends up defaulting to French for Spanish, Portuguese, Arabic, etc. Prefer a single generic instruction telling the model to detect and mirror the user's language on every turn, listing example languages but explicitly allowing "any language you understand."

## Non-obvious prompting lesson: models will narrate language switches unless told not to
When a user switches language mid-conversation, LLMs (tested with Groq llama-3.3-70b-versatile) tend to add commentary like "I see you're switching to English" / "ah, agora você está falando português" — often *in the wrong language* (e.g., commenting in French while claiming to switch to English, and then not actually switching). This must be explicitly and forcefully forbidden in the system prompt (ban specific example phrasings), and the instruction must say the reply must be 100% in the new language "from the first word," or the model will hedge.

## Provider rate limits
This project's default AI provider is Groq (not OpenAI), with a shared 12,000 tokens/minute org-wide limit — easy to hit with back-to-back testing since each request re-sends the full system prompt (knowledge base + user context + long instructions) as input tokens. Space out manual test calls (~15-20s) to avoid 429s that look like bugs but are just quota exhaustion.
