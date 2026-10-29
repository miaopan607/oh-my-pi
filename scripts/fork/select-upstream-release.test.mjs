import assert from "node:assert/strict";
import test from "node:test";
import { selectUpstreamStableTag } from "./select-upstream-release.mjs";

const stable = {
  tag_name: "v18.13.3",
  draft: false,
  prerelease: false,
  published_at: "2026-10-28T12:49:52Z",
  target_commitish: "main",
};

test("selects a published stable release tag rather than target_commitish", () => {
  assert.equal(selectUpstreamStableTag(stable), "v18.13.3");
});

test("rejects prereleases and drafts even with a stable-looking tag", () => {
  assert.throws(() => selectUpstreamStableTag({ ...stable, prerelease: true }), /draft or prerelease/);
  assert.throws(() => selectUpstreamStableTag({ ...stable, draft: true }), /draft or prerelease/);
});

test("rejects unversioned, canary, and nonstandard tags", () => {
  for (const tag_name of ["main", "v18.13.4-canary.1", "v18.13.4-mp.1", "v18.13", "v01.2.3", "v18.13.4+build"]) {
    assert.throws(() => selectUpstreamStableTag({ ...stable, tag_name }), /stable tag/);
  }
});

test("rejects missing publication info or malformed API results", () => {
  assert.throws(() => selectUpstreamStableTag({ ...stable, published_at: null }), /publication timestamp/);
  assert.throws(() => selectUpstreamStableTag(null), /Release object/);
  assert.throws(() => selectUpstreamStableTag({ tag_name: "v1.2.3" }), /draft or prerelease/);
});
