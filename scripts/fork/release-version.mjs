import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * GitHub Release version numbering. The user-facing tag is a real SemVer
 * prerelease suffix, e.g. v18.13.2-mp.2. It is assigned only after the
 * three platform binaries have passed validation.
 */
export function nextReleaseTag(version, commit, entries) {
	if (!/^\d+\.\d+\.\d+$/.test(version)) {
		throw new Error("Expected numeric upstream X.Y.Z version: " + version);
	}
	if (!/^[a-f0-9]{40}$/.test(commit)) {
		throw new Error("Expected a full 40-hex commit SHA");
	}
	if (!Array.isArray(entries)) throw new Error("Expected GitHub release list array");
	const prefix = `v${version}-mp.`;
	let revision = 0;
	for (const entry of entries.flat()) {
		const tag = entry?.tag_name;
		if (typeof tag !== "string" || !tag.startsWith(prefix)) continue;
		const suffix = tag.slice(prefix.length);
		if (!/^[1-9]\d*$/.test(suffix)) continue;
		if (entry.target_commitish === commit) {
			// CI retries must reuse an existing semantic tag, never mint a duplicate.
			return tag;
		}
		const n = Number(suffix);
		if (!Number.isSafeInteger(n)) throw new Error("Release revision overflow: " + suffix);
		revision = Math.max(revision, n);
	}
	return prefix + String(revision + 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	try {
		const [version, commit, releasesFile] = process.argv.slice(2);
		const releases = JSON.parse(readFileSync(releasesFile, "utf8"));
		console.log(nextReleaseTag(version, commit, releases));
	} catch (error) {
		console.error(error);
		process.exitCode = 1;
	}
}
