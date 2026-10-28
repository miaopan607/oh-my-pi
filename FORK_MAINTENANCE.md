# Personal fork maintenance

This repository preserves the implementation of [upstream issue #14801](https://github.com/can1357/oh-my-pi/issues/14801), originally contributed in [PR #14805](https://github.com/can1357/oh-my-pi/pull/14805).

## Features

- **Configurable status-line usage refresh:** `statusLine.usageRefreshInterval`, 60–86400 seconds (default 300), affects the display and usage-report freshness without extending the auth recovery windows.
- **Upstream sync:** `.github/workflows/fork-sync.yml` checks `can1357/oh-my-pi:main` daily and can be manually dispatched. It merges upstream (never force-pushes), checks that the fork feature is present, runs TypeScript checks, and only then updates `main`.
- **Auto release:** `.github/workflows/fork-release.yml` validates a `main` commit and creates a uniquely tagged GitHub release. It publishes **source archives only** (GitHub's generated .zip/.tar.gz); it does not claim to build or publish native executables.

## How to use

1. In the fork's GitHub **Actions** tab, enable workflows if prompted.
2. Run **Fork source release** from the Actions tab to make an initial release of the current fork.
3. Run **Sync upstream safely** to check for upstream updates immediately, or rely on its daily schedule.
4. If a merge conflict or validation failure occurs, the sync leaves `main` unchanged and creates/updates an issue. Resolve the conflict in a regular branch and pull request instead of force-updating `main`.

GitHub Actions must have permission to write repository contents. Repository Settings > Actions > General > Workflow permissions should allow **Read and write permissions** (subject to your account/org settings).

## Versions and compatibility

Fork releases use `fork-v<upstream package version>-<commit sha>` tags to avoid colliding with official releases. Automatic merging can pause when upstream changes conflict with the maintained patch; it does **not** guarantee that every upstream version will merge without intervention. A GitHub Release here means a validated source snapshot, not an npm publication.


## GitHub Actions authentication for upstream merges

GitHub's built-in `GITHUB_TOKEN` can push ordinary source changes, but **cannot push commits which introduce or modify `.github/workflows/*`**, even with `contents: write`. Official oh-my-pi routinely changes CI workflows. Without an additional token, daily upstream sync may report a permission error instead of advancing the fork.

For fully unattended upstream syncing, create a fine-grained personal access token on GitHub, restricted to **miaopan607/oh-my-pi**, with **Contents: Read and write** and **Workflows: Read and write**. Add it under the fork's **Settings → Secrets and variables → Actions → New repository secret** as `FORK_SYNC_TOKEN`. The sync workflow uses it only when provided, otherwise it falls back to the built-in token and reports failures through GitHub Issues. Never put the token in workflow source files or chat messages.

Release builds use GitHub's built-in token for uploading Release assets; this separate PAT is only for syncing upstream history that updates workflows.
