# Poison Callout: Execution Ledger

Plan: `docs/superpowers/plans/2026-10-10-poison-callout.md`
Branch: `feat/poison-callout`
Launcher: saved workflow `.claude/workflows/execute-plan.js` with args `{ plan, ledger }` (one fresh agent per batch, review gate after each)

The state of record. Update after every task, commit and push it with the task. Edit this file
with the Edit tool, not a shell heredoc.

## Batches

| Batch | Tasks | Status | Review |
|---|---|---|---|
| A | 1, 2 | pending | |
| B | 3, 4 | pending | |

Status values: `pending`, `in_progress`, `done`, `needs_chase` (done except items below), `blocked`.

## Task log

One entry per finished task, appended in order:

```
### Task N: <name>
- Done: <what was built, commits>
- Verified: <commands run and their result: test count, typecheck, CLI output>
- Deferred: <anything intentionally left, and why; "none">
- Next: <next task or "end of batch">
```

## Needs Chase

Items only Chase can supply. Add, never silently drop.

(none yet)

## Deviations from the plan

Any place the code had to differ from the plan's text, with the reason.

(none yet)
