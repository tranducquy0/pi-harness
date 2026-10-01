#!/usr/bin/env node
import { execSync } from "node:child_process";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

console.log("=== Building and Packing for Termux ===");

// 1. Build workspace
console.log("Building workspace...");
execSync("npm run build", { stdio: "inherit" });

// 2. Prepare output dir
const outDir = join(process.cwd(), ".dist-termux");
mkdirSync(outDir, { recursive: true });

// 3. Pack the coding-agent
console.log("Packing @earendil-works/pi-coding-agent...");
execSync(`npm pack ./packages/coding-agent --pack-destination ${outDir}`, { stdio: "inherit" });

console.log(`\nLocal npm package produced in: ${outDir}`);
