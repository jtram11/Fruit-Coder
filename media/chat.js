/* =============================================================================
   media/chat.js — Client-side logic for Chat Webview
   ============================================================================= */

(function () {
    const vscode = acquireVsCodeApi();

    const messagesList = document.getElementById('messages-list');
    const promptInput = document.getElementById('prompt-input');
    const sendButton = document.getElementById('send-button');
    const typingIndicator = document.getElementById('typing-indicator');

    let currentBotBubble = null;
    let currentBotContent = '';

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
        vscode.postMessage({ type: 'sendMessage', text });
        
        // Reset inputs
        promptInput.value = '';
        scrollToBottom();
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
            case 'startStreaming':
                showTypingIndicator();
                currentBotContent = '';
                currentBotBubble = null;
                break;

            case 'streamChunk':
                hideTypingIndicator();
                currentBotContent += message.text;
                
                if (!currentBotBubble) {
                    currentBotBubble = appendMessageBubble('assistant', currentBotContent);
                } else {
                    const contentBox = currentBotBubble.querySelector('.message-content');
                    contentBox.innerHTML = formatMarkdown(currentBotContent);
                    attachCodeBlockListeners(contentBox);
                }
                scrollToBottom();
                break;

            case 'streamEnd':
                hideTypingIndicator();
                currentBotBubble = null;
                currentBotContent = '';
                break;

            case 'showError':
                hideTypingIndicator();
                const errorBox = document.createElement('div');
                errorBox.className = 'error-bubble';
                errorBox.textContent = `Error: ${message.text}`;
                messagesList.appendChild(errorBox);
                scrollToBottom();
                break;
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

    /**
     * Attaches "Apply Code" listeners to all generated buttons.
     */
    function attachCodeBlockListeners(container) {
        const buttons = container.querySelectorAll('.apply-code-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                const code = btn.getAttribute('data-code');
                vscode.postMessage({
                    type: 'applyCode',
                    code: decodeURIComponent(code)
                });
            });
        });
    }

    /**
     * Simple parser to format markdown backticks and code blocks in webview.
     * Escapes raw HTML inside blocks to protect against XSS injections.
     */
    function formatMarkdown(text) {
        // Escapes text safely to prevent XSS outside of backticks
        function escapeHtml(unsafe) {
            return unsafe
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        }

        // Match Code blocks: ```language ... ```
        const codeBlockRegex = /```(\w*)\n([\s\S]*?)(?:```|$)/g;
        let formatted = text;
        let match;
        
        const replacements = [];

        while ((match = codeBlockRegex.exec(text)) !== null) {
            const lang = match[1] || 'code';
            const code = match[2];
            const escapedCode = escapeHtml(code);
            const encodedCode = encodeURIComponent(code);

            const replacementHtml = `
                <pre><button class="apply-code-btn" data-code="${encodedCode}">Apply to File</button><code>${escapedCode}</code></pre>
            `;
            replacements.push({
                raw: match[0],
                html: replacementHtml
            });
        }

        // Replace each block placeholder
        for (const rep of replacements) {
            formatted = formatted.replace(rep.raw, rep.html);
        }

        // Format inline code: `code`
        formatted = formatted.replace(/`([^`]+)`/g, (m, inlineCode) => {
            return `<code>${escapeHtml(inlineCode)}</code>`;
        });

        // Format paragraphs / linebreaks nicely
        // Skip formatting lines containing pre/code structures
        const lines = formatted.split('\n');
        const formattedLines = lines.map(line => {
            if (line.includes('<pre>') || line.includes('</pre>') || line.includes('<code>') || line.includes('</code>') || line.includes('<li>')) {
                return line;
            }
            if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
                return `<li>${line.trim().substring(2)}</li>`;
            }
            return line ? `<p>${line}</p>` : '';
        });

        return formattedLines.join('');
    }
})();
