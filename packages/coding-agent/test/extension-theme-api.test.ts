import { describe, expect, test } from "vitest";
import type { ExtensionUIContext } from "../src/core/extensions/types.ts";
import { InteractiveMode } from "../src/modes/interactive/interactive-mode.ts";
import type { ThemeInterface } from "../src/modes/interactive/theme/theme-interface.ts";
import { initTheme, setThemeInstance, theme } from "../src/modes/interactive/theme/theme.ts";

class StubTheme implements ThemeInterface {
	readonly name = "stub";
	readonly sourcePath = "<stub-theme>";
	fg(): string {
		return "fg";
	}
	bg(): string {
		return "bg";
	}
	bold(text: string): string {
		return text;
	}
	italic(text: string): string {
		return text;
	}
	underline(text: string): string {
		return text;
	}
	inverse(text: string): string {
		return text;
	}
	strikethrough(text: string): string {
		return text;
	}
	getFgAnsi(): string {
		return "";
	}
	getBgAnsi(): string {
		return "";
	}
	getThinkingBorderColor() {
		return (str: string) => str;
	}
	getBashModeBorderColor() {
		return (str: string) => str;
	}
}

function createUIContextStub() {
	const calls: { setThemeInstance: ThemeInterface[]; setThemeName: string[] } = {
		setThemeInstance: [],
		setThemeName: [],
	};
	const persistedThemes: string[] = [];
	const fakeThis = {
		themeController: {
			setThemeInstance: (themeInstance: ThemeInterface) => {
				calls.setThemeInstance.push(themeInstance);
				return { success: true };
			},
			setThemeName: (themeName: string) => {
				calls.setThemeName.push(themeName);
				return { success: true };
			},
		},
		settingsManager: {
			getTheme: () => undefined,
			setTheme: (name: string) => persistedThemes.push(name),
		},
	};
	const ui = (InteractiveMode.prototype as unknown as { createExtensionUIContext(): ExtensionUIContext })
		.createExtensionUIContext.call(fakeThis as unknown as InteractiveMode);
	return { ui, calls, persistedThemes };
}

describe("ExtensionUIContext.setTheme", () => {
	test("applies a theme object from a custom theme engine", () => {
		initTheme("dark");
		const { ui, calls, persistedThemes } = createUIContextStub();
		const stub = new StubTheme();

		expect(ui.setTheme(stub)).toEqual({ success: true });
		expect(calls.setThemeInstance).toEqual([stub]);
		expect(calls.setThemeName).toEqual([]);
		expect(persistedThemes).toEqual([]);
	});

	test("applies a built-in theme object and persists it", () => {
		initTheme("dark");
		const { ui, calls, persistedThemes } = createUIContextStub();
		const builtin = ui.getTheme("light");
		if (!builtin) throw new Error("light theme not found");

		expect(ui.setTheme(builtin)).toEqual({ success: true });
		expect(calls.setThemeInstance).toEqual([builtin]);
		expect(calls.setThemeName).toEqual([]);
		expect(persistedThemes).toEqual([]);
	});

	test("loads and persists a theme by name", () => {
		initTheme("dark");
		const { ui, calls, persistedThemes } = createUIContextStub();

		expect(ui.setTheme("light")).toEqual({ success: true });
		expect(calls.setThemeName).toEqual(["light"]);
		expect(calls.setThemeInstance).toEqual([]);
		expect(persistedThemes).toEqual(["light"]);
	});

	test("a custom theme object reaches the global theme", () => {
		initTheme("dark");
		const stub = new StubTheme();
		setThemeInstance(stub);

		expect(theme.name).toBe("stub");
		expect(theme.fg("accent", "x")).toBe("fg");
	});
});
