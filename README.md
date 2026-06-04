# Apple Intelligence Code Assistant for VS Code / VSCodium

A fully offline, local AI-powered code assistant extension for VS Code and VSCodium. This extension utilizes Apple's on-device ~3B parameter foundational LLM through the `FoundationModels` framework.

No data ever leaves your device — all model inference and operations run locally on your Mac.

**Caution**: I vibe-coded this in an afternoon using Antigravity. This is an unrefined user experience.

---

## Key Features

- 💬 **Sidebar Chat Interface**: Interact with the local Apple Intelligence model inside a premium glassmorphic dark-theme sidebar chat.
- ⚡ **Inline Code Generation**: Prompt the LLM using the input panel and directly insert the generated code at your cursor.
- 🔍 **Automatic Error Scraper**: Automatically detects runtime failures, compiler exceptions, and tracebacks inside your integrated terminal for Python, Node/JS, TypeScript, Go, Rust, and C/C++.
- 🛠 **One-Click Code Repair**: Provides immediate bug-fix suggestions for detected terminal errors with one-click code replacement.
- 🔒 **Security-Hardened Architecture**:
  - **No Cloud Dependencies**: Completely offline, runs entirely on-device.
  - **Local Host Bindings**: The HTTP server runs exclusively on loopback `127.0.0.1`.
  - **HMAC Signatures**: Interprocess calls from the VS Code host to the Swift Bridge are authenticated using a per-session generated token.
  - **No Silent Overwrites**: The extension will never modify your workspace files without showing an explicit warning confirmation modal.
  - **Sandboxed Webview**: Strict Content Security Policy (CSP) with unique nonces blocks code injection or external asset execution in the chat window.

---

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                       Mac Studio / MacBook                  │
│                                                             │
│  ┌───────────────────────┐         ┌─────────────────────┐  │
│  │ VSCodium / VS Code     │  HMAC  │ Swift Bridge Server │  │
│  │ (TypeScript Extension) ├────────► (NWListener TCP)    │  │
│  │                        │        │                     │  │
│  │ - Terminal watcher     │◄───────┤ - System framework  │  │
│  │ - Text editor controls │  SSE   │   FoundationModels  │  │
│  └───────────────────────┘         └──────────┬──────────┘  │
│                                               │             │
│                                    On-Device  ▼             │
│                                  ┌───────────────────────┐  │
│                                  │ Apple Neural Engine   │  │
│                                  │ (Local Foundation LLM)│  │
│                                  └───────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Getting Started

To build and run this extension locally:

1. Ensure you meet the system requirements (Apple Silicon Mac, macOS 26, Xcode 26, Apple Intelligence turned on).
2. Follow the detailed steps in [BUILD_INSTRUCTIONS.md](file:///Users/justintram/.gemini/antigravity/scratch/apple-code-assist/BUILD_INSTRUCTIONS.md) to build the Swift bridge and package the extension.
3. Install the resulting `.vsix` package into VSCodium or VS Code.

---

## Keyboard Shortcuts

- `Cmd+Shift+G` : Generate code from prompt.
- `Cmd+Shift+E` : Manually trigger error analysis.
- `Cmd+Shift+A` (or click activity bar icon): Focus the Assistant Chat sidebar panel.

---

## Configuration Settings

You can customize the extension via your user `settings.json`:

```json
{
  "appleCodeAssist.autoStartBridge": true
}
```

---

## License

MIT License.

