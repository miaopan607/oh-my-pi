/**
 * Self-update routing for the independently installed miaopan607/oh-my-pi fork.
 *
 * The fork launcher is named omp-mp, while the executable inside its private
 * installation is still named omp. Upstream's npm/build-service updater must
 * never run against this executable: it would replace the fork with upstream.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { $ } from "bun";
import { compareVersions, isCompiledBinary, isEnoent, isRecord } from "@oh-my-pi/pi-utils";
import chalk from "@oh-my-pi/pi-utils/chalk";
import { withTimeoutSignal } from "../utils/fetch-timeout";

const FORK_REPO = "miaopan607/oh-my-pi";
const FORK_LATEST = `https://api.github.com/repos/${FORK_REPO}/releases/latest`;
const FORK_TAG = /^v\d+\.\d+\.\d+-mp\.[1-9]\d*$/;

export interface ForkInstall {
	directory: string;
	installer: string;
}

/** A full release tag is needed: --version only reports the upstream base version. */
export function parseForkReleaseTag(value: unknown): string | undefined {
	return typeof value === "string" && FORK_TAG.test(value) ? value : undefined;
}

/** Avoid treating an unrelated omp binary (including the official one) as the fork. */
export function matchesForkExecutable(executable: string, forkBinary: string, platform: NodeJS.Platform): boolean {
	const actual = path.resolve(executable);
	const expected = path.resolve(forkBinary);
	return platform === "win32" ? actual.toLowerCase() === expected.toLowerCase() : actual === expected;
}

export function getForkInstall(): ForkInstall | undefined {
	if (!isCompiledBinary()) return undefined;
	const directory =
		process.platform === "win32"
			? process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Programs", "omp-mp")
			: process.env.OMP_MP_DATA_DIR || path.join(os.homedir(), ".local", "share", "omp-mp");
	if (!directory) return undefined;
	const binary = path.join(directory, process.platform === "win32" ? "omp.exe" : "omp");
	try {
		if (!matchesForkExecutable(fs.realpathSync(process.execPath), fs.realpathSync(binary), process.platform)) {
			return undefined;
		}
	} catch {
		return undefined;
	}
	return {
		directory,
		installer: path.join(directory, process.platform === "win32" ? "install.ps1" : "install.sh"),
	};
}

/** Fetch only from this fork, never from the upstream build service or npm. */
export async function fetchForkLatestTag(fetchImpl: typeof fetch = fetch): Promise<string> {
	const response = await fetchImpl(FORK_LATEST, {
		headers: { Accept: "application/vnd.github+json", "User-Agent": "omp-mp-updater" },
		signal: withTimeoutSignal(30_000),
	});
	if (!response.ok) throw new Error(`Fork GitHub Releases returned HTTP ${response.status}`);
	const body: unknown = await response.json();
	const tag = isRecord(body) ? parseForkReleaseTag(body.tag_name) : undefined;
	if (!tag) throw new Error("Latest fork release has an invalid tag (expected vX.Y.Z-mp.N)");
	return tag;
}

export function shouldOfferForkUpdate(latest: string, installed: string | undefined, force: boolean): boolean {
	return force || !installed || compareVersions(latest, installed) > 0;
}

/** Only updates the private omp-mp installation; never writes the official omp executable. */
export async function runForkUpdate(
	install: ForkInstall,
	options: { check: boolean; force: boolean; channel?: "stable" | "canary" },
): Promise<void> {
	if (options.channel === "canary") {
		throw new Error("omp-mp only publishes stable fork releases; the upstream canary channel is unavailable.");
	}
	const latest = await fetchForkLatestTag();
	const tagFile = Bun.file(path.join(install.directory, "release-tag"));
	const recorded = await tagFile
		.text()
		.then(value => parseForkReleaseTag(value.trim()))
		.catch((err: unknown) => {
			if (isEnoent(err)) return undefined;
			throw err;
		});
	console.log(chalk.dim(`Installed fork release: ${recorded ?? "unknown"}`));

	if (!shouldOfferForkUpdate(latest, recorded, options.force)) {
		console.log(chalk.green(`Already up to date (fork release ${recorded})`));
		return;
	}
	console.log(chalk.cyan(`Fork release available: ${latest}`));
	if (options.check) return;

	// Windows does not permit replacing the running .exe. The external launcher
	// runs the same verified installer after the CLI process has exited.
	if (process.platform === "win32") {
		console.log(
			chalk.yellow(
				`Close omp-mp, then run 'omp-mp --fork-update${options.force ? " --force" : ""}' in a new terminal.`,
			),
		);
		return;
	}
	if (!(await Bun.file(install.installer).exists())) {
		throw new Error("Fork updater script is missing; reinstall omp-mp using scripts/fork/install.sh from the fork.");
	}
	const args = ["--update", ...(options.force ? ["--force"] : [])];
	const result = await $`/bin/sh ${install.installer} ${args}`.nothrow();
	if (result.exitCode !== 0) {
		throw new Error(`Fork installer failed (exit ${result.exitCode}); original binary should be unchanged`);
	}
	console.log(chalk.dim("Restart omp-mp to use the updated fork release."));
}
