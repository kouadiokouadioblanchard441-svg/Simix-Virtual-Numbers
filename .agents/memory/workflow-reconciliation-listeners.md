---
name: Workflow reconciliation listeners
description: Avoid changing artifact ports when task merges leave an older server running outside the current workflow tracker.
---

Check for an older listener before changing ports after workflow reconciliation. Restart the exact managed artifact workflow; do not create replacement servers or change its assigned port to bypass a conflict.

**Why:** Multiple task merges left older frontend and API processes alive while reconciliation launched new copies. The frontend failed with an occupied port even though its older server was still responding, and the sandbox silently selected another port.

**How to apply:** Verify the conflicting process belongs to the same artifact and intended port before stopping a stale copy. Preserve unrelated services and the main preview. Confirm the managed workflow comes back on its assigned port.