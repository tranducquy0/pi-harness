#!/usr/bin/env node

/**
 * Simplified local release script for pi-fork
 * 
 * Bumps workspace versions, updates changelogs, commits and tags,
 * without interacting with upstream registries or remotes.
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { findPackageDirectories } from "./package-workspaces.mjs";

const TARGET = process.argv[2];
if (!TARGET || !["major", "minor", "patch"].includes(TARGET)) {
	console.error("Usage: node scripts/fork-release.mjs <major|minor|patch>");
	process.exit(1);
}

function run(cmd) {
	console.log(`$ ${cmd}`);
	execSync(cmd, { stdio: "inherit" });
}

// 1. Bump versions locally
console.log(`Bumping workspace versions: ${TARGET}`);
run(`npm version ${TARGET} --workspaces --no-git-tag-version --no-workspaces-update`);
run(`node scripts/sync-versions.js`);
run(`npm install --package-lock-only --ignore-scripts`);

// 2. Get new version
const rootPkg = JSON.parse(readFileSync("package.json", "utf-8"));
const version = rootPkg.version;
console.log(`Version bumped to: ${version}`);

// 3. Update changelogs
const date = new Date().toISOString().split("T")[0];
const changelogs = findPackageDirectories()
    .map((dir) => join(dir, "CHANGELOG.md"))
    .filter(existsSync);

console.log("Updating CHANGELOG.md files...");
for (const path of changelogs) {
    let content = readFileSync(path, "utf-8");
    content = content.replace("## [Unreleased]", `## [${version}] - ${date}\n\n## [Unreleased]`);
    writeFileSync(path, content);
}

// 4. Finalize
console.log("Staging and committing...");
run("git add .");
run(`git commit -m "chore: release v${version}"`);
run(`git tag v${version}`);

console.log(`\nLocal release v${version} prepared.`);
console.log("Run 'git push' and 'git push --tags' when ready.");
