// Accept only an official, published, stable GitHub Release.
// Never use prerelease tags, drafts, or the upstream main branch.
import { pathToFileURL } from "node:url";

const STABLE_TAG = /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;

export function selectUpstreamStableTag(release) {
  if (!release || typeof release !== "object" || Array.isArray(release)) {
    throw new Error("Expected a GitHub Release object");
  }
  if (release.draft !== false || release.prerelease !== false) {
    throw new Error("Release must not be a draft or prerelease");
  }
  if (typeof release.published_at !== "string" || !release.published_at) {
    throw new Error("Release must have a publication timestamp");
  }
  if (typeof release.tag_name !== "string" || !STABLE_TAG.test(release.tag_name)) {
    throw new Error("Expected a stable tag vMAJOR.MINOR.PATCH");
  }
  return release.tag_name;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let input = "";
  for await (const part of process.stdin) input += part;
  try {
    process.stdout.write(selectUpstreamStableTag(JSON.parse(input)) + "\n");
  } catch (error) {
    console.error("Rejecting upstream release:", error.message);
    process.exitCode = 1;
  }
}
