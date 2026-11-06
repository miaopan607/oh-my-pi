import { describe, expect, it, spyOn } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { Fetch } from "@oh-my-pi/pi-coding-agent/cli/build-service";
import {
	fetchForkLatestTag,
	matchesForkExecutable,
	parseForkReleaseTag,
	readForkInstalledTag,
	runForkUpdate,
	shouldOfferForkUpdate,
} from "@oh-my-pi/pi-coding-agent/cli/fork-update";

describe("fork built-in updater", () => {
	it("accepts fork release tags, not upstream tags", () => {
		expect(parseForkReleaseTag("v18.13.2-mp.1")).toBe("v18.13.2-mp.1");
		expect(parseForkReleaseTag("v18.13.2-mp.12")).toBe("v18.13.2-mp.12");
		expect(parseForkReleaseTag("v18.13.2")).toBeUndefined();
		expect(parseForkReleaseTag("v18.13.2-mp.0")).toBeUndefined();
		expect(parseForkReleaseTag("../omp")).toBeUndefined();
	});

	it("distinguishes the private executable from official omp", () => {
		const fork = "/home/test/.local/share/omp-mp/omp";
		const official = "/home/test/.local/bin/omp";
		expect(matchesForkExecutable(fork, fork, "linux")).toBe(true);
		expect(matchesForkExecutable(official, fork, "linux")).toBe(false);
		const winFork = "C:\\Users\\Test\\omp-mp\\omp.exe";
		const winUpper = "C:\\Users\\Test\\omp-mp\\OMP.EXE";
		expect(matchesForkExecutable(winUpper, winFork, "win32")).toBe(true);
	});

	it("reads the complete release tag from installer state", async () => {
		const dir = await fs.mkdtemp(path.join(os.tmpdir(), "omp-fork-update-test-"));
		try {
			expect(await readForkInstalledTag(dir)).toBeUndefined();
			await Bun.write(path.join(dir, "release-tag"), "v18.13.2-mp.3\n");
			expect(await readForkInstalledTag(dir)).toBe("v18.13.2-mp.3");
			await Bun.write(path.join(dir, "release-tag"), "v18.13.2\n");
			expect(await readForkInstalledTag(dir)).toBeUndefined();
		} finally {
			await fs.rm(dir, { recursive: true, force: true });
		}
	});

	it("compares full fork versions and supports a forced reinstall", () => {
		expect(shouldOfferForkUpdate("v18.13.2-mp.2", "v18.13.2-mp.1", false)).toBe(true);
		expect(shouldOfferForkUpdate("v18.13.2-mp.2", "v18.13.2-mp.2", false)).toBe(false);
		expect(shouldOfferForkUpdate("v18.13.2-mp.1", "v18.13.2-mp.2", false)).toBe(false);
		expect(shouldOfferForkUpdate("v18.13.3-mp.1", "v18.13.2-mp.20", false)).toBe(true);
		expect(shouldOfferForkUpdate("v18.13.2-mp.1", undefined, false)).toBe(true);
		expect(shouldOfferForkUpdate("v18.13.2-mp.1", "v18.13.2-mp.1", true)).toBe(true);
	});

	it("fetches latest metadata from the fork repository only", async () => {
		const calls: string[] = [];
		const fetchImpl: Fetch = async url => {
			calls.push(String(url));
			return Response.json({ tag_name: "v18.13.2-mp.7" });
		};
		expect(await fetchForkLatestTag(fetchImpl)).toBe("v18.13.2-mp.7");
		const endpoint = "https://api.github.com/repos/miaopan607/oh-my-pi/releases/latest";
		expect(calls).toEqual([endpoint]);
	});

	it("rejects malformed or unavailable releases", async () => {
		const invalid: Fetch = async () => Response.json({ tag_name: "v18.13.3" });
		const missing: Fetch = async () => new Response("Not Found", { status: 404 });
		await expect(fetchForkLatestTag(invalid)).rejects.toThrow("invalid tag");
		await expect(fetchForkLatestTag(missing)).rejects.toThrow("HTTP 404");
	});

	it.skipIf(process.platform === "win32").each([
		{ installed: "v18.17.0-mp.2", check: false, kind: "current", installs: false },
		{ installed: "v18.17.0-mp.1", check: true, kind: "available", installs: false },
		{ installed: "v18.17.0-mp.1", check: false, kind: "installed", installs: true },
	])(
		"reports $kind without installing during a check or when current",
		async ({ installed, check, kind, installs }) => {
			const directory = await fs.mkdtemp(path.join(os.tmpdir(), "omp-fork-outcome-"));
			const installer = path.join(directory, "install.sh");
			const marker = path.join(directory, "installed");
			const latest = "v18.17.0-mp.2";
			const metadata = spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ tag_name: latest }));
			try {
				await Bun.write(path.join(directory, "release-tag"), installed);
				await Bun.write(installer, '#!/bin/sh\nprintf updated > "$(dirname "$0")/installed"\n');
				const outcome = await runForkUpdate({ directory, installer }, { check, force: false });
				expect(outcome).toEqual(kind === "current" ? { kind } : { kind, version: latest });
				expect(await Bun.file(marker).exists()).toBe(installs);
				if (installs) expect(await Bun.file(marker).text()).toBe("updated");
			} finally {
				metadata.mockRestore();
				await fs.rm(directory, { recursive: true, force: true });
			}
		},
	);
});
