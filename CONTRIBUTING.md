## Contributing Guidelines

Thank you for contributing to **Beatmap Backup**! This document sets some lightweight guardrails so changes stay small, reviewable, and safe for users.

If anything here is unclear or feels too strict for your use case, feel free to open an issue or discuss it in your pull request.

## Workflow

- **Keep changes small and focused**
  - Prefer a few small PRs over one very large PR.
  - Each PR should have a clear, single goal (e.g. \"fix download error handling\", \"tweak backup UX copy\").
- **Branching**
  - Base off the default branch.
  - Use descriptive branch names, e.g. `feat/backup-summary`, `fix/download-timeout`, `chore/lint-cleanup`.
- **Before opening a PR**
  - Make sure the app still builds and runs.
  - Manually exercise the flows you touched (see \"Smoke tests\" below).

## Pre-PR Checklist

Run these commands locally before requesting review:

- `npm run lint`
- `npm run typecheck`

For changes that affect core flows, also do a quick smoke test:

- **Settings**: open the Settings page, adjust one or two options, and confirm they are saved and reloaded correctly.
- **Backup**: run a small backup and confirm the `.bbak` file is created and can be loaded again.
- **Download**: start a small download queue and confirm tasks progress and finish without leaving broken `.osz` or `.part` files behind.

If any checklist item cannot be satisfied (e.g. temporary platform limitation), explain why in the PR description.

## `eslint-disable` Policy

`eslint-disable` is allowed, but only as a last resort and with clear intent:

- Prefer **fixing the underlying issue** (types, unused variables, missing null checks) instead of disabling rules.
- If you must disable a rule:
  - Scope it as narrowly as possible (single line or small block).
  - Add a short comment explaining why it is required.
  - Prefer disabling a specific rule (e.g. `@typescript-eslint/no-explicit-any`) instead of turning off many rules at once.
- When touching a file that already has `eslint-disable`, consider whether you can safely remove or narrow it as part of your change.

New `eslint-disable` entries without justification may be requested to be fixed or reverted during review.

## Abstractions and Over-Engineering

We prefer simple, direct solutions over generic abstractions:

- Only extract new abstractions when there are **at least two real use-cases** or a very clear upcoming need.
- Avoid introducing new top-level modules or packages unless they clearly reduce complexity.
- Keep naming aligned with domain intent (e.g. `DownloadQueue`, `BackupEstimate`) instead of overly generic names.

When in doubt, favour a straightforward implementation first. We can extract abstractions later once patterns become clear.

## Refactors and Large Changes

For larger refactors or behavior changes, follow three steps:

1. **Boundary** – Make the boundary explicit (e.g. add a clear service API, or centralize a concept such as download queue persistence).
2. **Tests / Smoke tests** – Add or update targeted tests where possible, and always run smoke tests for affected flows.
3. **Migration** – Plan how existing behavior or data will migrate, especially for backup formats or persisted state.

Avoid \"big bang\" refactors that touch many flows at once. Prefer incremental, reviewable milestones that can be merged independently.

## Simplicity as a Default

When reviewing or writing code:

- Prefer the simplest approach that is correct and easy to reason about.
- Avoid introducing configuration or options that do not solve a concrete user problem.
- Keep cross-cutting concerns (logging, configuration, telemetry) small and clearly owned, instead of spreading them across many modules.

If a trade-off is non-obvious, document it briefly in the PR description so future contributors understand the intent behind the change.

