# Install the miaopan607 fork as `omp-mp`

This is **not** the official `omp` installer. It uses binaries from
[miaopan607/oh-my-pi Releases](https://github.com/miaopan607/oh-my-pi/releases),
verifies their SHA-256 hashes and installs a separate `omp-mp` command.
It does **not** overwrite an existing `omp` installation.

## One-command install

macOS (Apple Silicon) or Linux (x86-64):

```sh
curl -fsSL https://raw.githubusercontent.com/miaopan607/oh-my-pi/main/scripts/fork/install.sh | sh
```

Windows x64, in PowerShell (no admin rights needed):

```powershell
irm https://raw.githubusercontent.com/miaopan607/oh-my-pi/main/scripts/fork/install.ps1 | iex
```

Open a **new terminal**, then run:

```sh
omp-mp --version
omp-mp
```

The Unix executable is installed under `~/.local/share/omp-mp/omp` with a
launcher at `~/.local/bin/omp-mp`. Ensure `~/.local/bin` is in `PATH`:

```sh
# Add to ~/.zshrc (macOS) or ~/.bashrc (bash) if needed:
export PATH="$HOME/.local/bin:$PATH"
```

Windows installs `%LOCALAPPDATA%\\Programs\\omp-mp\\omp.exe` and
`omp-mp.cmd` side-by-side, adding this directory to **user PATH only**.

Other platforms such as macOS Intel and Linux ARM64 are not included in the
current fork binary Release; the installer refuses unsupported architectures.

## Fork-specific configuration, sharing official data

The launcher does not change `OMP_PROFILE` or `PI_CODING_AGENT_DIR`.
For the **default profile**, the program continues to read **the official**
`~/.omp/agent/config.yml` (or `config.yaml`) and the same credentials,
sessions and agent database as regular `omp`.

It additionally loads this fork-only overlay **after** official global and
project settings:

- macOS and Linux: `~/.omp-mp/config.yml`
- Windows: `%USERPROFILE%\\.omp-mp\\config.yml`

The installer creates that file with `{}` if it does not already exist.
You can override only the settings that are different for the fork:

```yaml
statusLine:
  usageRefreshInterval: 60
  preset: full
```

Other settings continue to come from the official installation; the official
`omp` command ignores this overlay completely. The launcher appends the
overlay to `PI_CONFIG_FILES` (which supports multiple platform-delimited YAML
paths) and preserves any existing entries. An explicit `--config` flag can
still override it for a single invocation.

**Important write behavior:** `omp-mp config set` and interactive
`/settings` retain the upstream default behavior: they write to the shared
official global config. To change a **fork-only override**, edit
`~/.omp-mp/config.yml` instead; run `omp-mp --fork-config` to print its
location. This prevents the fork installer itself from overwriting official
settings, but does **not** claim in-app setting changes are isolated.

Named profiles (`--profile work` / `OMP_PROFILE=work`) naturally select
the official *named* profile; this is not a copy of the default profile.
Project-level `.omp/config.yml` is still read as usual and the fork overlay
wins when keys conflict.

## Updates

```sh
omp-mp --fork-update
```

Check once daily in the operating system's scheduler:

```sh
omp-mp --fork-auto-update
```

The Unix installer registers a cron entry for 03:17 (requires `crontab`);
Windows registers a **per-user Task Scheduler** entry for 03:17. These are
opt-in and may not run when the computer is asleep/offline. In that case just
invoke `omp-mp --fork-update`.

A new Release is eligible for installation **only after all three binary
builds succeed**. The source-release job marks source-only builds as GitHub
prereleases; the binary job promotes the Release to stable after uploading
Linux, macOS, Windows and `SHA256SUMS.txt`. The installer reads GitHub's
`/releases/latest` stable endpoint and checks the file digest before replacing
an existing binary. If an update fails it keeps the previous executable.

If the local updater cannot replace a file (e.g. Windows is running an
`omp-mp` process), close it and retry.

### Trust model

The installer is a script executed from this GitHub repository. Review it
before running it, especially before using a pipe into `sh`/`iex`.
Downloaded executables are checked against this fork's **published**
`SHA256SUMS.txt`, which detects incomplete or mismatched downloads but
does **not** provide independent verification of the publisher's trust.
