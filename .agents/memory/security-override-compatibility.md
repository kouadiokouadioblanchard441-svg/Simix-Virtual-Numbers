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

If a security-required dependency removes an export needed by a build tool, adapt the consuming tool's import instead of lowering the protected minimum version.

**Why:** Even newer Orval releases still expected js-yaml's removed ESM default export. Updating the generator alone did not solve the compatibility problem, and weakening the security override was explicitly disallowed.

**How to apply:** Keep compatibility adapters local to the affected tool's execution, preserve the application's dependency behavior, and verify a second generation produces byte-identical output.