# OKClip — Working Rules

## Communication
- All code, comments, commit messages, and documentation MUST be in **English**
- Chat between us can be in **Indonesian** as needed
- Be concise. No unnecessary commentary.

## Commits
- Every **completed task** MUST be committed immediately
- One semantic change = one commit (e.g., `feat: add clip engine`)
- **Do NOT** commit for tiny tidy-ups (whitespace, typos, renaming)
- Bundle minor tidy-ups with the nearest meaningful commit
- Commit message format: `type: description`
  - `feat:` — new feature
  - `fix:` — bug fix
  - `refactor:` — code restructuring
  - `style:` — formatting only (use sparingly)
  - `docs:` — documentation
  - `chore:` — config, dependencies

## Code Quality
- TypeScript — strict mode
- No `any` types unless absolutely necessary
- Functions under 50 lines where possible
- No commented-out code
- No console.log in production code (use proper logging)

## Task Tracking
- See `TASKS.md` for current status
- Task states: `pending` → `in_progress` → `done`
- When stuck on a task for >30 min, flag it and move on
