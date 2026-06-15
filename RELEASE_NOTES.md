# Release Notes - Apple Intelligence Code Assistant

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
