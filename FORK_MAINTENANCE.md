# Personal fork maintenance

This repository preserves the implementation of [upstream issue #14801](https://github.com/can1357/oh-my-pi/issues/14801), originally contributed in [PR #14805](https://github.com/can1357/oh-my-pi/pull/14805).

- **Lean PR CI:** [`.github/workflows/fork-verify.yml`](.github/workflows/fork-verify.yml) runs TypeScript and fork regression checks on a GitHub-hosted Linux runner, without requiring upstream's `omp-kata` runners or publishing packages. Routine PR checks are independent of the upstream CI and binary release workflows.

## Features

- **Configurable status-line usage refresh:** `statusLine.usageRefreshInterval`, 60–86400 seconds (default 300), affects the display and usage-report freshness without extending the auth recovery windows.
- **Official stable-release sync:** [`.github/workflows/fork-sync.yml`](.github/workflows/fork-sync.yml) checks `can1357/oh-my-pi`'s **latest published stable GitHub Release** on manual dispatch only while the v18.14.1 synchronization PR awaits verification. Automatic polling is intentionally paused to avoid repeated conflict runs. It fetches the official release **tag**, never `upstream/main`. Drafts, prereleases, and non-stable version tags are rejected.
- **Safety and verification:** The sync merges without force-pushing, checks the fork feature is still present, runs TypeScript validation and the fork's relevant regression tests, then pushes `main`. Conflicts or test failures leave `main` unchanged. Failures are visible in GitHub Actions and its run summary (Issues are disabled on this fork).
- **On-demand release:** [`.github/workflows/fork-binaries.yml`](.github/workflows/fork-binaries.yml) tests and builds Linux x64, macOS arm64 and Windows x64 on native hosted runners; a stable fork GitHub Release is created **only after all three pass**. GitHub generates source ZIP/TAR.GZ for that release.

## How to use

1. In the fork's GitHub **Actions** tab, enable workflows if prompted.
2. Enable **Read and write permissions** under **Settings > Actions > General > Workflow permissions** where GitHub permits it.
3. Recommended for unattended syncs that include upstream workflow-file changes: create an Actions secret named `FORK_SYNC_TOKEN`, containing a fine-grained PAT scoped only to this repository with **Contents: read/write** and **Workflows: read/write**. Without it, the built-in `GITHUB_TOKEN` is used; pushes that update `.github/workflows` may fail due to missing workflow-write permission. Do not commit the token to the repository.
4. Run **Verify maintained fork** on the `sync/official-v18.14.1` branch, confirm all checks pass and merge PR #10 before running **Sync official stable releases**. There is no automatic schedule while sync is being repaired; after verification it may be restored at a low daily cadence. The upstream CI, nightly Nix, warm-cache and push-triggered binary publishing have no automatic triggers on this fork.
5. After a successful merge, the workflow dispatches **Build and publish fork binaries**; installing or updating `omp-mp` pulls this fork's latest verified GitHub Release, not the upstream npm package.
6. If a merge conflict or test failure occurs, inspect the failed Actions run and resolve the conflict in a branch/PR. Do not force-push over custom fork changes.

## Versions and compatibility

Official releases have tags such as `v18.13.3`. The fork's published binaries use tags such as `v18.13.3-mp.1` (upstream 18.13.3, personal fork revision 1), with sequential fork revisions `mp.2`, `mp.3`, etc. The commit hash is recorded in release notes, not the tag. A CI rerun for the same commit reuses its tag. Releases include independently smoke-tested executables and GitHub's source archives; they do not publish to npm.

**Existing history:** Changing the sync policy does not remove development commits already merged into the fork. Future automatic upstream merges are limited to the official stable release tag.
