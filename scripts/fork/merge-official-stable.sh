#!/usr/bin/env bash
# Merge a published upstream stable tag without losing a workflow-free fork's
# previous upstream merge base. Called after release-tag validation.
set -euo pipefail

: "${RELEASE_TAG:?Set RELEASE_TAG to a validated official stable tag}"
output_file="${GITHUB_OUTPUT:-/dev/null}"
summary_file="${GITHUB_STEP_SUMMARY:-/dev/null}"
upstream_url="${UPSTREAM_URL:-https://github.com/can1357/oh-my-pi.git}"
snapshot_subject="chore(sync): import official stable $RELEASE_TAG (exclude workflows)"

# A workflow-free snapshot has no upstream parent. Its subject is also the
# persistent idempotence marker for scheduled retries.
if git log --format=%s --fixed-strings --grep="$snapshot_subject" -1 | grep -Fxq "$snapshot_subject"; then
  echo 'changed=false' >> "$output_file"
  echo "Already imported $RELEASE_TAG as a workflow-free snapshot." >> "$summary_file"
  exit 0
fi

git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
if ! git remote get-url upstream >/dev/null 2>&1; then
  git remote add upstream "$upstream_url"
fi
# Always fetch the selected tag, never upstream/main.
git fetch --no-tags upstream "refs/tags/$RELEASE_TAG"
release_sha="$(git rev-parse 'FETCH_HEAD^{commit}')"
echo "Official stable $RELEASE_TAG resolves to $release_sha"
if git merge-base --is-ancestor "$release_sha" HEAD; then
  echo 'changed=false' >> "$output_file"
  echo "Already includes $RELEASE_TAG; nothing to synchronize." >> "$summary_file"
  exit 0
fi

base_sha="$(git rev-parse HEAD)"
previous_snapshot="$(git log --format=%s --extended-regexp --grep='^chore\(sync\): import official stable v[0-9]+\.[0-9]+\.[0-9]+ \(exclude workflows\)$' -1)"
if [[ -n "$previous_snapshot" ]]; then
  previous_tag="${previous_snapshot#chore(sync): import official stable }"
  previous_tag="${previous_tag% (exclude workflows)}"
  # Upstream ancestry is deliberately missing from published snapshots. Make
  # a *local, temporary* synthetic commit whose tree is the current fork's,
  # but whose parent is the last imported official stable tag. The resulting
  # merge uses that tag as its base rather than the fork's much older history.
  git fetch --no-tags upstream "refs/tags/$previous_tag"
  previous_sha="$(git rev-parse 'FETCH_HEAD^{commit}')"
  if ! git merge-base --is-ancestor "$previous_sha" "$release_sha"; then
    echo "::error::Selected $RELEASE_TAG does not descend from the last imported $previous_tag; refusing unsafe replay."
    exit 1
  fi
  if ! git merge-base --is-ancestor "$previous_sha" HEAD; then
    virtual_sha="$(printf 'Temporary merge base for %s (do not push)\n' "$previous_tag" | git commit-tree "$(git rev-parse 'HEAD^{tree}')" -p "$previous_sha")"
    git switch --detach "$virtual_sha"
    if ! git merge --no-edit --no-ff "$release_sha"; then
      # Workflows are never imported from a virtual-base sync, so conflicts
      # limited to this path are automatically resolved in favor of the fork.
      git restore --source="$virtual_sha" --staged --worktree -- .github/workflows/
      git add -A -- .github/workflows/
      # The 18.18.6 project-settings refactor conflicts with the fork's
      # read-only official / writable fork config layers. A reviewed patch
      # combines both implementations. Never use it for a different release
      # or after the local fork settings file has changed.
      settings_path="packages/coding-agent/src/config/settings.ts"
      if [[ "$RELEASE_TAG" == "v18.18.6" \
        && "$release_sha" == "9058ab9d229663e229e2867824ba6df6f21e9e59" \
        && "$(git rev-parse "$base_sha:$settings_path")" == "e4252b37b9c8f51f3e6630bdfd55bb4d57aca2c9" \
        && "$(git diff --name-only --diff-filter=U)" == "$settings_path" ]]; then
        echo "Resolving known v18.18.6 settings conflict while retaining fork configuration isolation."
        git show "$release_sha:$settings_path" > "$settings_path"
        if ! git apply --check scripts/fork/patches/settings-v18.18.6.patch; then
          echo "::error::Pinned settings resolution patch no longer applies; refusing to overwrite fork changes."
          git merge --abort || true
          exit 1
        fi
        git apply scripts/fork/patches/settings-v18.18.6.patch
        git add -- "$settings_path"
        echo "Resolved the pinned settings conflict with upstream provider filtering and the fork's separate writable config preserved." >> "$summary_file"
      fi
      if [[ -n "$(git diff --name-only --diff-filter=U)" ]]; then
        echo "::error::Official release $RELEASE_TAG still conflicts with fork edits; resolve actual conflicts manually."
        git diff --name-only --diff-filter=U || true
        git merge --abort || true
        exit 1
      fi
      git commit --no-edit
    fi
    # Never push synthetic ancestry: upstream history can contain restricted
    # .github/workflows edits. Publish one snapshot parented by the fork only.
    git reset --soft "$base_sha"
    git restore --source="$base_sha" --staged --worktree -- .github/workflows/
    if git diff --cached --quiet; then
      echo 'changed=false' >> "$output_file"
      echo "No non-workflow changes to import from $RELEASE_TAG." >> "$summary_file"
    else
      git commit -m "$snapshot_subject"
      echo 'changed=true' >> "$output_file"
      {
        echo "## Merged $RELEASE_TAG using $previous_tag as a temporary base"
        echo "Preserved fork edits and local workflows; published no upstream workflow ancestry."
      } >> "$summary_file"
    fi
    exit 0
  fi
fi

# With real upstream ancestry, keep the normal merge (and the workflow's
# subsequent permission-sensitive snapshot fallback) unchanged.
if ! git merge --no-edit --no-ff "$release_sha"; then
  echo "::error::Official release $RELEASE_TAG conflicts with fork changes. Resolve manually; no force push."
  git diff --name-only --diff-filter=U || true
  git merge --abort || true
  exit 1
fi
echo 'changed=true' >> "$output_file"
