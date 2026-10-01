---
name: Security override compatibility
description: Preserve transitive dependency API compatibility when applying vulnerability overrides.
---

Use parent-scoped overrides when older and newer consumers require incompatible export shapes; do not force one patched major on every consumer.

**Why:** Older minimatch expects brace-expansion to export a callable function, while newer brace-expansion exports a named function. A production build can pass without exercising that older glob path.

**How to apply:** For dependency security updates, test representative calls through both older and newer consumers and choose patched releases compatible with each. Bound security overrides to the intended major so future installs do not introduce unrelated major upgrades.

After merging dependency changes, validate the lockfile with the package manager and a frozen installation, not just a vulnerability scanner.

**Why:** A merge can duplicate YAML keys while installed-package scans still report no vulnerabilities. Existing node_modules and successful builds do not prove that a fresh install can consume the committed lockfile.

**How to apply:** Check strict lockfile parsing and frozen installation against the final merged tree before declaring dependency remediation complete.