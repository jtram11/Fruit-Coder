# Building and Installing the Apple Intelligence Code Assistant

This document contains step-by-step instructions for building, packaging, and installing the VS Code / VSCodium extension and its on-device Swift bridge server.

---

## Prerequisites

To compile and run this extension, you must satisfy the following system requirements:

1. **Operating System**: macOS 26 ("Tahoe") or newer.
2. **Hardware**: Apple Silicon Mac (M1, M2, M3, M4 series or newer).
3. **Apple Intelligence**: Must be **enabled** in your macOS System Settings.
4. **Xcode**: Xcode 26 (Beta) or newer. Command Line Tools must be installed (`xcode-select --install`).
5. **Node.js & npm**: Node.js v18.0.0 or newer.

---

## Step 1: Compile the Swift Bridge Server

The Swift bridge communicates directly with macOS's local `FoundationModels` framework and runs as an HTTP loopback server.

1. Navigate to the bridge directory:
   ```bash
   cd apple-llm-bridge
   ```
2. Build the server in Release mode (this optimizes the code and handles async concurrency efficiently):
   ```bash
   swift build -c release
   ```
3. Verify that the build succeeded by checking the binary output path:
   ```bash
   ls -la .build/release/apple-llm-bridge
   ```

*Note: You do not need to run the bridge server manually. The VS Code extension automatically spawns and manages this server as a child process when VS Code/VSCodium starts.*

---

## Step 2: Install Extension Dependencies and Compile

Now compile the TypeScript code for the extension.

1. Navigate to the root directory of the extension:
   ```bash
   cd ..
   ```
2. Install npm development dependencies:
   ```bash
   npm install
   ```
3. Compile the TypeScript sources into JavaScript:
   ```bash
   npm run compile
   ```
   *If you are modifying code, you can use `npm run watch` to compile on the fly.*

---

## Step 3: Package the Extension as a `.vsix` Bundle

We use VS Code's extension packager `@vscode/vsce` to package the extension code, stylesheets, and assets into a single offline-installable `.vsix` file.

1. Package the extension:
   ```bash
   npx @vscode/vsce package --no-dependencies
   ```
2. This creates a file named `apple-code-assist-0.1.0.vsix` in the project root directory.

---

## Step 4: Install the Extension into VSCodium

Since this extension runs fully locally and doesn't rely on online marketplaces, you install it manually.

### Method A: Using the Command Line (Recommended)

1. Open your terminal.
2. Run the following command (substituting `codium` with your shell command if customized):
   ```bash
   codium --install-extension apple-code-assist-0.1.0.vsix
   ```

### Method B: Using the VSCodium GUI

1. Open **VSCodium**.
2. Click the **Extensions** icon in the Activity Bar on the side of VSCodium (`Cmd+Shift+X`).
3. Click the **`...` (Views and More Actions)** dropdown menu in the top right corner of the Extensions panel.
4. Select **Install from VSIX...**.
5. Locate and select the `apple-code-assist-0.1.0.vsix` file that was generated.
6. Click **Install**.
7. Restart VSCodium to complete activation.

---

## Security Verification Check

Once installed, check that the local loopback security controls are functioning correctly:

1. **Port Check**: The bridge binds exclusively to `127.0.0.1:19847`. Ensure it does not respond on external interfaces:
   ```bash
   curl -I http://<your-lan-ip>:19847/api/health
   # Should fail to connect (connection refused)
   ```
2. **Signature Verification**: Attempting to send queries without a signature should fail:
   ```bash
   curl -X POST http://127.0.0.1:19847/api/generate \
     -H "Content-Type: application/json" \
     -d '{"systemPrompt":"test","userPrompt":"hello"}'
   # Should return "413 Payload Too Large" or "401 Unauthorized"
   ```
3. **Session Secret**: Check that the key file is restricted to your user account:
   ```bash
   ls -la ~/.apple-llm-bridge/session.key
   # Permissions should be exactly -rw------- (0600)
   ```
