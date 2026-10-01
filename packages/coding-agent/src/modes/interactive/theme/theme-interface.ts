import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { EditorTheme, MarkdownTheme, SelectListTheme, SettingsListTheme } from "@earendil-works/pi-tui";
import type { ThemeBg, ThemeColor } from "./theme.ts";

export interface ThemeInterface {
	readonly name?: string;
	readonly sourcePath?: string;

	fg(color: ThemeColor, text: string): string;
	bg(color: ThemeBg, text: string): string;
	bold(text: string): string;
	italic(text: string): string;
	underline(text: string): string;
	inverse(text: string): string;
	strikethrough(text: string): string;
	getFgAnsi(color: ThemeColor): string;
	getBgAnsi(color: ThemeBg): string;
	getThinkingBorderColor(level: ThinkingLevel): (str: string) => string;
	getBashModeBorderColor(): (str: string) => string;
}
