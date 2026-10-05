import type { InlineExtension } from "../core/extensions/types.ts";
import exaSearchExtension from "./exa-search.ts";
import llamaExtension from "./llama/index.ts";

export const builtInExtensions: InlineExtension[] = [
	{ name: "exa-search", factory: exaSearchExtension },
	{ name: "llama.cpp", factory: llamaExtension, hidden: true },
];
