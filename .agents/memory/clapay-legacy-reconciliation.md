---
name: Clapay legacy reconciliation
description: Safely settle pre-upgrade payment metadata and ensure unresolved deposits do not starve reconciliation.
---

Missing fields in older Clapay deposit metadata must be reconstructed only from trusted initiation records: external deposit identity and the original wallet/FX ledger. Never take the expected amount from the callback or status response; never recalculate it using current exchange rates.

**Why:** Strengthening settlement checks can otherwise strand payments initiated before deployment. Older foreign-currency metadata does not contain the local amount, and the wallet amount alone cannot establish it.

**How to apply:** Keep legacy resolution shared by callbacks, polling, background verification and atomic settlement. Refuse ambiguous or missing FX evidence without marking the payment failed. Persist upgraded metadata during settlement. Reconciliation must rotate through stable keyset batches, because repeatedly querying the oldest pending rows lets unknown signatures or validation failures starve every later payment.