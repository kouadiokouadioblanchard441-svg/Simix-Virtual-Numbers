---
name: Validation registration
description: Replit validation registration also updates the parent workflow.
---

Registering a validation through `setValidationCommand` also adds it to the parent Project workflow in this environment. Inspect the resulting configuration before adding a parent reference yourself.

**Why:** Adding a reference manually after registration produced a duplicate execution.

**How to apply:** When extending the existing validation circuit, register the command first and check its parent linkage; preserve deployment and environment sections unchanged.