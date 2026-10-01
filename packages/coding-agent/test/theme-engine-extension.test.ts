import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The theme engine is a process-wide singleton inside theme.ts, and extensions are loaded through
 * jiti (a separate module registry from vitest). Each test resets the module registry and
 * dynamically imports both modules so loader.ts and theme.ts share one fresh instance.
 */
async function loadThemeEngineHarness() {
	vi.resetModules();
	const themeModule = await import("../src/modes/interactive/theme/theme.ts");
	const { discoverAndLoadExtensions } = await import("../src/core/extensions/loader.ts");
	return { ...themeModule, discoverAndLoadExtensions };
}

type Harness = Awaited<ReturnType<typeof loadThemeEngineHarness>>;

const engineSource = (id: string, themes: string[]) => `
	export default function(pi) {
		pi.registerThemeEngine({
			loadTheme: (name) => ({
				name,
				fg: (_color, text) => \`<${id}:\${name}:\${text}>\`,
				bg: (_color, text) => text,
				bold: (text) => text,
				italic: (text) => text,
				underline: (text) => text,
				inverse: (text) => text,
				strikethrough: (text) => text,
				getFgAnsi: () => "",
				getBgAnsi: () => "",
				getThinkingBorderColor: () => (text) => text,
				getBashModeBorderColor: () => (text) => text,
			}),
			getAvailableThemes: () => [${themes.map((t) => `{ name: ${JSON.stringify(t)}, path: undefined }`).join(", ")}],
		});
	}
`;

describe("theme engine extension API", () => {
	let tempDir: string;
	let extensionsDir: string;
	let harness: Harness;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-theme-engine-"));
		extensionsDir = path.join(tempDir, ".pi", "extensions");
		fs.mkdirSync(extensionsDir, { recursive: true });
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
		vi.resetModules();
	});

	async function load(files: Record<string, string>) {
		for (const [name, source] of Object.entries(files)) {
			fs.writeFileSync(path.join(extensionsDir, name), source);
		}
		const result = await harness.discoverAndLoadExtensions([], tempDir, tempDir);
		expect(result.errors).toEqual([]);
		return result;
	}

	it("routes theme lookups through a registered engine", async () => {
		harness = await loadThemeEngineHarness();
		await load({ "engine.ts": engineSource("alpha", ["solarized"]) });

		expect(harness.getAvailableThemes()).toContain("solarized");
		expect(harness.getThemeByName("solarized")?.fg("accent", "hi")).toBe("<alpha:solarized:hi>");

		harness.initTheme("solarized");
		expect(harness.theme.fg("accent", "hi")).toBe("<alpha:solarized:hi>");
		expect(harness.theme.name).toBe("solarized");
	});

	it("lists engine themes ahead of built-in themes that share a name", async () => {
		harness = await loadThemeEngineHarness();
		await load({ "engine.ts": engineSource("alpha", ["dark", "solarized"]) });

		const dark = harness.getAvailableThemesWithPaths().find((info) => info.name === "dark");
		// The engine replaces the built-in loader, so its "dark" wins the dedupe.
		expect(dark).toEqual({ name: "dark", path: undefined });
		expect(harness.getThemeByName("dark")?.fg("accent", "hi")).toBe("<alpha:dark:hi>");
	});

	it("keeps the picker usable when the engine throws", async () => {
		harness = await loadThemeEngineHarness();
		await load({
			"engine.ts": `
				export default function(pi) {
					pi.registerThemeEngine({
						loadTheme: () => { throw new Error("boom"); },
						getAvailableThemes: () => { throw new Error("boom"); },
					});
				}
			`,
		});

		expect(harness.getAvailableThemes()).toEqual(expect.arrayContaining(["dark", "light"]));
	});

	it("replaces an earlier engine with a later registration", async () => {
		harness = await loadThemeEngineHarness();
		await load({ "a.ts": engineSource("first", ["one"]), "b.ts": engineSource("second", ["two"]) });

		// Only the later engine survives, so only its themes are listed and it resolves every name.
		expect(harness.getAvailableThemes()).toContain("two");
		expect(harness.getAvailableThemes()).not.toContain("one");
		expect(harness.getThemeByName("two")?.fg("accent", "x")).toBe("<second:two:x>");
		expect(harness.getThemeByName("one")?.fg("accent", "x")).toBe("<second:one:x>");
	});

	it("does not install an engine from an extension that fails to load", async () => {
		harness = await loadThemeEngineHarness();
		fs.writeFileSync(
			path.join(extensionsDir, "broken.ts"),
			`${engineSource("ghost", ["ghost"])}\nthrow new Error("load failed");`,
		);

		const result = await harness.discoverAndLoadExtensions([], tempDir, tempDir);

		expect(result.errors).toHaveLength(1);
		expect(harness.getThemeByName("ghost")).toBeUndefined();
		expect(harness.getAvailableThemes()).toEqual(expect.arrayContaining(["dark", "light"]));
	});
});
