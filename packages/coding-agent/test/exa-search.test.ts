import { afterEach, describe, expect, it, vi } from "vitest";
import { searchExa } from "../src/extensions/exa-search.ts";

afterEach(() => vi.restoreAllMocks());

describe("searchExa", () => {
	it("formats Exa results with citations and highlights", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(
				JSON.stringify({
					results: [
						{
							title: "Exa",
							url: "https://exa.ai",
							publishedDate: "2026-01-01",
							highlights: ["Relevant result"],
						},
					],
				}),
				{ status: 200 },
			),
		);

		await expect(searchExa("key", { query: "exa" }, undefined)).resolves.toContain(
			"[1] Exa\nhttps://exa.ai\nPublished: 2026-01-01\nRelevant result",
		);
		expect(fetch).toHaveBeenCalledWith(
			"https://api.exa.ai/search",
			expect.objectContaining({
				method: "POST",
				headers: expect.objectContaining({ "x-api-key": "key" }),
			}),
		);
	});

	it("returns a stable empty result", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ results: [] }), { status: 200 }));
		await expect(searchExa("key", { query: "nothing" }, undefined)).resolves.toBe("No search results found.");
	});

	it("surfaces API errors", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ error: "invalid key" }), { status: 401 }),
		);
		await expect(searchExa("bad", { query: "exa" }, undefined)).rejects.toThrow(
			"Exa search failed: HTTP 401: invalid key",
		);
	});
});
