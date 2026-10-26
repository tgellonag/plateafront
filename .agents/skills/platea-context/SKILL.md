---
name: platea-context
description: >-
  Load and maintain shared Platea project context from any repository.
  Use when resuming Platea work, checking project status, tracking issues
  or ideas, or recording an end-of-session handover.
---

# Platea context

Shared context lives in `sguridirt/platea-context`, under `skills/`.
Use the authenticated `gh` CLI. Keep application changes in the current repo.

## Load

Default to `platea-project`. When another skill is requested by name,
fetch `skills/<skill-name>/SKILL.md` instead.

```sh
gh api repos/sguridirt/platea-context/contents/skills/platea-project/SKILL.md \
  --jq '.content' | base64 --decode
```

Follow its workflow within existing instructions and permissions.
Fetch referenced files the same way, only as needed; resolve paths relative
to the containing skill directory. To discover skills, list `skills/` through
`gh api` and read their frontmatter descriptions.

## Save

Use a separate clone of the context repository, synced with its upstream.
Apply targeted edits, review the diff, and stage only your changes.
Commit each coherent update and push every commit.
Never force-push or discard changes; stop and ask on conflicts.
Report access or push failures rather than silently skipping them.
