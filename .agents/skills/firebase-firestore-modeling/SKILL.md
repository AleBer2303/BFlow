---
name: firebase-firestore-modeling
description: >-
  Guides Firestore data modeling, offline persistence, security rules authoring,
  idempotent seeding, and Spark free-tier optimization under users/{uid}/...
  Use when working on src/data/, firestore.rules, or seed scripts.
---

# Firebase Firestore Modeling (`firebase-firestore-modeling`)

## 1. Collection Hierarchy (`users/{uid}/...`)

All user documents live strictly under `users/{uid}/`:
- `users/{uid}/concepts/{conceptId}`
- `users/{uid}/entries/{entryId}` (indexed by `monthKey`; deterministic ID `${monthKey}_${conceptId}` for non-repeatable concepts)
- `users/{uid}/debts/{debtId}`
- `users/{uid}/debtPayments/{paymentId}` (deterministic ID `${entryId}_${debtId}`)
- `users/{uid}/savingsBuckets/{bucketId}`
- `users/{uid}/provisionPlans/{planId}`
- `users/{uid}/monthSnapshots/{monthKey}`

## 2. Spark Plan Guardrails
- Always enable offline persistence (`initializeFirestore` with persistent local cache).
- Use `writeBatch(db)` when a single user action updates both an `entry` (e.g. completing `Cuota FUNFAMI`) and its linked `debtPayments`.
- Query `entries` scoped by `where('monthKey', '==', monthKey)`—never fetch all historical entries when rendering a single month.
- Use `monthSnapshots/{monthKey}` for multi-month charts (`1` document read per closed month).

## 3. Security Rules Validation
Whenever modifying `firestore.rules`:
1. Delegate authoring to the `firestore-rules-author` subagent (if available) or validate strictly:
   - `request.auth != null && request.auth.uid == uid`
   - Monetary fields (`plannedAmount`, `actualAmount`, `defaultAmount`, `openingBalance`) are integers (`is int` and `>= 0`).
   - `monthKey` matches `^\d{4}-(0[1-9]|1[0-2])$`.
   - `status` is `'pending'` or `'completed'`.
2. Run emulator integration tests to verify both allowed and denied operations.
