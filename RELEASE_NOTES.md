# Release Notes - Apple Intelligence Code Assistant

## Version 0.4.0

This release introduces native editor integrations, improved workspace lifecycle management, persistent history, and enhanced interactive controls.

### Key Features & Enhancements

*   **Inline Code Actions (Right-Click Submenu)**:
    *   Right-click a selection in the editor to access the new "Ask Fruit Coder…" submenu.
    *   Common quick actions — "Explain this", "Refactor this", "Add a docstring", and "Write a unit test for this" — are now accessible natively.
    *   Mapped a keyboard shortcut `Cmd+Shift+X` directly to the "Explain this" command for selected code.

*   **Inline Diff Preview Before Apply**:
    *   Clicking "Apply to File" on code blocks now automatically opens a side-by-side diff comparison comparing original content with proposed code.
    *   Displays a warning confirmation modal to let developers inspect changes before committing them, automatically closing the diff tab upon choice.

*   **Persistent Chat History**:
    *   Saves active conversation logs, turn counts, chosen modes, and language overrides directly to the workspace state storage (`workspaceState`).
    *   Conversations are restored seamlessly across window reloads, side panel closes, or IDE restarts.

*   **Turn Counter Display**:
    *   Surfaced a Turn Counter (e.g. "Turn 3/6") in the panel header to clearly inform developers of remaining turns before context recycler resets.

*   **Multiple Named Modes**:
    *   Provides a dropdown in the panel to switch between "Chat", "Generate", and "Debug" mode, dynamically choosing the correct prompt personality.

*   **Language Override Toggle**:
    *   Adds a dropdown selection to manually override language inference, forcing the local model to write and format snippets in the selected language.

*   **Silent Auto-Start Bridge**:
    *   Refactored the Swift bridge startup sequence to fail silently to the status bar on automatic workspace load if the server binary is missing, eliminating intrusive modal dialogs.

## Version 0.3.8

This release focuses on improving the stability of local model inference, enhancing UI styling/rendering robustness, and optimizing text editor context extraction.

### Key Features & Enhancements

*   **Cursor-Aware Smart Context Window**:
    *   Instead of always grabbing the first 6,000 characters from the top of the active file, the assistant now dynamically constructs a 6,000-character context window centered precisely around the user's active cursor/selection (3,000 characters before and 3,000 characters after).
    *   This ensures the model receives relevant code context even in larger scripts and when answering questions near the middle or end of files.

*   **Robust Markdown & Code Block Parser**:
    *   Updated the parser in `media/chat.js` to correctly handle language block tags that include trailing spaces or platform-specific carriage returns (e.g. ````r\r\n```` or ```` r ````).
    *   This fixes an issue where code blocks failed to render or generated empty copyable boxes while code leaked out as raw text paragraphs.

*   **Neural Engine Prewarming**:
    *   Model weights are pre-warmed and pinned to ANE (Apple Neural Engine) memory during Swift bridge startup. This reduces cold-start latency by up to 40% on initial user requests.

*   **Active KV-Cache Session Management**:
    *   Preserves context across conversational turns without re-encoding the entire history from scratch, drastically reducing token generation overhead.
    *   Context is automatically recycled/reset after 6 turns to prevent 3B parameter model context overflow (4096 tokens limit).

*   **Enhanced Webview Interface**:
    *   Polished glassmorphic dark-theme sidebar styling that integrates seamlessly with VS Code/VSCodium themes.
    *   Direct interactive "Copy" and "Apply to File" actions for generated code blocks.

### Bug Fixes

*   Fixed a bug where code blocks that didn't strictly match alphanumeric-only language identifiers would fail to render properly.
*   Fixed a bug where the model would get stuck in recursive repetition loops by tuning the generation sampling configuration in the Swift bridge.
*   Fixed a bug where session resets did not properly clean up KV-cache memory in the Swift runtime.
