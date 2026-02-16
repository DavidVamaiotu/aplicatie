---
name: model-router
description: Use this when the user is starting a task and wants the best Codex model and reasoning level chosen for planning, implementation, debugging, refactoring, or quick Q&A. This skill does not write code; it selects model settings and gives exact switch instructions.
---

## Goal
Pick the best model and reasoning effort for the user's next step (planning, implementation, debugging, refactor, or quick Q&A).

## How to run
1. Ask one question only if user intent is unclear: whether the user is planning or implementing right now.
If intent is clear, ask no question.

2. Classify the task into exactly one mode:
- PLAN: requirements, architecture, milestones, edge cases, `Plans.md`
- IMPLEMENT: writing features, refactors, adding files
- DEBUG: errors, failing tests, unexpected behavior
- FAST-ITERATE: tiny edits, quick fixes, short loops

3. Recommend model and reasoning effort:
- Model: prefer `gpt-5.3-codex`; use `gpt-5.3-codex-spark` only for near-instant iteration and text-only work.
- Reasoning effort: `xhigh` or `high` for PLAN, `high` for IMPLEMENT/DEBUG, `medium` for FAST-ITERATE.

4. Output a short `Switch instructions` block with exactly:
- `Run /model and select: <model>`
- `Set reasoning effort to: <effort>`
- `Verify with /status`

5. Output `Next prompt to paste` as one paragraph the user can paste immediately after switching.
