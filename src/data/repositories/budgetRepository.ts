/**
 * src/data/repositories/budgetRepository.ts
 *
 * Public entry point of the budget repository. The code lives in:
 * - `budgetRepositoryTypes.ts`: the `BudgetRepository` contract and its data shapes.
 * - `budgetRepositoryShared.ts`: helpers shared by both implementations.
 * - `firestoreBudgetRepository.ts`: Cloud Firestore (`users/{uid}/...`).
 * - `inMemoryBudgetRepository.ts`: deterministic in-memory version for tests.
 * - `accountHydration.ts`: pure steps of `loadFullCloudAccount`.
 */

export * from './budgetRepositoryTypes';
export {
  EMPTY_PROVISION_PLAN,
  ensureStandardSavingsBuckets,
  generateDataRevision,
} from './budgetRepositoryShared';
export { FirestoreBudgetRepository } from './firestoreBudgetRepository';
export { InMemoryBudgetRepository } from './inMemoryBudgetRepository';
