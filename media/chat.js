/* =============================================================================
   media/chat.js — Client-side logic for Chat Webview
   ============================================================================= */

(function () {
    const vscode = acquireVsCodeApi();

    const messagesList = document.getElementById('messages-list');
    const promptInput = document.getElementById('prompt-input');
    const sendButton = document.getElementById('send-button');
    const typingIndicator = document.getElementById('typing-indicator');
    const turnCounter = document.getElementById('turn-counter');
    const modeSelect = document.getElementById('mode-select');
    const languageSelect = document.getElementById('language-select');

    let currentBotBubble = null;
    let currentBotContent = '';

    function updateTurnCounter(count) {
        if (turnCounter) {
            turnCounter.textContent = `Turn ${count}/6`;
        }
    }

    // Shared HTML-escape utility used by both the structured renderer and formatMarkdown.
    function escapeHtml(unsafe) {
        return String(unsafe)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Focus textarea on start
    promptInput.focus();

    // Trigger Send
    sendButton.addEventListener('click', sendMessage);
    promptInput.addEventListener('keydown', (e) => {
        // Cmd+Enter or Ctrl+Enter to send
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            sendMessage();
        }
    });

    function sendMessage() {
        const text = promptInput.value.trim();
        if (!text) return;

        // Render User Bubble
        appendMessageBubble('user', text);
        
        // Post message to extension process
        vscode.postMessage({
            type: 'sendMessage',
            text: text,
            mode: modeSelect ? modeSelect.value : 'chat',
            language: languageSelect ? languageSelect.value : 'auto'
        });
        
        // Reset inputs
        promptInput.value = '';
        scrollToBottom();
    }

    if (modeSelect) {
        modeSelect.addEventListener('change', () => {
            vscode.postMessage({
                type: 'updateSettings',
                mode: modeSelect.value,
                language: languageSelect ? languageSelect.value : 'auto'
            });
        });
    }

    if (languageSelect) {
        languageSelect.addEventListener('change', () => {
            vscode.postMessage({
                type: 'updateSettings',
                mode: modeSelect ? modeSelect.value : 'chat',
                language: languageSelect.value
            });
        });
    }

    function appendMessageBubble(role, content) {
        const bubble = document.createElement('div');
        bubble.className = `message-bubble ${role}`;
        
        const sender = document.createElement('span');
        sender.className = 'message-sender';
        sender.textContent = role === 'user' ? 'You' : 'Assistant';

        const contentBox = document.createElement('div');
        contentBox.className = 'message-content';
        
        if (role === 'user') {
            contentBox.textContent = content;
        } else {
            contentBox.innerHTML = formatMarkdown(content);
            attachCodeBlockListeners(contentBox);
        }

        bubble.appendChild(sender);
        bubble.appendChild(contentBox);
        messagesList.appendChild(bubble);
        
        return bubble;
    }

    // Listens to events posted from the extension
    window.addEventListener('message', event => {
        const message = event.data;
        
        switch (message.type) {
            case 'addUserMessage':
                appendMessageBubble('user', message.text);
                break;

            case 'updateTurnCount':
                updateTurnCounter(message.turnCount);
                break;

            case 'restoreHistory': {
                messagesList.innerHTML = '';
                const greetingBubble = document.createElement('div');
                greetingBubble.className = 'message-bubble assistant';
                greetingBubble.innerHTML = `
                    <span class="message-sender">Assistant</span>
                    <div class="message-content">Hello! I'm your local Apple Intelligence code assistant. How can I help you write or fix your code today?</div>
                `;
                messagesList.appendChild(greetingBubble);

                if (message.history && message.history.length > 0) {
                    message.history.forEach(msg => {
                        appendMessageBubble(msg.role, msg.content);
                    });
                }
                updateTurnCounter(message.turnCount);
                if (message.mode && modeSelect) {
                    modeSelect.value = message.mode;
                }
                if (message.language && languageSelect) {
                    languageSelect.value = message.language;
                }
                scrollToBottom();
                break;
            }

            case 'startStreaming':
                showTypingIndicator();
                currentBotContent = '';
                currentBotBubble = null;
                break;

            case 'streamChunk': {
                hideTypingIndicator();
                if (!currentBotBubble) {
                    currentBotBubble = appendMessageBubble('assistant', '');
                }
                currentBotContent += message.chunk;
                
                const contentBox = currentBotBubble.querySelector('.message-content');
                contentBox.innerHTML = formatMarkdown(currentBotContent);
                attachCodeBlockListeners(contentBox);
                scrollToBottom();
                break;
            }

            case 'streamEnd': {
                hideTypingIndicator();
                if (currentBotBubble) {
                    const contentBox = currentBotBubble.querySelector('.message-content');
                    contentBox.innerHTML = formatMarkdown(currentBotContent);
                    attachCodeBlockListeners(contentBox);
                }
                currentBotBubble = null;
                scrollToBottom();
                break;
            }

            case 'showError': {
                hideTypingIndicator();
                const errorBox = document.createElement('div');
                errorBox.className = 'error-bubble';
                errorBox.textContent = `Error: ${message.text}`;
                messagesList.appendChild(errorBox);
                scrollToBottom();
                break;
            }
        }
    });

    function showTypingIndicator() {
        typingIndicator.style.display = 'block';
        scrollToBottom();
    }

    function hideTypingIndicator() {
        typingIndicator.style.display = 'none';
    }

    function scrollToBottom() {
        messagesList.scrollTop = messagesList.scrollHeight;
    }

    function attachCodeBlockListeners(container) {
        const applyButtons = container.querySelectorAll('.apply-code-btn');
        applyButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const code = window._codeBlocks ? window._codeBlocks[id] : '';
                if (code) {
                    vscode.postMessage({
                        type: 'applyCode',
                        code: code
                    });
                }
            });
        });

        const copyButtons = container.querySelectorAll('.copy-code-btn');
        copyButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const code = window._codeBlocks ? window._codeBlocks[id] : '';
                if (code) {
                    navigator.clipboard.writeText(code).then(() => {
                        const originalText = btn.textContent;
                        btn.textContent = 'Copied!';
                        setTimeout(() => btn.textContent = originalText, 2000);
                    });
                }
            });
        });
    }

    /**
     * Simple parser to format markdown backticks and code blocks in webview.
     * Escapes raw HTML inside blocks to protect against XSS injections.
     * Used for legacy/fallback rendering paths; primary chat responses use
     * the structured renderer above.
     */
    function formatMarkdown(text) {
        // 1. Extract code blocks and replace with placeholders
        // Stops matching if it hits a closing ``` OR if it hits a new section header (### )
        const codeBlockRegex = /```(.*)\r?\n([\s\S]*?)(?:```|(?=\n### )|$)/g;
        let placeholderId = 0;
        const replacements = {};

        // Store raw code for the buttons
        window._codeBlocks = window._codeBlocks || {};

        let processedText = text.replace(codeBlockRegex, (raw, langMatch, code) => {
            const escapedCode = escapeHtml(code);
            const blockId = `__CODE_BLOCK_${placeholderId++}__`;
            
            let lang = (langMatch || '').trim() || 'code';
            
            const replacementHtml = `
                <div class="code-block-wrapper" style="margin: 10px 0; border-radius: 6px; overflow: hidden; border: 1px solid var(--vscode-editorGroup-border);">
                    <div class="code-block-header" style="display: flex; justify-content: space-between; align-items: center; padding: 4px 10px; background: var(--vscode-editor-inactiveSelectionBackground); font-size: 11px;">
                        <span class="code-lang" style="color: var(--vscode-editor-foreground); text-transform: uppercase;">${escapeHtml(lang)}</span>
                        <div class="code-actions" style="display: flex; gap: 6px;">
                            <button class="copy-code-btn" data-id="${blockId}" style="background: none; border: 1px solid var(--vscode-button-background); color: var(--vscode-button-background); border-radius: 4px; padding: 2px 6px; font-size: 11px; cursor: pointer;">Copy</button>
                            <button class="apply-code-btn" data-id="${blockId}" style="background: var(--vscode-button-background); border: none; color: var(--vscode-button-foreground); border-radius: 4px; padding: 2px 6px; font-size: 11px; cursor: pointer;">Apply to File</button>
                        </div>
                    </div>
                    <pre style="margin: 0; padding: 10px; overflow-x: auto; background: var(--vscode-editor-background);"><code class="language-${escapeHtml(lang)}">${escapedCode}</code></pre>
                </div>`;
            
            window._codeBlocks[blockId] = code;
            replacements[blockId] = replacementHtml;
            return `\n${blockId}\n`;
        });

        // 2. Format lines
        const lines = processedText.split('\n');
        const formattedLines = lines.map(line => {
            const trimmed = line.trim();
            if (!trimmed) return '';
            
            if (trimmed.startsWith('__CODE_BLOCK_') && replacements[trimmed]) {
                return replacements[trimmed];
            }

            // Escape HTML in the line first
            let safeLine = escapeHtml(line);

            // Markdown: Headers
            if (safeLine.trim().startsWith('### ')) {
                return `<h3 style="margin-top: 15px; margin-bottom: 5px;">${safeLine.trim().substring(4)}</h3>`;
            }
            if (safeLine.trim().startsWith('## ')) {
                return `<h2 style="margin-top: 15px; margin-bottom: 5px;">${safeLine.trim().substring(3)}</h2>`;
            }
            if (safeLine.trim().startsWith('# ')) {
                return `<h1 style="margin-top: 15px; margin-bottom: 5px;">${safeLine.trim().substring(2)}</h1>`;
            }

            // Markdown: Lists
            if (safeLine.trim().startsWith('- ') || safeLine.trim().startsWith('* ')) {
                let liContent = safeLine.trim().substring(2);
                liContent = liContent.replace(/`([^`]+)`/g, '<code style="background: var(--vscode-textCodeBlock-background); padding: 2px 4px; border-radius: 3px;">$1</code>');
                liContent = liContent.replace(/\*\*([^\*]+)\*\*/g, '<strong>$1</strong>');
                return `<li>${liContent}</li>`;
            }

            // Markdown: Inline code & bold in paragraphs
            safeLine = safeLine.replace(/`([^`]+)`/g, '<code style="background: var(--vscode-textCodeBlock-background); padding: 2px 4px; border-radius: 3px;">$1</code>');
            safeLine = safeLine.replace(/\*\*([^\*]+)\*\*/g, '<strong>$1</strong>');

            return `<p>${safeLine}</p>`;
        });

        return formattedLines.join('');
    }

    // Signal to the extension that the webview is ready
    vscode.postMessage({ type: 'ready' });
})();
