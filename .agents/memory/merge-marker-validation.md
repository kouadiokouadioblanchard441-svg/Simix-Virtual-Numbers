---
name: Generated bundle conflict-marker validation
description: Conflict validation may flag separator comments inside regenerated JavaScript bundles.
---

When merge validation still reports markers in a regenerated bundle, check for separator comments as well as actual Git conflict markers.

**Why:** Bundled dependency comments containing long runs of equals signs can trigger the conflict check even when Git's marker syntax is absent.

**How to apply:** Distinguish actual Git marker syntax from dependency separator comments before concluding that source conflicts remain.