# Pi Harness

[Pi Harness](https://github.com/tranducquy0/pi-harness) is a fork of [Pi](https://github.com/badlogic/pi-mono), a terminal coding agent. This fork focuses on two things: **simplicity** and **usability**.

It keeps Pi's small, extensible core while making the project easier to run, understand, and adapt. The default experience is a straightforward terminal agent with a small set of useful tools. More specialized workflows belong in extensions, skills, prompt templates, themes, or packages instead of the core.

## What is included

- **Interactive terminal agent**: work with an LLM directly in a project directory.
- **Simple built-in tools**: read files, edit files, write files, and run commands.
- **Sessions**: resume work, branch conversations, and compact long histories.
- **Extensibility**: add tools, commands, providers, UI, skills, prompts, and themes without changing the core.
- **Multiple interfaces**: interactive, print/JSON, RPC, and an embeddable SDK.
- **Multi-provider support**: use supported hosted providers, local models, or add a custom provider.

Pi does not try to prescribe a complete development methodology. Features such as planning, sub-agents, permissions, and project-specific automation can be added when they are useful for your workflow.

## Install and run

Clone the repository and install its dependencies:

```bash
git clone https://github.com/tranducquy0/pi-harness.git
cd pi-harness
npm install --ignore-scripts
```

Run Pi from the source tree:

```bash
cd path/to/project
/path/to/pi-harness/pi-test.sh
```

Set an API key before starting, or use `/login` when a supported subscription login is available. See the [quickstart](packages/coding-agent/docs/quickstart.md) for authentication and first-session guidance.

## Repository layout

| Component | Purpose |
| --- | --- |
| [`packages/coding-agent`](packages/coding-agent) | Interactive coding-agent CLI, SDK, and RPC entry points |
| [`packages/agent`](packages/agent) | Agent runtime, tools, sessions, and state management |
| [`packages/ai`](packages/ai) | Provider-independent LLM and model APIs |
| [`packages/tui`](packages/tui) | Terminal UI components and rendering |
| [`packages/chord`](packages/chord) | Application composition and service runtime |
| [`packages/telemetry`](packages/telemetry) | Optional telemetry contracts and adapters |

Start with the [coding-agent documentation index](packages/coding-agent/docs/index.md). It links to quickstart, usage, providers, customization, security, platform setup, and SDK documentation.

## Design principles

- Keep the default path short and understandable.
- Prefer boring, explicit behavior over hidden automation.
- Keep the core small; use extensions for optional behavior.
- Make the terminal experience usable without requiring a large framework.
- Preserve escape hatches for users who need deeper control.

## Development

```bash
npm install --ignore-scripts
npm run check
./test.sh
```

Build the repository when you need compiled packages:

```bash
npm run build
# or, without refreshing model data:
npm run build:offline
```

To run Pi directly from the repository:

```bash
./pi-test.sh
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines and [AGENTS.md](AGENTS.md) for repository development rules.

## Security

Pi runs with the permissions of the user who starts it. It can read and change files and run commands in the current environment. Treat extensions, skills, and packages as executable code. Use a container or another sandbox when stronger isolation is required. See [coding-agent security documentation](packages/coding-agent/docs/security.md).

## License

MIT
