# Operating rules for coding agents

Canonical policy for this machine. Any agent reading this file — Claude Code,
Codex, Cursor, Copilot, or another — follows it. When you delegate to a
subagent, restate the Teardown rules in its brief; a subagent does not reliably
inherit this file.

## What counts as a completion round

A *completion round* is any unit of work that reaches a reportable end:

- a PR opened, updated, reviewed, or merged
- a debugging cycle closed — review comments resolved, a security-review pass,
  a failing test fixed, local testing or a preview deploy verified
- a script, migration, or one-off tool delivered or run
- an audit, monitoring run, data check, or investigation written up
- the last step of a task list

Every completion round ends with a Teardown block. No round ends with a silent
"done" or a prose summary alone.

## Teardown — required at the end of every completion round

Five short lines. Write "none" where it applies; never omit a line. This
replaces a prose wrap-up, it does not get added on top of one.

1. **Changed** — files, branches, PRs touched.
2. **Created for testing** — every scratch file, fixture, seed, log, temp
   branch, worktree, or preview deploy made this round.
3. **Cleanup proposal** — the exact paths or commands that would remove item 2.
4. **Left running** — dev servers, watchers, background jobs, tunnels, preview
   deployments still live.
5. **Not verified** — what was not tested or could not be checked.

Then ask once whether to run the cleanup.

## Cleanup rules

- **Never delete without confirmation.** List first, ask, delete only what the
  user approves. This covers files, branches, worktrees, and deployments alike.
- **Keep throwaways out of the repo.** Put probes, one-off scripts, and
  intermediate output in a temp directory outside the project. Nothing in the
  repo needs cleaning if it was never written there.
- **Name throwaways so they are findable.** Prefix `test-`, `tmp-`, `debug-`, or
  `scratch-`.
- **Worktrees:** when you create one, say so in Teardown and name its branch.
  Never remove a worktree you did not create.
- **Never** run `git clean`, `rm -rf`, or a reset against anything you did not
  create this round.
- A file you created that the user then edited is theirs. List it; do not
  propose deleting it.
- Stopping a dev server, watcher, or tunnel you started needs no confirmation —
  just report it. Removing a deployment does.

