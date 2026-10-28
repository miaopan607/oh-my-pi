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
It is the **fork's writable global settings file**, not a read-only CLI overlay.
You can override only the settings that are different for the fork:

```yaml
statusLine:
  usageRefreshInterval: 60
  preset: full
```

Other settings continue to come from the official installation; the official
`omp` command ignores this fork file completely. The launcher sets
`OMP_MP_CONFIG_FILE` to enable the separate writable layer inside the Settings
store. `omp-mp config set`, `omp-mp config reset`, and interactive `/settings`
write **only** to the fork config; the official global config is read-only
when using `omp-mp`. After a fork-only value is reset/unset, the value from
the official config (or project settings) becomes effective again.

The normal project `.omp/config.yml` is still read. Precedence in fork mode is:
official global → project → fork writable global → explicit `PI_CONFIG_FILES`
or `--config` overlays → runtime overrides. Existing `PI_CONFIG_FILES`
entries are preserved without modification. An explicit `--config` file can
still override a value for one invocation but is never written.

The shared official **credentials, sessions and agent database** remain in the
official agent directory, so those are deliberately *not* isolated. Project
model-role writes in `modelRoleStorage: project` mode are likewise intentionally
project-scoped; only global settings writes are redirected.

Print the fork settings file location:

```sh
omp-mp --fork-config
```

Named profiles (`--profile work` / `OMP_PROFILE=work`) naturally select
the official *named* profile; this is not a copy of the default profile.
Project-level `.omp/config.yml` is still read as usual and the fork overlay
wins when keys conflict.

## Updates

The **built-in** updater now recognizes the private `omp-mp` installation and
checks **only** this fork's GitHub Releases, rather than upstream's npm packages
or build service. It compares the full `vX.Y.Z-mp.N` release tag recorded by
the fork installer, not just the upstream `omp --version` number.

```sh
omp-mp update --check  # Check the fork's latest stable Release
omp-mp update          # Update from this fork (macOS/Linux)
omp-mp update --force  # Reinstall the fork Release (macOS/Linux)
omp-mp --fork-update   # Manual update, all supported platforms
```

On Windows, `omp-mp update --check` works inside the application, but Windows
cannot overwrite an executable while it is running. `omp-mp update` therefore
prints the fork update command instead of attempting an unsafe replacement.
Close the `omp-mp` session and run `omp-mp --fork-update` from another
terminal. To force a verified reinstall on Windows, use
`omp-mp --fork-update --force`.

The fork publishes stable Releases only. It does not download the official
`omp` canary channel; `omp-mp update --canary` is rejected. The official
`omp update` command is unaffected and still updates the upstream installation.

Check once daily in the operating system's scheduler:

```sh
omp-mp --fork-auto-update
```

The Unix installer registers a cron entry for 03:17 (requires `crontab`);
Windows registers a **per-user Task Scheduler** entry for 03:17. These are
opt-in and may not run when the computer is asleep/offline. In that case just
invoke `omp-mp --fork-update`.

A new Release is eligible for installation **only after all three binary
builds succeed**. The binary job publishes one complete stable Release,
numbered `v<upstream version>-mp.<revision>` (for example
`v18.13.2-mp.1`, then `v18.13.2-mp.2`). It uploads Linux, macOS, Windows
and `SHA256SUMS.txt` before publishing. Source-only GitHub Releases are not
created for each code commit. The installer reads GitHub's `/releases/latest`
stable endpoint and verifies the file digest before replacing an existing binary.
If an update fails, it keeps the previous executable.

**Release page migration:** old `fork-v*-` hash-tagged Releases were removed
from the public Release list after their full binary files were carried forward
to the semantic-tagged Release. Git tags were retained for commit history, but
old direct asset URLs no longer work. Use `/releases/latest` for stable links.

If the local updater cannot replace a file (e.g. Windows is running an
`omp-mp` process), close it and retry.

### Trust model

The installer is a script executed from this GitHub repository. Review it
before running it, especially before using a pipe into `sh`/`iex`.
Downloaded executables are checked against this fork's **published**
`SHA256SUMS.txt`, which detects incomplete or mismatched downloads but
does **not** provide independent verification of the publisher's trust.
