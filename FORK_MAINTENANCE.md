# Personal fork maintenance

This repository preserves the implementation of [upstream issue #14801](https://github.com/can1357/oh-my-pi/issues/14801), originally contributed in [PR #14805](https://github.com/can1357/oh-my-pi/pull/14805).

## Features

- **Configurable status-line usage refresh:** `statusLine.usageRefreshInterval`, 60–86400 seconds (default 300), affects the display and usage-report freshness without extending the auth recovery windows.
- **Upstream sync:** `.github/workflows/fork-sync.yml` checks `can1357/oh-my-pi:main` daily and can be manually dispatched. It merges upstream (never force-pushes), checks that the fork feature is present, runs TypeScript checks, and only then updates `main`.
- **Auto release:** `.github/workflows/fork-binaries.yml` tests and builds Linux x64, macOS arm64 and Windows x64 on native hosted runners; a stable GitHub Release is created **only after all three pass**. GitHub generates source ZIP/TAR.GZ for that release.

## How to use

1. In the fork's GitHub **Actions** tab, enable workflows if prompted.
2. Run **Build and publish fork binaries** from Actions (or push a code change to main); the workflow creates one complete stable release after all binaries pass.
3. Run **Sync upstream safely** to check for upstream updates immediately, or rely on its daily schedule.
4. If a merge conflict or validation failure occurs, the sync leaves `main` unchanged and creates/updates an issue. Resolve the conflict in a regular branch and pull request instead of force-updating `main`.

GitHub Actions must have permission to write repository contents. Repository Settings > Actions > General > Workflow permissions should allow **Read and write permissions** (subject to your account/org settings).

## Versions and compatibility

Fork releases use SemVer tags such as `v18.13.2-mp.1` (upstream 18.13.2, personal fork revision 1), with sequential fork revisions `mp.2`, `mp.3`, etc. The commit hash is recorded in release notes, not the tag. A CI rerun for the same commit reuses its tag. Automatic merges may pause on conflicts; never force-push to bypass them. Releases include independently smoke-tested executables and GitHub's source archives; they do not publish to npm.
