# Debug Resource Metrics

Live CPU, memory and runtime charts in VS Code's **Run and Debug** sidebar.

![VS Code](https://img.shields.io/badge/VS_Code-1.85%2B-007ACC)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6)
![License](https://img.shields.io/badge/license-MIT-green)

English · [Русский](README.ru-RU.md)

## Features

- Opens automatically when debugging starts.
- Shows process CPU, resident memory and elapsed runtime.
- Plots CPU and memory against runtime, matching your editor theme.
- Supports multiple sessions and retains recent completed sessions.
- Includes **en-US** and **ru-RU** localization, following VS Code's display language.

## Install & use

1. Open **Extensions → ⋯ → Install from VSIX…** and select the built `.vsix`.
2. Start debugging and expand **Resource Metrics** in **Run and Debug**.
3. If your debugger does not report a PID, click **Select process PID**.

PID detection uses the debugger's process event or attach configuration, with
evaluation fallbacks for Node.js and Python. Some debuggers require a breakpoint first.

## Settings

| Setting | Default |
| --- | --- |
| `debugResourceMetrics.sampleInterval` | `1000` ms between samples |
| `debugResourceMetrics.historySize` | `180` chart samples |
| `debugResourceMetrics.autoReveal` | `true` |

## Measurement notes

**CPU:** 100% means one fully used core; multithreaded processes can exceed it.
**Memory:** RSS / working set, in MiB. **Runtime:** time since debugging started,
including breakpoint pauses. Child processes are measured separately.

Collectors support Windows, Linux and macOS. With SSH, WSL or containers, the PID
must belong to the machine running the workspace extension host.
History stays in memory until the window or extension reloads; the list retains
five completed sessions alongside active sessions when new sessions start.

## Development

Requires Node.js with npm and Python 3 for VSIX packaging.

```sh
npm ci
npm test
npm run package
```

Press **F5** to launch an Extension Development Host. TypeScript sources compile
to `out/`; the extension has no runtime npm dependencies.

---

Created by **a3st** · [MIT](LICENSE)
