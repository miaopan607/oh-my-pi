# Personal fork maintenance

This repository preserves the implementation of [upstream issue #14801](https://github.com/can1357/oh-my-pi/issues/14801), originally contributed in [PR #14805](https://github.com/can1357/oh-my-pi/pull/14805).

## Features

- **Configurable status-line usage refresh:** `statusLine.usageRefreshInterval`, 60–86400 seconds (default 300), affects the display and usage-report freshness without extending the auth recovery windows.
- **Upstream sync:** `.github/workflows/fork-sync.yml` checks `can1357/oh-my-pi:main` daily and can be manually dispatched. It merges upstream (never force-pushes), checks that the fork feature is present, runs TypeScript checks, and only then updates `main`.
- **Auto release:** `.github/workflows/fork-binaries.yml` validates `main`, builds native addons and compiled `omp` executables on Linux x64, macOS arm64 and Windows x64 GitHub-hosted runners, smoke-tests each binary, and uploads all three plus SHA256SUMS.txt only when the full matrix passes. `.github/workflows/fork-release.yml` also creates source archives independently.

## How to use

1. In the fork's GitHub **Actions** tab, enable workflows if prompted.
2. Run **Build and publish fork binaries** in the Actions tab for an initial verified binary release (or rely on a `main` push). The separate **Fork source release** only creates source snapshots.
3. Run **Sync upstream safely** to check for upstream updates immediately, or rely on its daily schedule.
4. If a merge conflict or validation failure occurs, the sync leaves `main` unchanged and creates/updates an issue. Resolve the conflict in a regular branch and pull request instead of force-updating `main`.

GitHub Actions must have permission to write repository contents. Repository Settings > Actions > General > Workflow permissions should allow **Read and write permissions** (subject to your account/org settings).

## Versions and compatibility

Fork releases use `fork-v<upstream package version>-<commit sha>` tags to avoid colliding with official releases. Automatic merging can pause when upstream changes conflict with the maintained patch; it does **not** guarantee that every upstream version will merge without intervention. GitHub binary Releases include validated platform executables when the matrix succeeds; a source-only Release may be present first if binary builds have not succeeded. No npm publication occurs.


## GitHub Actions authentication for upstream merges

GitHub's built-in `GITHUB_TOKEN` can push ordinary source changes, but **cannot push commits which introduce or modify `.github/workflows/*`**, even with `contents: write`. Official oh-my-pi routinely changes CI workflows. Without an additional token, daily upstream sync may report a permission error instead of advancing the fork.

For fully unattended upstream syncing, create a fine-grained personal access token on GitHub, restricted to **miaopan607/oh-my-pi**, with **Contents: Read and write** and **Workflows: Read and write**. Add it under the fork's **Settings → Secrets and variables → Actions → New repository secret** as `FORK_SYNC_TOKEN`. The sync workflow uses it only when provided, otherwise it falls back to the built-in token and reports failures through GitHub Issues. Never put the token in workflow source files or chat messages.

Release builds use GitHub's built-in token for uploading Release assets; this separate PAT is only for syncing upstream history that updates workflows.
