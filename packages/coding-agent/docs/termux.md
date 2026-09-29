# Termux (Android) Setup

Pi runs on Android via [Termux](https://termux.dev/), a terminal emulator and Linux environment for Android.

## Prerequisites

1. Install [Termux](https://github.com/termux/termux-app#installation) from GitHub or F-Droid (not Google Play, that version is deprecated)
2. Install [Termux:API](https://github.com/termux/termux-api#installation) from GitHub or F-Droid for clipboard and other device integrations

## Installation

```bash
# Update packages
pkg update && pkg upgrade

# Install dependencies
pkg install nodejs termux-api git

# Install pi
npm install -g --ignore-scripts @earendil-works/pi-coding-agent

# Create config directory
mkdir -p ~/.pi/agent

# Run pi
pi
```

## Building from Source on Termux

`npm install -g @earendil-works/pi-coding-agent` works because the published tarball ships a prebuilt
bundle. Building from a clone needs three workarounds, all of them environment issues rather than
pi bugs.

### 1. `tsgo` has no Android build

Builds and `npm run check` call `tsgo` (`@typescript/native-preview`). That package publishes
binaries for Windows, macOS, and Linux only, so on Termux it fails with
`Unable to resolve @typescript/native-preview-android-arm64`. Substitute the stock compiler:

```bash
cat > node_modules/.bin/tsgo <<'EOF'
#!/data/data/com.termux/files/usr/bin/sh
exec node "$PWD/node_modules/typescript/bin/tsc" --target ES2024 --lib ES2024 "$@"
EOF
chmod +x node_modules/.bin/tsgo
```

`--target ES2024` is required because `tsc` enforces the RegExp `v` flag against the target while
`tsgo` allows it under the repository's ES2022 base config.

### 2. `#!/usr/bin/env` shebangs fail

Termux has no `/usr/bin/env`, and the kernel resolves a shebang by absolute path, so a `PATH` shim
does not help. Every npm `.bin` script dies with `bad interpreter` (exit 126). Rewrite the shebangs
in place after `npm install`:

```bash
prefix=/data/data/com.termux/files/usr/bin
for link in node_modules/.bin/*; do
	target=$(readlink -f "$link")
	[ -f "$target" ] || continue
	first=$(head -n 1 "$target")
	case $first in '#!/usr/bin/env '*) ;; *) continue ;; esac
	interp=${first#'#!/usr/bin/env '}; interp=${interp%% *}
	[ -x "$prefix/$interp" ] || continue
	rest=${first#'#!/usr/bin/env '$interp}
	printf '#!%s/%s%s\n' "$prefix" "$interp" "$rest" > "$target.shebang"
	tail -n +2 "$target" >> "$target.shebang"
	cat "$target.shebang" > "$target" && rm "$target.shebang"
done
```

The same applies to the emitted entry points, which the build overwrites on every run:

```bash
for entry in packages/coding-agent/dist/bundle/*.js; do
	sed -i "1s|^#!/usr/bin/env |#!$prefix/|" "$entry"
done
```

Run `bash ./test.sh` rather than `./test.sh` for the same reason: the script itself has a
`#!/usr/bin/env bash` shebang. `npm run check` still cannot run, because Biome has no Android
binary at all; run the individual stages (`check:pinned-deps`, `check:runtime-deps`,
`check:ts-imports`, `check:entry-graphs`, `check:shrinkwrap`, `check:install-lock:coding-agent`,
`tsgo --noEmit`) instead.

### 3. Model data must be hydrated before building

`packages/ai/src/providers/data/` is gitignored and generated, so a fresh clone cannot import
`@earendil-works/pi-ai` until it exists. Without it every provider fails to load with
`Cannot find module './data/<provider>.json'`, which takes most of the test suite with it.

```bash
npm run hydrate:model-data
npm --prefix packages/ai run check:model-data
```

If the generator reports `Cannot hydrate missing providers: <id>`, upstream no longer serves that
provider and nothing is written. The released package contains the same generated data, so it can be
used instead:

```bash
npm pack @earendil-works/pi-ai@<version>
mkdir -p packages/ai/src/providers/data
tar xzf earendil-works-pi-ai-<version>.tgz
cp package/dist/providers/data/*.json package/dist/providers/data/.manifest.json \
	packages/ai/src/providers/data/
```

Then build and link. The workspace packages must be built before the bundle, so use the root
`build:offline` script or build `packages/ai` with its offline target; the plain `build` target
regenerates `packages/ai/src/models.generated.ts` from the live catalog first.

```bash
npm run build:offline
cd packages/coding-agent && npm link
pi --version
```

`npm link` symlinks the package directory, so rebuild and re-link after changing pi itself.

## Clipboard Support

Clipboard operations use `termux-clipboard-set` and `termux-clipboard-get` when running in Termux. The Termux:API app must be installed for these to work.

Image clipboard is not supported on Termux (the `ctrl+v` image paste feature will not work).

## Example AGENTS.md for Termux

Create `~/.pi/agent/AGENTS.md` to help the agent understand the Termux environment:

````markdown
# Agent Environment: Termux on Android

## Location
- **OS**: Android (Termux terminal emulator)
- **Home**: `/data/data/com.termux/files/home`
- **Prefix**: `/data/data/com.termux/files/usr`
- **Shared storage**: `/storage/emulated/0` (Downloads, Documents, etc.)

## Opening URLs
```bash
termux-open-url "https://example.com"
```

## Opening Files
```bash
termux-open file.pdf          # Opens with default app
termux-open --chooser image.jpg      # Choose app
```

## Clipboard
```bash
termux-clipboard-set "text"   # Copy
termux-clipboard-get          # Paste
```

## Notifications
```bash
termux-notification -t "Title" -c "Content"
```

## Device Info
```bash
termux-battery-status         # Battery info
termux-wifi-connectioninfo    # WiFi info
termux-telephony-deviceinfo   # Device info
```

## Sharing
```bash
termux-share -a send file.txt # Share file
```

## Other Useful Commands
```bash
termux-toast "message"        # Quick toast popup
termux-vibrate                # Vibrate device
termux-tts-speak "hello"      # Text to speech
termux-camera-photo out.jpg   # Take photo
```

## Notes
- Termux:API app must be installed for `termux-*` commands
- Use `pkg install termux-api` for the command-line tools
- Storage permission needed for `/storage/emulated/0` access
````

## Limitations

- **No image clipboard**: Termux clipboard API only supports text
- **Storage access**: To access files in `/storage/emulated/0` (Downloads, etc.), run `termux-setup-storage` once to grant permissions

## Troubleshooting

### Clipboard not working

Ensure both apps are installed:
1. Termux (from GitHub or F-Droid)
2. Termux:API (from GitHub or F-Droid)

Then install the CLI tools:
```bash
pkg install termux-api
```

### Permission denied for shared storage

Run once to grant storage permissions:
```bash
termux-setup-storage
```

### Node.js installation issues

If npm fails, try clearing the cache:
```bash
npm cache clean --force
```
