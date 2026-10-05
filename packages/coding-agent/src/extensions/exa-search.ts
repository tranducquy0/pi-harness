import type { ExtensionAPI } from "../core/extensions/types.ts";
import { Type } from "typebox";

const ExaSearchParams = Type.Object({
	query: Type.String({ minLength: 1, description: "Web search query" }),
	numResults: Type.Optional(
		Type.Integer({ minimum: 1, maximum: 20, description: "Number of results to return (default: 8)" }),
	),
	includeDomains: Type.Optional(Type.Array(Type.String(), { description: "Only search these domains" })),
	excludeDomains: Type.Optional(Type.Array(Type.String(), { description: "Exclude these domains" })),
});

type ExaSearchParams = {
	query: string;
	numResults?: number;
	includeDomains?: string[];
	excludeDomains?: string[];
};

type ExaResult = {
	title?: unknown;
	url?: unknown;
	publishedDate?: unknown;
	highlights?: unknown;
};

type ExaResponse = {
	results?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function getResults(payload: unknown): ExaResult[] {
	if (!isRecord(payload) || !Array.isArray(payload.results)) return [];
	return payload.results.filter(isRecord) as ExaResult[];
}

function text(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function formatResult(result: ExaResult, index: number): string | undefined {
	const url = text(result.url);
	if (!url) return undefined;
	const title = text(result.title) ?? url;
	const date = text(result.publishedDate);
	const highlights = Array.isArray(result.highlights)
		? result.highlights.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
		: [];
	const lines = [`[${index}] ${title}`, url];
	if (date) lines.push(`Published: ${date}`);
	if (highlights.length > 0) lines.push(highlights.slice(0, 3).join(" "));
	return lines.join("\n");
}

async function searchExa(apiKey: string, params: ExaSearchParams, signal: AbortSignal | undefined): Promise<string> {
	const timeout = AbortSignal.timeout(15_000);
	const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
	const response = await fetch("https://api.exa.ai/search", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-api-key": apiKey,
		},
		body: JSON.stringify({
			query: params.query,
			numResults: params.numResults ?? 8,
			...(params.includeDomains ? { includeDomains: params.includeDomains } : {}),
			...(params.excludeDomains ? { excludeDomains: params.excludeDomains } : {}),
			contents: { highlights: { maxCharacters: 1200 } },
		}),
		signal: requestSignal,
	});

	if (!response.ok) {
		let message = `Exa search failed: HTTP ${response.status}`;
		try {
			const body: unknown = await response.json();
			if (isRecord(body)) {
				const detail = text(body.error) ?? text(body.message);
				if (detail) message += `: ${detail}`;
			}
		} catch {
			// Keep status-only error when response body is not JSON.
		}
		throw new Error(message);
	}

	const payload = (await response.json()) as ExaResponse;
	const formatted = getResults(payload)
		.map((result, index) => formatResult(result, index + 1))
		.filter((result): result is string => result !== undefined);
	return formatted.length > 0 ? formatted.join("\n\n") : "No search results found.";
}

export default function exaSearchExtension(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "search",
		label: "Web search",
		description: "Search the web with Exa. Results include source URLs and relevant highlights.",
		promptSnippet: "search the web with Exa",
		parameters: ExaSearchParams,
		async execute(_toolCallId, params, signal) {
			const apiKey = process.env.EXA_API_KEY;
			if (!apiKey) throw new Error("EXA_API_KEY is not set");
			return {
				content: [{ type: "text", text: await searchExa(apiKey, params, signal) }],
				details: {},
			};
		},
	});
}

export { searchExa };
