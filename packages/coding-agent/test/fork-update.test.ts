import { describe, expect, it } from "bun:test";
import {
	fetchForkLatestTag,
	matchesForkExecutable,
	parseForkReleaseTag,
	shouldOfferForkUpdate,
} from "@oh-my-pi/pi-coding-agent/cli/fork-update";

describe("fork built-in updater", () => {
	it("recognizes only numbered releases published by this fork", () => {
		expect(parseForkReleaseTag("v18.13.2-mp.1")).toBe("v18.13.2-mp.1");
		expect(parseForkReleaseTag("v18.13.2-mp.12")).toBe("v18.13.2-mp.12");
		expect(parseForkReleaseTag("v18.13.2")).toBeUndefined();
		expect(parseForkReleaseTag("v18.13.2-mp.0")).toBeUndefined();
		expect(parseForkReleaseTag("fork-v18.13.2-abcdef")).toBeUndefined();
		expect(parseForkReleaseTag("../omp")).toBeUndefined();
	});

	it("never identifies the official executable as the private omp-mp install", () => {
		expect(
			matchesForkExecutable(
				"/home/test/.local/share/omp-mp/omp",
				"/home/test/.local/share/omp-mp/omp",
				"linux",
			),
		).toBe(true);
		expect(
			matchesForkExecutable("/home/test/.local/bin/omp", "/home/test/.local/share/omp-mp/omp", "linux"),
		).toBe(false);
		expect(
			matchesForkExecutable(
				"C:\\Users\\Test\\AppData\\Local\\Programs\\omp-mp\\OMP.EXE",
				"C:\\Users\\Test\\AppData\\Local\\Programs\\omp-mp\\omp.exe",
				"win32",
			),
		).toBe(true);
	});

	it("compares the full fork tag, not the upstream base version", () => {
		expect(shouldOfferForkUpdate("v18.13.2-mp.2", "v18.13.2-mp.1", false)).toBe(true);
		expect(shouldOfferForkUpdate("v18.13.2-mp.2", "v18.13.2-mp.2", false)).toBe(false);
		expect(shouldOfferForkUpdate("v18.13.2-mp.1", "v18.13.2-mp.2", false)).toBe(false);
		expect(shouldOfferForkUpdate("v18.13.3-mp.1", "v18.13.2-mp.20", false)).toBe(true);
		expect(shouldOfferForkUpdate("v18.13.2-mp.1", undefined, false)).toBe(true);
		expect(shouldOfferForkUpdate("v18.13.2-mp.1", "v18.13.2-mp.1", true)).toBe(true);
	});

	it("checks only the fork's GitHub Releases endpoint", async () => {
		const calls: string[] = [];
		const fetchImpl: typeof fetch = async (url, init) => {
			calls.push(String(url));
			expect(init?.headers).toEqual({
				Accept: "application/vnd.github+json",
				"User-Agent": "omp-mp-updater",
			});
			return Response.json({ tag_name: "v18.13.2-mp.7" });
		};
		expect(await fetchForkLatestTag(fetchImpl)).toBe("v18.13.2-mp.7");
		expect(calls).toEqual(["https://api.github.com/repos/miaopan607/oh-my-pi/releases/latest"]);
	});

	it("rejects upstream-style, malformed, and failed Release responses", async () => {
		await expect(fetchForkLatestTag(async () => Response.json({ tag_name: "v18.13.3" }))).rejects.toThrow(
			"invalid tag",
		);
		await expect(fetchForkLatestTag(async () => Response.json({ tag_name: "v18.13.2-mp.0" }))).rejects.toThrow(
			"invalid tag",
		);
		await expect(fetchForkLatestTag(async () => new Response("Not Found", { status: 404 }))).rejects.toThrow(
			"HTTP 404",
		);
	});
});
