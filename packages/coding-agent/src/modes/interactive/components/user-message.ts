import {
	Container,
	Markdown,
	type MarkdownTheme,
	stripTerminalSequences,
	truncateToWidth,
} from "@earendil-works/pi-tui";
import type { MarkdownTransformer } from "../../../core/extensions/types.ts";
import { getMarkdownTheme, theme } from "../theme/theme.ts";
import { createMarkdownTransform } from "./markdown-transform.ts";

const OSC133_ZONE_START = "\x1b]133;A\x07";
const OSC133_ZONE_END = "\x1b]133;B\x07";
const OSC133_ZONE_FINAL = "\x1b]133;C\x07";

/** Columns the opening `[ ` and closing ` ]` occupy, taken out of the content width. */
const BRACKET_WIDTH = 2;

/** Markdown pads every line to the content width; drop that so brackets hug the text. */
function trimTrailingSpaces(line: string): string {
	const plain = stripTerminalSequences(line);
	const trimmed = plain.replace(/[ \t]+$/, "");
	return trimmed.length === plain.length ? line : truncateToWidth(line, trimmed.length, "");
}

/**
 * Component that renders a user message.
 *
 * The message is delimited by a dim `[` on its first line and a dim `]` on its last, so it reads
 * as a block without a background fill. Assistant text is unmarked, so the brackets alone
 * separate the two sides of the transcript.
 */
export class UserMessageComponent extends Container {
	private text: string;
	private markdownTheme: MarkdownTheme;
	private outputPad: number;
	private markdownTransformers: readonly MarkdownTransformer[];
	private content = new Container();

	constructor(
		text: string,
		markdownTheme: MarkdownTheme = getMarkdownTheme(),
		outputPad = 1,
		markdownTransformers: readonly MarkdownTransformer[] = [],
	) {
		super();
		this.text = text;
		this.markdownTheme = markdownTheme;
		this.outputPad = outputPad;
		this.markdownTransformers = markdownTransformers;
		this.rebuild();
	}

	setOutputPad(padding: number): void {
		this.outputPad = padding;
	}

	override invalidate(): void {
		super.invalidate();
		this.rebuild();
	}

	private rebuild(): void {
		this.content.clear();
		this.content.addChild(
			new Markdown(
				this.text,
				0,
				0,
				this.markdownTheme,
				{
					color: (content: string) => theme.fg("userMessageText", content),
				},
				{
					preserveOrderedListMarkers: true,
					preserveBackslashEscapes: true,
					transform: createMarkdownTransform("user", false, this.markdownTransformers),
				},
			),
		);
	}

	override render(width: number): string[] {
		const contentWidth = Math.max(1, width - this.outputPad - BRACKET_WIDTH);
		const body = this.content.render(contentWidth);
		if (body.length === 0) {
			return [];
		}

		const indent = " ".repeat(this.outputPad);
		const continuation = `${indent}  `;
		const lastIndex = body.length - 1;
		const lines = body.map((line, index) => {
			const prefix = index === 0 ? `${indent}${theme.fg("dim", "[ ")}` : continuation;
			const suffix = index === lastIndex ? theme.fg("dim", " ]") : "";
			return prefix + trimTrailingSpaces(line) + suffix;
		});

		// Blank line above and below, then the OSC 133 shell-integration markers on the outer
		// lines so the whole block counts as one command zone.
		lines.unshift("");
		lines.push("");
		lines[0] = OSC133_ZONE_START + lines[0];
		const end = lines.length - 1;
		lines[end] = OSC133_ZONE_END + OSC133_ZONE_FINAL + lines[end];
		return lines;
	}
}
