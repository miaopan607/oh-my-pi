import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { type RawSettings, Settings } from "@oh-my-pi/pi-coding-agent/config/settings";
import { AgentStorage } from "@oh-my-pi/pi-coding-agent/session/agent-storage";
import { cfgTemperature } from "@oh-my-pi/pi-coding-agent/session/settings";
import { cfgCompactionEnabled } from "@oh-my-pi/pi-coding-agent/session/context-settings";
import { cfgTaskDisabledAgents } from "@oh-my-pi/pi-coding-agent/task/settings";
import { getProjectAgentDir, TempDir } from "@oh-my-pi/pi-utils";
import { YAML } from "bun";
import { beginSettingsTest, restoreSettingsTestState, type SettingsTestState } from "../helpers/settings-test-state";

describe("omp-mp isolated writable settings", () => {
	let state: SettingsTestState | undefined;
	let tempDir: TempDir;
	let agentDir: string;
	let projectDir: string;
	let officialPath: string;
	let forkPath: string;
	let priorForkEnv: string | undefined;

	beforeEach(() => {
		state = beginSettingsTest();
		priorForkEnv = process.env.OMP_MP_CONFIG_FILE;
		tempDir = TempDir.createSync("@omp-mp-settings-");
		agentDir = tempDir.join("official-agent");
		projectDir = tempDir.join("project");
		officialPath = path.join(agentDir, "config.yml");
		forkPath = tempDir.join("fork", "config.yml");
		for (const directory of [agentDir, projectDir, path.dirname(forkPath)]) {
			fs.mkdirSync(directory, { recursive: true });
		}
		process.env.OMP_MP_CONFIG_FILE = forkPath;
	});

	afterEach(() => {
		if (priorForkEnv === undefined) delete process.env.OMP_MP_CONFIG_FILE;
		else process.env.OMP_MP_CONFIG_FILE = priorForkEnv;
		restoreSettingsTestState(state);
		state = undefined;
		AgentStorage.close();
		Bun.gc(true);
		tempDir.removeSync();
	});

	async function writeYaml(file: string, data: RawSettings) {
		await Bun.write(file, YAML.stringify(data));
	}

	async function readYaml(file: string): Promise<RawSettings> {
		return YAML.parse(await Bun.file(file).text()) as RawSettings;
	}

	it("inherits official settings while /settings-like writes and unset only touch the fork config", async () => {
		await writeYaml(officialPath, { temperature: 0.2, compaction: { enabled: false } });
		await writeYaml(forkPath, {});
		const original = await Bun.file(officialPath).text();
		const settings = await Settings.loadIsolated({ agentDir, cwd: projectDir });
		expect(cfgTemperature.get(settings)).toBe(0.2);
		expect(cfgCompactionEnabled.get(settings)).toBe(false);

		cfgTemperature.set(settings, 0.7);
		await settings.flush();
		expect(cfgTemperature.get(settings)).toBe(0.7);
		expect(await readYaml(forkPath)).toEqual({ temperature: 0.7 });
		expect(await Bun.file(officialPath).text()).toBe(original);

		cfgTemperature.unset(settings);
		await settings.flush();
		expect(cfgTemperature.get(settings)).toBe(0.2);
		expect(await readYaml(forkPath)).toEqual({});
		expect(await Bun.file(officialPath).text()).toBe(original);
	});

	it("fork edits override project and official settings without copying inherited values", async () => {
		await writeYaml(officialPath, { temperature: 0.1, compaction: { enabled: false } });
		const projectConfig = path.join(getProjectAgentDir(projectDir), "config.yml");
		fs.mkdirSync(path.dirname(projectConfig), { recursive: true });
		await writeYaml(projectConfig, { temperature: 0.3 });
		await writeYaml(forkPath, { temperature: 0.6 });

		const settings = await Settings.loadIsolated({ agentDir, cwd: projectDir });
		expect(cfgTemperature.get(settings)).toBe(0.6);
		expect(cfgTemperature.provenance(settings)).toBe("global");
		expect(cfgCompactionEnabled.get(settings)).toBe(false);

		cfgTemperature.set(settings, 0.8);
		await settings.flush();
		expect(await readYaml(forkPath)).toEqual({ temperature: 0.8 });
		expect(await readYaml(officialPath)).toEqual({ temperature: 0.1, compaction: { enabled: false } });
		expect(await readYaml(projectConfig)).toEqual({ temperature: 0.3 });
	});

	it("reloads both files and maintains fork precedence and official read-only behavior", async () => {
		await writeYaml(officialPath, { temperature: 0.2, compaction: { enabled: false } });
		await writeYaml(forkPath, { temperature: 0.5 });
		const settings = await Settings.loadIsolated({ agentDir, cwd: projectDir });

		await writeYaml(officialPath, { temperature: 0.9, compaction: { enabled: true } });
		await settings.reloadFromDisk();
		expect(cfgTemperature.get(settings)).toBe(0.5);
		expect(cfgCompactionEnabled.get(settings)).toBe(true);
		expect(await readYaml(forkPath)).toEqual({ temperature: 0.5 });

		await writeYaml(forkPath, { temperature: 0.7 });
		await settings.reloadFromDisk();
		expect(cfgTemperature.get(settings)).toBe(0.7);
		expect(await readYaml(officialPath)).toEqual({ temperature: 0.9, compaction: { enabled: true } });
	});

	it("edits inherited list members without resetting the official list", async () => {
		await writeYaml(officialPath, { task: { disabledAgents: ["reviewer"] } });
		await writeYaml(forkPath, {});
		const settings = await Settings.loadIsolated({ agentDir, cwd: projectDir });
		expect(cfgTaskDisabledAgents.get(settings)).toEqual(["reviewer"]);

		cfgTaskDisabledAgents.setMember(settings, "scout", { member: true });
		await settings.flush();
		expect(cfgTaskDisabledAgents.get(settings)).toEqual(["reviewer", "scout"]);
		expect(await readYaml(forkPath)).toEqual({ task: { disabledAgents: ["reviewer", "scout"] } });
		expect(await readYaml(officialPath)).toEqual({ task: { disabledAgents: ["reviewer"] } });
	});

	it("keeps global model-role assignments from official config while storing new roles in the fork", async () => {
		await writeYaml(officialPath, { modelRoles: { default: "openai/base" } });
		await writeYaml(forkPath, {});
		const settings = await Settings.loadIsolated({ agentDir, cwd: projectDir });
		expect(settings.getGlobalModelRole("default")).toBe("openai/base");
		settings.setModelRole("slow", "anthropic/fork");
		await settings.flush();
		expect(settings.getGlobalModelRole("default")).toBe("openai/base");
		expect(settings.getModelRoleProvenance("slow")).toBe("global");
		expect(await readYaml(forkPath)).toEqual({ modelRoles: { slow: "anthropic/fork" } });
		expect(await readYaml(officialPath)).toEqual({ modelRoles: { default: "openai/base" } });
	});

	it("read-only mode reads both layers without creating or modifying a fork file", async () => {
		await writeYaml(officialPath, { temperature: 0.4 });
		const settings = await Settings.loadReadOnly({ agentDir, cwd: projectDir });
		expect(cfgTemperature.get(settings)).toBe(0.4);
		expect(fs.existsSync(forkPath)).toBe(false);
	});

	it("config set/reset subprocesses update only the fork file and show its directory", async () => {
		await writeYaml(officialPath, { temperature: 0.2 });
		await writeYaml(forkPath, {});
		const original = await Bun.file(officialPath).text();
		const cliPath = path.join(import.meta.dir, "..", "..", "src", "cli.ts");
		const env: NodeJS.ProcessEnv = {
			...process.env,
			NO_COLOR: "1",
			OMP_PROFILE: "",
			PI_PROFILE: "",
			PI_CODING_AGENT_DIR: agentDir,
			OMP_MP_CONFIG_FILE: forkPath,
		};
		async function cli(...args: string[]): Promise<string> {
			const proc = Bun.spawn([process.execPath, cliPath, "config", ...args], {
				cwd: projectDir,
				env,
				stdout: "pipe",
				stderr: "pipe",
			});
			const stdout = new Response(proc.stdout).text();
			const stderr = new Response(proc.stderr).text();
			const [code, output, error] = await Promise.all([proc.exited, stdout, stderr]);
			expect(code, error).toBe(0);
			return output.trim();
		}

		expect(await cli("path")).toBe(path.dirname(forkPath));
		await cli("set", "temperature", "0.7");
		expect(await readYaml(forkPath)).toEqual({ temperature: 0.7 });
		expect(await Bun.file(officialPath).text()).toBe(original);

		await cli("reset", "temperature");
		expect(await readYaml(forkPath)).toEqual({});
		expect(await Bun.file(officialPath).text()).toBe(original);
	});

	it("non-fork settings retain their existing project-over-global precedence", async () => {
		delete process.env.OMP_MP_CONFIG_FILE;
		await writeYaml(officialPath, { temperature: 0.1 });
		const projectConfig = path.join(getProjectAgentDir(projectDir), "config.yml");
		fs.mkdirSync(path.dirname(projectConfig), { recursive: true });
		await writeYaml(projectConfig, { temperature: 0.3 });
		const settings = await Settings.loadIsolated({ agentDir, cwd: projectDir });
		expect(cfgTemperature.get(settings)).toBe(0.3);
		cfgTemperature.set(settings, 0.6);
		await settings.flush();
		expect(await readYaml(officialPath)).toEqual({ temperature: 0.6 });
		expect(fs.existsSync(forkPath)).toBe(false);
	});
});
