import { openAICompletionsApi } from "../api/openai-completions.lazy.ts";
import { openAIResponsesApi } from "../api/openai-responses.lazy.ts";
import type { ApiKeyAuth } from "../auth/types.ts";
import { createProvider, type Provider, type RefreshModelsContext } from "../models.ts";
import type {
	Context,
	Model,
	ProviderHeaders,
	ProviderStreams,
	SimpleStreamOptions,
	StreamOptions,
} from "../types.ts";
import { withOpenCodeSessionHeader } from "./opencode-headers.ts";

const PROVIDER_ID = "opencode-free";
const BASE_URL = "https://opencode.ai/zen/v1";
const ZEN_MODELS_URL = `${BASE_URL}/models`;
const MODELS_DEV_URL = "https://models.dev/api.json";
const FALLBACK_MODELS = [
	"big-pickle",
	"ling-3.0-flash-fin-free",
	"mimo-v2.5-free",
	"muse-spark-1.2-contributor-free",
	"muse-spark-1.3-contributor-free",
	"nemotron-3-ultra-free",
	"nemotron-3.5-lightning-free",
] as const;
const RESPONSES_MODELS = new Set([
	"muse-spark-1.2-contributor-free",
	"muse-spark-1.3-contributor-free",
]);
const FREE_MODEL = /(^|\/)(.*-(?:free|contributor-free)|big-pickle)$/i;
const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
const OPENCODE_HEADERS = {
	"x-opencode-client": "cli",
	"x-opencode-project": "global",
	"User-Agent": "opencode/1.18.31",
} as const;
const MODEL_REQUEST_HEADERS = { Accept: "application/json", ...OPENCODE_HEADERS } as const;

interface ZenModel {
	id: string;
	name?: string;
}

interface ZenResponse {
	data?: ZenModel[];
}

interface ModelsDevModel {
	name?: string;
	status?: string;
	tool_call?: boolean;
	cost?: Record<string, number>;
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
	const baseId = sourceId.replace(/-(?:free|contributor-free)$/i, "");
	const meta =
		catalog[sourceId] ??
		catalog[`opencode/${sourceId}`] ??
		catalog[baseId] ??
		catalog[`opencode/${baseId}`];
	const api: FreeApi =
		RESPONSES_MODELS.has(sourceId) || meta?.provider?.npm === "@ai-sdk/openai.responses"
			? "openai-responses"
			: "openai-completions";
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
						requiresReasoningContentOnAssistantMessages: false,
					}
				: {
						sessionAffinityFormat: "openai-nosession",
					},
	};
}

async function fetchJson(url: string, context: RefreshModelsContext): Promise<unknown> {
	const response = await fetch(url, {
		headers: MODEL_REQUEST_HEADERS,
		signal: context.signal,
	});
	if (!response.ok) throw new Error(`OpenCode returned HTTP ${response.status}`);
	return response.json();
}

function isZeroCostToolModel(meta: ModelsDevModel | undefined): boolean {
	return (
		meta?.status !== "deprecated" &&
		meta?.tool_call === true &&
		!!meta.cost &&
		Object.keys(meta.cost).length > 0 &&
		Object.values(meta.cost).every(
			(cost) => typeof cost === "number" && Number.isFinite(cost) && cost === 0,
		)
	);
}

function catalogModel(catalog: Record<string, ModelsDevModel>, id: string): ModelsDevModel | undefined {
	const normalized = id.replace(/^opencode\//, "");
	return catalog[normalized] ?? catalog[id];
}

async function fetchFreeModels(context: RefreshModelsContext): Promise<readonly Model<FreeApi>[]> {
	const zen = (await fetchJson(ZEN_MODELS_URL, context)) as ZenResponse;
	let modelsDev: ModelsDevResponse | undefined;
	try {
		modelsDev = (await fetchJson(MODELS_DEV_URL, context)) as ModelsDevResponse;
	} catch {
		context.signal.throwIfAborted();
		// Model metadata is required for live discovery. Use the persisted or
		// bundled catalog rather than exposing unverified Zen entries.
	}
	const catalog = modelsDev?.opencode?.models ?? {};
	const models = (zen.data ?? [])
		.filter((model) => FREE_MODEL.test(model.id))
		.filter((model) => isZeroCostToolModel(catalogModel(catalog, model.id)))
		.map((model) => modelFromZen(model, catalog));

	// Do not replace a known-good catalog with an empty one during a transient
	// upstream change. createProvider restores context.stored before this runs.
	if (models.length > 0) return models;
	const stored = context.stored?.models.filter((model) => model.provider === PROVIDER_ID);
	if (stored && stored.length > 0) return stored as readonly Model<FreeApi>[];
	return FALLBACK_MODELS.map((id) => modelFromZen({ id }, {}));
}

const keylessAuth: ApiKeyAuth = {
	name: "OpenCode free models",
	resolve: async ({ signal }) => {
		signal.throwIfAborted();
		return { auth: { apiKey: "public" } };
	},
};

function keylessOptions<T extends StreamOptions | SimpleStreamOptions>(options: T | undefined): T {
	const base = options ?? ({} as T);
	const headers: ProviderHeaders = { ...base.headers, ...OPENCODE_HEADERS };
	const hasSession = Object.keys(headers).some((key) => key.toLowerCase() === "x-opencode-session");
	if (!hasSession) {
		const id =
			globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
		headers["x-opencode-session"] = `ses_${id.replaceAll("-", "")}`;
	}
	return { ...base, headers };
}

function keylessContext(context: Context): Context {
	const systemPrompt = context.systemPrompt;
	if (systemPrompt === "You are opencode" || systemPrompt?.startsWith("You are opencode\n")) return context;
	return {
		...context,
		systemPrompt: systemPrompt ? `You are opencode\n${systemPrompt}` : "You are opencode",
	};
}

function keylessStreams(streams: ProviderStreams): ProviderStreams {
	const withSession = withOpenCodeSessionHeader(streams);
	return {
		stream: (model, context, options) =>
			withSession.stream(model, keylessContext(context), keylessOptions(options)),
		streamSimple: (model, context, options) =>
			withSession.streamSimple(model, keylessContext(context), keylessOptions(options)),
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