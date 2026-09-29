#!/usr/bin/env bash
#
# Set up a pi development checkout on Termux (Android), then build and link it.
#
# Termux has no /usr/bin and the npm toolchain ships no Android binaries, so a
# plain `npm run build` fails in three places. This script fixes all three:
#
#   1. tsgo (@typescript/native-preview) publishes no android-arm64 build, so
#      node_modules/.bin/tsgo is replaced with a shim to the stock tsc.
#   2. `#!/usr/bin/env` shebangs fail because the kernel resolves shebangs by
#      absolute path. Rewritten in node_modules/.bin and in the built bundle.
#   3. packages/ai/src/providers/data/ is gitignored and must be hydrated
#      before anything can import @earendil-works/pi-ai.
#
# Usage:
#   ./scripts/termux-setup.sh              install, build, and link
#   ./scripts/termux-setup.sh --no-build   install and link only
#   ./scripts/termux-setup.sh --rebuild    fix shebangs after an external build
#
# After changing pi itself, rebuild and re-link with:
#   npm run build:offline && ./scripts/termux-setup.sh --rebuild

set -euo pipefail

cd "$(dirname "$0")/.."

PREFIX="${PREFIX:-/data/data/com.termux/files/usr}"
BUILD=true
REBUILD_ONLY=false

for arg in "$@"; do
	case "$arg" in
	--no-build) BUILD=false ;;
	--rebuild) REBUILD_ONLY=true ;;
	-h | --help)
		sed -n '2,20p' "$0"
		exit 0
		;;
	*)
		printf 'unknown option: %s\n' "$arg" >&2
		exit 1
		;;
	esac
done

if [ ! -x "$PREFIX/bin/sh" ]; then
	printf 'no Termux shell at %s; set PREFIX to your Termux prefix\n' "$PREFIX" >&2
	exit 1
fi

# Rewrite `#!/usr/bin/env <interp>` to an absolute interpreter path. Only
# touches node_modules and build output, never tracked files.
fix_shebangs() {
	local changed=0 link target first interp rest tmp
	for link in node_modules/.bin/*; do
		[ -e "$link" ] || continue
		target=$(readlink -f "$link" 2>/dev/null) || continue
		[ -f "$target" ] || continue
		first=$(head -n 1 "$target" 2>/dev/null) || continue
		case $first in
		'#!/usr/bin/env '*) ;;
		*) continue ;;
		esac
		interp=${first#'#!/usr/bin/env '}
		interp=${interp%% *}
		rest=${first#'#!/usr/bin/env '$interp}
		[ -x "$PREFIX/bin/$interp" ] || continue
		tmp="$target.shebang-tmp"
		printf '#!%s/bin/%s%s\n' "$PREFIX" "$interp" "$rest" >"$tmp"
		tail -n +2 "$target" >>"$tmp"
		cat "$tmp" >"$target"
		rm -f "$tmp"
		changed=$((changed + 1))
	done
	for target in packages/coding-agent/dist/bundle/*.js; do
		[ -f "$target" ] || continue
		sed -i "1s|^#!/usr/bin/env |#!$PREFIX/bin/|" "$target"
	done
	printf 'rewrote %s node_modules shebangs\n' "$changed"
}

# 1. tsgo shim. ES2024 because tsc enforces the RegExp `v` flag against the
# target while tsgo allows it under the repository's ES2022 base config.
install_tsgo_shim() {
	cat >node_modules/.bin/tsgo <<EOF
#!$PREFIX/bin/sh
exec node "$PWD/node_modules/typescript/bin/tsc" --target ES2024 --lib ES2024 "\$@"
EOF
	chmod +x node_modules/.bin/tsgo
}

# 3. Model data. The generator can fail when upstream stops serving a provider
# (currently kimi-coding), and it writes nothing in that case, so fall back to
# the data shipped in the published package.
hydrate_model_data() {
	if [ -d packages/ai/src/providers/data ] && [ -n "$(ls -A packages/ai/src/providers/data 2>/dev/null)" ]; then
		printf 'model data already present\n'
		return
	fi
	printf 'hydrating model data...\n'
	if npm run hydrate:model-data; then
		return
	fi
	local version
	version=$(node -p "require('./packages/ai/package.json').version")
	printf 'generator failed; falling back to published data for %s\n' "$version"
	local tmp
	tmp=$(mktemp -d)
	(cd "$tmp" && npm pack "@earendil-works/pi-ai@$version" >/dev/null)
	mkdir -p packages/ai/src/providers/data
	tar xzf "$tmp"/earendil-works-pi-ai-"$version".tgz -C "$tmp"
	cp "$tmp"/package/dist/providers/data/*.json "$tmp"/package/dist/providers/data/.manifest.json \
		packages/ai/src/providers/data/
	rm -rf "$tmp"
}

if [ "$REBUILD_ONLY" = true ]; then
	fix_shebangs
	exit 0
fi

if [ ! -d node_modules ]; then
	printf 'installing dependencies...\n'
	npm install --ignore-scripts
fi

install_tsgo_shim
fix_shebangs
hydrate_model_data
npm --prefix packages/ai run check:model-data

if [ "$BUILD" = true ]; then
	# build:offline keeps packages/ai from regenerating models.generated.ts from
	# the live catalog, which would otherwise rewrite tracked files.
	printf 'building...\n'
	npm run build:offline
	fix_shebangs
fi

printf 'linking pi...\n'
(cd packages/coding-agent && npm link)
pi --version
