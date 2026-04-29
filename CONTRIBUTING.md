# Contributing Guidelines

Thanks for helping improve **Beatmap Backup**.

Contributions are welcome in any form — bug reports, feedback, or code. This guide helps make them easy to review and act on..

## Table of Contents

- [Quick Links](#quick-links)
- [Ways to Contribute](#ways-to-contribute)
- [Report a Bug](#report-a-bug)
- [Share Feedback (Non-bug)](#share-feedback-non-bug)
- [Feature Requests and Ideas](#feature-requests-and-ideas)
- [Issues vs Discussions](#issues-vs-discussions)
- [Pull Requests](#pull-requests)
- [Code Quality](#code-quality)
- [Questions?](#questions)

## Quick Links

- Issues: [https://github.com/vndarkblue/beatmap-backup/issues](https://github.com/vndarkblue/beatmap-backup/issues)
- Discussions: [https://github.com/vndarkblue/beatmap-backup/discussions](https://github.com/vndarkblue/beatmap-backup/discussions)
- Pull Requests: [https://github.com/vndarkblue/beatmap-backup/pulls](https://github.com/vndarkblue/beatmap-backup/pulls)
- Releases: [https://github.com/vndarkblue/beatmap-backup/releases](https://github.com/vndarkblue/beatmap-backup/releases)

## Ways to Contribute

- Report bugs and regressions
- Share UX/product feedback
- Suggest ideas and feature requests
- Join or start discussions
- Submit pull requests (docs, tests, bug fixes, features, refactors)

---

## Report a Bug

Open a GitHub issue and include enough detail for someone else to reproduce quickly.

### Bug report checklist

- Clear title
- What you expected vs what happened
- Reproduction steps (numbered)
- App version (`release tag` or commit)
- OS and environment (`Windows`/`Linux`, install type)
- Screenshots or logs when available
- Whether this worked before (possible regression)

### Bug report template

```md
## Summary

Short description of the bug.

## Steps to Reproduce

1. ...
2. ...
3. ...

## Expected Behavior

...

## Actual Behavior

...

## Environment

- App version:
- OS:
- Install type:

## Extra Context

Screenshots, logs, related issues, etc.
```

## Share Feedback (Non-bug)

Use feedback when behavior is technically correct but can be improved (UX copy, workflow friction, defaults, clarity).

Good feedback includes:

- What you were trying to do
- What felt confusing or slow
- What outcome you expected
- Optional suggestion (if you have one)

If you are unsure whether it is a bug or feedback, open an issue anyway and mark it as a question.

## Feature Requests and Ideas

For new features or larger changes:

- Start with a Discussion if scope is unclear or has trade-offs.
- Open an Issue if the request is concrete and actionable.

Useful details:

- User problem being solved
- Why current behavior is insufficient
- Proposed behavior (minimal version first)
- Risks/trade-offs (performance, compatibility, complexity)

## Issues vs Discussions

- Use **Issues** for actionable work items (bug, task, concrete feature request).
- Use **Discussions** for open-ended topics (brainstorming, design options, Q&A).

---

## Pull Requests

### Before you start

- Prefer small, focused changes.
- For larger work, open an issue or discussion first to align on scope.
- Base your branch from the default branch.

Branch naming examples:

- `fix/download-timeout`
- `feat/backup-summary`
- `docs/contributing-update`
- `chore/test-cleanup`

### Before opening a PR

Run locally:

- `npm run lint`
- `npm run typecheck`
- `npm test`

Then do a quick smoke test for touched flows:

- **Settings**: update settings and confirm persistence after reload.
- **Backup**: create a small `.bbak` and verify it can be reused.
- **Download**: run a small queue and confirm completion without broken artifacts.

If something cannot be validated locally, note it explicitly in the PR.

### PR description checklist

- What changed
- Why it changed
- Scope boundaries (what is intentionally not included)
- How it was tested
- Screenshots or GIF for UI changes
- Breaking change or migration notes (if any)

---

## Code Quality

### Keep it simple

- Prefer direct, understandable solutions over premature abstractions.
- Extract abstractions only when there are at least two real use-cases.
- Avoid adding new dependencies unless they clearly reduce complexity.

### Constants placement

- Put shared constants in `src/config/sharedConstants.ts` only when both backend and frontend need them.
- Put backend-only constants in `src/config/backendConstants.ts` (for example server port, backend route bindings, window config).
- Put frontend-only constants in `src/config/frontendConstants.ts` (for example storage keys, UI timing, fetch headers, UI defaults).
- Avoid repeating hardcoded literals that already exist in these files; import the named constant instead.

### `eslint-disable` policy

`eslint-disable` is allowed only as a last resort:

- Fix root causes first when possible.
- Scope disable comments as narrowly as possible.
- Add a short reason comment.
- Prefer specific rule disables over broad disables.

Unjustified disables may be requested to be removed in review.

### Large changes and refactors

For larger behavior changes:

1. Define boundaries clearly.
2. Add or update targeted tests and smoke-test affected flows.
3. Document migration impact for persisted data or behavior.

Prefer incremental PRs over big-bang refactors.

---

## Questions?

If anything is unclear, open a Discussion or ask directly in your PR or issue.
