import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = join(dirname(fileURLToPath(import.meta.url)), "merge-official-stable.sh");
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
function put(dir, path, content) {
  const dest = join(dir, path);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, content);
}
function init(dir) {
  mkdirSync(dir);
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.name", "Fork sync test");
  git(dir, "config", "user.email", "fork-sync@example.invalid");
}
function commit(dir, message) {
  git(dir, "add", "-A");
  git(dir, "commit", "-qm", message);
  return git(dir, "rev-parse", "HEAD");
}
function fixture(t, { conflict = false, unrelated = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "omp-sync-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const upstream = join(root, "upstream");
  const fork = join(root, "fork");
  init(upstream);
  init(fork);
  put(upstream, "src/core.txt", "base\n");
  put(upstream, ".github/workflows/ci.yml", "upstream 15\n");
  commit(upstream, "official v18.15.0");
  git(upstream, "tag", "v18.15.0");
  put(upstream, "src/core.txt", "upstream 16\n");
  put(upstream, ".github/workflows/ci.yml", "upstream 16\n");
  put(upstream, "src/new.txt", "new feature\n");
  commit(upstream, "official v18.16.0");
  git(upstream, "tag", "v18.16.0");
  if (unrelated) {
    git(upstream, "checkout", "-q", "--orphan", "different");
    git(upstream, "rm", "-rfq", ".");
    put(upstream, "src/core.txt", "unrelated release\n");
    commit(upstream, "unrelated history");
    git(upstream, "tag", "v18.17.0");
  }
  // The fork has the imported tree, not the upstream v18.15.0 commit.
  put(fork, "src/core.txt", conflict ? "fork changed same line\n" : "base\n");
  put(fork, ".github/workflows/ci.yml", "fork workflow\n");
  put(fork, "fork-feature.txt", "preserved\n");
  commit(fork, "chore(sync): import official stable v18.15.0 (exclude workflows)");
  put(fork, "fork-local.txt", "later local changes\n");
  const base = commit(fork, "feat(fork): local custom work");
  return { root, upstream, fork, base };
}
function sync(root, fork, upstream, tag) {
  const output = join(root, "output.txt");
  const summary = join(root, "summary.txt");
  writeFileSync(output, "");
  writeFileSync(summary, "");
  const result = spawnSync("bash", [script], {
    cwd: fork,
    encoding: "utf8",
    env: { ...process.env, RELEASE_TAG: tag, UPSTREAM_URL: upstream, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary },
  });
  return { ...result, output: readFileSync(output, "utf8") };
}

test("new official release imports against previous snapshot without overwriting fork changes or workflows", t => {
  const { root, upstream, fork, base } = fixture(t);
  const first = sync(root, fork, upstream, "v18.16.0");
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.output, /changed=true/);
  assert.equal(readFileSync(join(fork, "src/core.txt"), "utf8"), "upstream 16\n");
  assert.equal(readFileSync(join(fork, "src/new.txt"), "utf8"), "new feature\n");
  assert.equal(readFileSync(join(fork, ".github/workflows/ci.yml"), "utf8"), "fork workflow\n");
  assert.equal(readFileSync(join(fork, "fork-feature.txt"), "utf8"), "preserved\n");
  assert.equal(readFileSync(join(fork, "fork-local.txt"), "utf8"), "later local changes\n");
  assert.equal(git(fork, "rev-list", "--parents", "-n", "1", "HEAD").split(" ").length, 2);
  assert.equal(git(fork, "rev-parse", "HEAD^"), base);
  assert.equal(git(fork, "status", "--porcelain"), "");
  const synced = git(fork, "rev-parse", "HEAD");
  const second = sync(root, fork, upstream, "v18.16.0");
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.output, /changed=false/);
  assert.equal(git(fork, "rev-parse", "HEAD"), synced);
});

test("actual source-code conflicts leave main unchanged", t => {
  const { root, upstream, fork, base } = fixture(t, { conflict: true });
  const result = sync(root, fork, upstream, "v18.16.0");
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /src\/core.txt/);
  assert.equal(git(fork, "rev-parse", "main"), base);
});

test("does not import a release from unrelated history", t => {
  const { root, upstream, fork, base } = fixture(t, { unrelated: true });
  const result = sync(root, fork, upstream, "v18.17.0");
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /does not descend/);
  assert.equal(git(fork, "rev-parse", "main"), base);
});

test("ordinary upstream merges retain two-parent ancestry", t => {
  const { root, upstream } = fixture(t);
  const fork = join(root, "normal-fork");
  execFileSync("git", ["clone", "-q", "--no-hardlinks", upstream, fork]);
  git(fork, "config", "user.name", "Fork sync test");
  git(fork, "config", "user.email", "fork-sync@example.invalid");
  git(fork, "checkout", "-q", "v18.15.0");
  git(fork, "switch", "-qc", "fork-main");
  put(fork, "fork-feature.txt", "preserved\n");
  commit(fork, "fork custom feature");
  const result = sync(root, fork, upstream, "v18.16.0");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.output, /changed=true/);
  assert.equal(git(fork, "rev-list", "--parents", "-n", "1", "HEAD").split(" ").length, 3);
  assert.equal(readFileSync(join(fork, "fork-feature.txt"), "utf8"), "preserved\n");
});
