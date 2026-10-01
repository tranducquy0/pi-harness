import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import chalk from "chalk";
import type { ThemeBg, ThemeColor } from "./theme.ts";
import type { ThemeInterface } from "./theme-interface.ts";

export class DefaultTheme implements ThemeInterface {
	readonly name = "default";

	fg(_color: ThemeColor, text: string): string {
		return text; // Fallback to terminal default
	}

	bg(_color: ThemeBg, text: string): string {
		return text; // Fallback to terminal default
	}

	bold(text: string): string {
		return chalk.bold(text);
	}

	italic(text: string): string {
		return chalk.italic(text);
	}

	underline(text: string): string {
		return chalk.underline(text);
	}

	inverse(text: string): string {
		return chalk.inverse(text);
	}

	strikethrough(text: string): string {
		return chalk.strikethrough(text);
	}

	getFgAnsi(_color: ThemeColor): string {
		return "\x1b[39m";
	}

	getBgAnsi(_color: ThemeBg): string {
		return "\x1b[49m";
	}

	getThinkingBorderColor(_level: ThinkingLevel): (str: string) => string {
		return (str: string) => str;
	}

	getBashModeBorderColor(): (str: string) => string {
		return (str: string) => str;
	}
}
