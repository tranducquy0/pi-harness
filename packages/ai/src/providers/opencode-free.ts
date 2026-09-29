import { openAICompletionsApi } from "../api/openai-completions.lazy.ts";
import { openAIResponsesApi } from "../api/openai-responses.lazy.ts";
import type { ApiKeyAuth } from "../auth/types.ts";
import { createProvider, type Provider, type RefreshModelsContext } from "../models.ts";
import type { Model, ProviderStreams, SimpleStreamOptions, StreamOptions } from "../types.ts";
import { withOpenCodeSessionHeader } from "./opencode-headers.ts";

const PROVIDER_ID = "opencode-free";
const BASE_URL = "https://opencode.ai/zen/v1";
const ZEN_MODELS_URL = `${BASE_URL}/models`;
const MODELS_DEV_URL = "https://models.dev/api.json";
const FREE_MODEL = /(^|\/)(.*-free|big-pickle)$/i;
const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
const OPENCODE_HEADERS = {
	"x-opencode-client": "cli",
	"x-opencode-project": "global",
	"User-Agent": "opencode/0.0.0-dev",
} as const;

interface ZenModel {
	id: string;
	name?: string;
}

interface ZenResponse {
	data?: ZenModel[];
}

interface ModelsDevModel {
	name?: string;
	reasoning?: boolean;
	reasoning_options?: Array<{ type: string; values?: string[] }>;
	limit?: { context?: number; output?: number };
	modalities?: { input?: string[] };
	provider?: { npm?: string };
}

interface ModelsDevResponse {
	opencode?: { models?: Record<string, ModelsDevModel> };
}

type FreeApi = "openai-completions" | "openai-responses";

function buildThinkingLevelMap(meta: ModelsDevModel | undefined): Record<string, string | null> | undefined {
	if (!meta?.reasoning) return undefined;
	const effort = meta.reasoning_options?.find((option) => option.type === "effort")?.values ?? [];
	if (effort.length === 0) return undefined;
	const map: Record<string, string | null> = Object.fromEntries(THINKING_LEVELS.map((level) => [level, null]));
	let hasOff = false;
	for (const value of effort) {
		if (value === "none") {
			map.off = "off";
			hasOff = true;
		} else if (value in map) {
			map[value] = value;
		}
	}
	if (meta.reasoning_options?.some((option) => option.type === "toggle") && !hasOff) map.off = "off";
	return map;
}

function modelFromZen(model: ZenModel, catalog: Record<string, ModelsDevModel>): Model<FreeApi> {
	const sourceId = model.id.replace(/^opencode\//, "");
	const baseId = sourceId.replace(/-free$/, "");
	const meta = catalog[sourceId] ?? catalog[baseId];
	const api: FreeApi = meta?.provider?.npm === "@ai-sdk/openai" ? "openai-responses" : "openai-completions";
	const input: ("text" | "image")[] = meta?.modalities?.input?.includes("image") ? ["text", "image"] : ["text"];
	return {
		id: sourceId,
		name: model.name ?? meta?.name ?? `${baseId.replace(/[-_]+/g, " ")} (Free)`,
		api,
		provider: PROVIDER_ID,
		baseUrl: BASE_URL,
		headers: OPENCODE_HEADERS,
		reasoning: meta?.reasoning ?? false,
		thinkingLevelMap: buildThinkingLevelMap(meta),
		input,
		contextWindow: meta?.limit?.context ?? 128_000,
		maxTokens: meta?.limit?.output ?? 16_384,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		compat:
			api === "openai-completions"
				? {
					supportsStore: false,
					supportsDeveloperRole: false,
					supportsFinishReason: false,
					maxTokensField: "max_tokens",
					requiresReasoningContentOnAssistantMessages: true,
				}
				: undefined,
	};
}

async function fetchJson(url: string, context: RefreshModelsContext): Promise<unknown> {
	const response = await fetch(url, {
		headers: url === ZEN_MODELS_URL ? OPENCODE_HEADERS : undefined,
		signal: context.signal,
	});
	if (!response.ok) throw new Error(`OpenCode returned HTTP ${response.status}`);
	return response.json();
}

async function fetchFreeModels(context: RefreshModelsContext): Promise<readonly Model<FreeApi>[]> {
	const [zen, modelsDev] = await Promise.all([
		fetchJson(ZEN_MODELS_URL, context) as Promise<ZenResponse>,
		fetchJson(MODELS_DEV_URL, context).catch(() => undefined) as Promise<ModelsDevResponse | undefined>,
	]);
	const catalog = modelsDev?.opencode?.models ?? {};
	return (zen.data ?? [])
		.filter((model) => FREE_MODEL.test(model.id))
		.map((model) => modelFromZen(model, catalog));
}

const keylessAuth: ApiKeyAuth = {
	name: "OpenCode free models",
	resolve: async ({ signal }) => {
		signal.throwIfAborted();
		return { auth: { apiKey: "none" } };
	},
};

function keylessOptions<T extends StreamOptions | SimpleStreamOptions>(options: T | undefined): T | undefined {
	if (!options) return options;
	return {
		...options,
		headers: { ...options.headers, ...OPENCODE_HEADERS, Authorization: null },
	};
}

function keylessStreams(streams: ProviderStreams): ProviderStreams {
	const withSession = withOpenCodeSessionHeader(streams);
	return {
		stream: (model, context, options) => withSession.stream(model, context, keylessOptions(options)),
		streamSimple: (model, context, options) => withSession.streamSimple(model, context, keylessOptions(options)),
	};
}

export function opencodeFreeProvider(): Provider<FreeApi> {
	return createProvider<FreeApi>({
		id: PROVIDER_ID,
		name: "OpenCode Zen (Free)",
		auth: { apiKey: keylessAuth },
		models: [],
		fetchModels: fetchFreeModels,
		api: {
			"openai-completions": keylessStreams(openAICompletionsApi()),
			"openai-responses": keylessStreams(openAIResponsesApi()),
		},
	});
}