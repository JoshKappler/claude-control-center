# CLAUDE.md — Claude Control Center (FleetView)

Guidance for Claude Code working in this repo. Read before changing anything.

## What this is

A terminal control center (Node ESM `.mjs`, zero npm deps, raw ANSI) that launches
and monitors multiple Claude Code agents and does one-button GitHub sync across every
repo under the projects root. It launches N agents into the SAME folder via `zellij`
panes (one shared working tree), and `git-push-all.mjs` / `clone-all.mjs` /
`sync-daemon.mjs` push/pull each repo on its current branch. See `README.md`.

## Git workflow — the hard default (this repo AND every repo it touches)

Because this tool runs several agents in ONE shared working tree, branch games are how
they clobber each other. So:

- One branch only: the repo's primary branch on `origin` (this repo: `master`; most
  repos: `main`). Commit there, push there. That is the whole model.
- NEVER create git worktrees. NEVER `git checkout`/`switch` to another branch, create
  feature branches, or change which branch is primary. Multiple agents must not move
  the working tree out from under each other.
- NEVER `reset --hard`, force-push, or rewrite published history.
- Done + builds/tests pass → `git add -A && git commit && git push` to origin. Behind?
  `git pull --ff-only`. Keep it the most basic GitHub setup possible.
- Deviate only when Josh explicitly says so for a specific task.

## Conventions

User preferences live in the global `~/.claude/CLAUDE.md`: build from scratch over
frameworks, get to working code fast, commit/push without asking once it builds, skip
trailing "what I changed" summaries. Keep this tool dependency-free (Node built-ins
only) and every script self-locating.
