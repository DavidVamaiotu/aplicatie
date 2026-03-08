# Repository Instructions

## Mandatory Workflow
- On every new thread, read `progress.md` at the repository root before any planning, analysis, or edits.
- If `progress.md` does not exist yet, create it during the first code-changing task and keep it at the repository root.
- Read `progress.md` again immediately after any context compaction before continuing.
- Update `progress.md` immediately after every code modification. Do not leave code changes undocumented until the end of the task.
- Refresh `progress.md` before the final handoff so it matches the current repository state.

## `progress.md` Content
- Record the current objective and active subtask.
- Record each changed file and why it changed.
- Record validation already run, including commands and results.
- Record open issues, follow-ups, and anything the next agent must verify.

Use this shape unless `progress.md` already has a better repository-specific structure:

```md
# Current Task
- <active goal>

# Recent Changes
- <file>: <what changed and why>

# Validation
- <command>: <result>

# Next Steps
- <remaining work or `None`>
```

## Editing Rules
- Keep `progress.md` entries short, factual, and repository-specific.
- Prefer replacing stale bullets over appending an unbounded history.
- Use repository-relative paths in `progress.md`.
- If no code changed in a turn, do not invent a `progress.md` update only to satisfy the workflow.

## Skills
- `skills/progress-md-memory/SKILL.md`: use this as the detailed workflow source for the `progress.md` process above.
- `skills/wpbooking-vite-react/SKILL.md`: use this for tasks involving the Vite React frontend, Firebase booking flow, or WordPress booking bridge.
- `skills/model-router/SKILL.md`: use this when the task is primarily about choosing the right model or reasoning level.
