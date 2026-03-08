---
name: progress-md-memory
description: Use this when the user wants Codex to persist task status in a repository `progress.md` file, resume work reliably in a new thread, or recover context after compaction from a progress log. Trigger when requests mention `progress.md`, persistent progress tracking, resumable work logs, handoff notes, or mandatory status updates after code edits.
---

## Goal
Keep a concise repository-level `progress.md` file accurate enough for another Codex instance to resume work without rereading the full thread.

## Required Workflow
1. Read `progress.md` at the repository root at the start of every new thread before planning or editing. If the file does not exist, proceed and create it with the first code-changing task.
2. Read `progress.md` again immediately after any context compaction before continuing work.
3. Update `progress.md` immediately after every code modification. Do not leave code changes unrecorded until the end of the task.
4. Refresh `progress.md` before the final handoff so the file matches the current repository state.

## What To Record
- Current objective and active subtask.
- Files changed and the reason for each change.
- Validation already run, with commands and results.
- Open issues, follow-ups, and anything the next agent must check.

## File Shape
Use this structure unless the repository already has a better one:

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
- Keep entries short, factual, and specific to the repository.
- Prefer replacing stale bullets over appending an unbounded history.
- Use repository-relative paths in the log.
- If no code changed, do not invent a progress update only to satisfy the skill.
