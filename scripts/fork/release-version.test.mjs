import { test } from "node:test";
import assert from "node:assert/strict";
import { nextReleaseTag } from "./release-version.mjs";

const A = "a".repeat(40), B = "b".repeat(40), C = "c".repeat(40);
test("use initial semantic fork revision", () => {
	assert.equal(nextReleaseTag("18.13.2", A, []), "v18.13.2-mp.1");
});
test("increment patch revision numerically, not lexically", () => {
	assert.equal(nextReleaseTag("18.13.2", C, [
		{tag_name:"v18.13.2-mp.1",target_commitish:A},
		{tag_name:"v18.13.2-mp.10",target_commitish:B},
		{tag_name:"v18.8.0-mp.100",target_commitish:A},
		{tag_name:"fork-v18.13.2-0123abcd",target_commitish:A},
	]), "v18.13.2-mp.11");
});
test("CI rerun of same SHA does not create another release", () => {
	assert.equal(nextReleaseTag("18.13.2", B, [
		{tag_name:"v18.13.2-mp.2",target_commitish:A},
		{tag_name:"v18.13.2-mp.3",target_commitish:B},
	]), "v18.13.2-mp.3");
});
test("support gh api --slurp results", () => {
	assert.equal(nextReleaseTag("19.0.0", B, [[{tag_name:"v19.0.0-mp.2",target_commitish:A}]]), "v19.0.0-mp.3");
});
test("invalid version and commit cannot silently publish", () => {
	assert.throws(() => nextReleaseTag("18.13.2-old", A, []));
	assert.throws(() => nextReleaseTag("18.13.2", "bad", []));
});
