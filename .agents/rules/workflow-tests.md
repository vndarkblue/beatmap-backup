---
trigger: glob
globs: tests/**/*.ts,vitest.config.ts,package.json
---

# Workflow & Testing Verification Rules

All codebase modifications must be rigorously verified before reporting completion to the user.
Never hand over code without executing corresponding verification steps.

## 1. Standard Commands & Pass Criteria

The user's default shell environment is **PowerShell on Windows**.

| Objective                       | Command                         | Pass Criteria                                                     |
| :------------------------------ | :------------------------------ | :---------------------------------------------------------------- |
| **Linting Check**               | `npm run lint`                  | 0 errors. No new warnings introduced.                             |
| **Typecheck (Comprehensive)**   | `npm run typecheck`             | Passes both `typecheck:node` (`tsc`) and `typecheck:web` (`vue-tsc`). |
| **Run Specific Test**           | `npx vitest run <path_to_test>` | All assertions in the test suite pass.                            |
| **Run All Tests**               | `npm run test`                  | Executes all test files across `tests/`.                          |
| **Run Tests with Coverage**     | `npm run test:coverage`         | Passes all minimum thresholds declared in `vitest.config.ts`.     |
| **Comprehensive Final Check**   | `npm run check`                 | Sequential run of `lint` + `typecheck` + `test:coverage`.         |

## 2. Hard Code Coverage Thresholds

`vitest.config.ts` enforces mandatory minimum thresholds for critical modules:

- `src/config/beatmapMirrors.ts`: Statement ≥ 95%, Branch ≥ 95%
- `src/services/beatmapMirrorService.ts`: Statement ≥ 90%, Branch ≥ 75%
- `src/services/database/databaseService.ts`: Statement ≥ 85%, Branch ≥ 57%
- `src/services/download/queuePersistence.ts`: Statement ≥ 90%, Branch ≥ 85%
- `src/services/download/httpDownloader.ts`: Statement ≥ 60%, Branch ≥ 40%
- `src/services/downloadService.ts`: Statement ≥ 25%, Branch ≥ 20%
- `src/main/pathGuards.ts`: Statement ≥ 87%, Branch ≥ 84%

> [!WARNING]
> If you modify logic in any of the modules listed above, **you must write or update corresponding tests**
> in `tests/` to prevent coverage regression below required thresholds. Never reduce threshold percentages
> in `vitest.config.ts` to bypass checks.

## 3. Handling Native Module ABI Mismatches

When running tests in local host Node.js (e.g., Node 22 - ABI 137), native C++ addons (`better-sqlite3`, `realm`)
are compiled against the Electron 35 ABI (`NODE_MODULE_VERSION 133`).

- **Symptoms**:
  - Running `npm run test` may report a `NODE_MODULE_VERSION mismatch` in tests that load native binaries directly:
    `databaseService.test.ts` and `beatmapFilter.test.ts`.
  - All other tests (pathGuards, download, mirrors, i18n, export, fileUtils, parser utils...) run 100% cleanly.
- **Handling Rules**:
  - Never delete the `postinstall` script or uninstall `better-sqlite3`.
  - For tasks not modifying SQLite C++ bindings, run the test suites directly targeted at the active feature
    (e.g., `npx vitest run tests/services/pathGuards.test.ts`).
  - In the completion summary, state test execution status clearly and document ABI mismatch limitations if
    native database tests could not run on the host Node environment.

## 4. Step-by-Step Verification Sequence

Prior to concluding a task:

1. **Format**: Run `npx prettier --write <modified_files>` to conform to project style.
2. **Lint**: Run `npm run lint`. Resolve all newly introduced syntax and type errors.
3. **Typecheck**: Run `npm run typecheck`. Confirm both Vue and Node code pass with zero TypeScript errors.
4. **Test**: Run unit tests for modified modules. If modifying code under coverage enforcement, run `npm run test:coverage`.
5. **i18n (if UI modified)**: Run `npx vitest run tests/renderer/i18n.test.ts`.
6. **Aggregate**: Run `npm run check` (if fully supported by host environment) or report step results in detail.

## 5. Git Commit Protocol

When the agent is tasked with or considers performing a Git commit (`git commit`):

1. **No Automatic/Silent Commits**: Never run `git commit` without explicit prior confirmation from the user.
2. **Present Commit Message**: Clearly display the proposed commit message (conventional format title and bulleted summary) in the response for user review.
3. **Await User Approval**: Only execute `git commit` after the user has approved the proposed message.
