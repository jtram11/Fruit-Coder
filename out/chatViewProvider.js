"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatViewProvider = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const security_1 = require("./security");
const codeActions_1 = require("./codeActions");
const promptTemplates_1 = require("./promptTemplates");
class ChatViewProvider {
    constructor(_context, _bridgeClient) {
        this._context = _context;
        this._bridgeClient = _bridgeClient;
        // conversationHistory is kept for UI display only.
        // Conversation context is maintained server-side in the LanguageModelSession.
        this.conversationHistory = [];
        // Track turns so we can proactively reset the session before the 4096-token
        // context limit is hit (matches the maxTurns = 6 limit in LLMService.swift).
        this.turnCount = 0;
        this.MAX_TURNS = 6;
        this.selectedMode = 'chat';
        this.selectedLanguage = 'auto';
        this.conversationHistory = this._context.workspaceState.get('appleCodeAssist.conversationHistory', []);
        this.turnCount = this._context.workspaceState.get('appleCodeAssist.turnCount', 0);
        this.selectedMode = this._context.workspaceState.get('appleCodeAssist.selectedMode', 'chat');
        this.selectedLanguage = this._context.workspaceState.get('appleCodeAssist.selectedLanguage', 'auto');
    }
    saveState() {
        this._context.workspaceState.update('appleCodeAssist.conversationHistory', this.conversationHistory);
        this._context.workspaceState.update('appleCodeAssist.turnCount', this.turnCount);
        this._context.workspaceState.update('appleCodeAssist.selectedMode', this.selectedMode);
        this._context.workspaceState.update('appleCodeAssist.selectedLanguage', this.selectedLanguage);
    }
    resolveWebviewView(webviewView, context, _token) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._context.extensionUri
            ]
        };
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'ready':
                    this._view?.webview.postMessage({
                        type: 'restoreHistory',
                        history: this.conversationHistory,
                        turnCount: this.turnCount,
                        mode: this.selectedMode,
                        language: this.selectedLanguage
                    });
                    break;
                case 'sendMessage':
                    this.selectedMode = data.mode || 'chat';
                    this.selectedLanguage = data.language || 'auto';
                    this.saveState();
                    await this.handleUserMessage(data.text);
                    break;
                case 'updateSettings':
                    this.selectedMode = data.mode || 'chat';
                    this.selectedLanguage = data.language || 'auto';
                    this.saveState();
                    break;
                case 'applyCode':
                    await this.handleApplyCode(data.code);
                    break;
                case 'clearHistory':
                    this.conversationHistory = [];
                    this.turnCount = 0;
                    this.saveState();
                    this._view?.webview.postMessage({ type: 'updateTurnCount', turnCount: 0 });
                    // Reset the Swift-side session so the model starts a fresh context.
                    this._bridgeClient.resetSession().catch(() => { });
                    break;
            }
        });
    }
    async handleUserMessage(text) {
        if (!this._view)
            return;
        const activeEditor = vscode.window.activeTextEditor;
        let fileLanguage = activeEditor?.document.languageId ?? null;
        if (this.selectedLanguage && this.selectedLanguage !== 'auto') {
            fileLanguage = this.selectedLanguage;
        }
        const fileName = activeEditor ? path.basename(activeEditor.document.fileName) : null;
        let fileContent = activeEditor?.document.getText() ?? '';
        if (activeEditor && fileContent.length > 6000) {
            const cursorOffset = activeEditor.document.offsetAt(activeEditor.selection.active);
            const halfWindow = 3000;
            let start = Math.max(0, cursorOffset - halfWindow);
            let end = Math.min(fileContent.length, cursorOffset + halfWindow);
            if (cursorOffset - halfWindow < 0) {
                end = Math.min(fileContent.length, end + (halfWindow - cursorOffset));
            }
            else if (cursorOffset + halfWindow > fileContent.length) {
                start = Math.max(0, start - (cursorOffset + halfWindow - fileContent.length));
            }
            fileContent = (start > 0 ? '...[truncated]\n' : '') +
                fileContent.substring(start, end) +
                (end < activeEditor.document.getText().length ? '\n...[truncated]' : '');
        }
        const contextTag = fileLanguage
            ? `[Active file: ${fileName ?? 'None'} | Language: ${fileLanguage}]\n` + (fileContent ? `[Active File Content:\n${fileContent}\n]\n\n` : '\n')
            : '';
        // Only the CURRENT message is sent to the Swift bridge.
        const currentMessage = contextTag + text;
        // Store in local history for UI display only (not sent to model).
        this.conversationHistory.push({ role: 'user', content: text });
        try {
            this._view.webview.postMessage({ type: 'startStreaming' });
            let systemPrompt = promptTemplates_1.CHAT_PROMPT;
            if (this.selectedMode === 'generate') {
                systemPrompt = promptTemplates_1.CODE_GENERATION_PROMPT;
            }
            else if (this.selectedMode === 'debug') {
                systemPrompt = promptTemplates_1.ERROR_ANALYSIS_PROMPT;
            }
            let fullReply = '';
            await this._bridgeClient.stream(systemPrompt, currentMessage, (chunk) => {
                fullReply += chunk;
                this._view?.webview.postMessage({ type: 'streamChunk', chunk });
            });
            this._view.webview.postMessage({ type: 'streamEnd' });
            this.conversationHistory.push({ role: 'assistant', content: fullReply });
            // Proactively reset the session every MAX_TURNS to stay within the
            // 4096-token context limit. Mirrors the server-side maxTurns guard.
            this.turnCount++;
            if (this.turnCount >= this.MAX_TURNS) {
                this.turnCount = 0;
                this._bridgeClient.resetSession().catch(() => { });
            }
            this.saveState();
            this._view.webview.postMessage({ type: 'updateTurnCount', turnCount: this.turnCount });
        }
        catch (err) {
            if (err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
                this._view.webview.postMessage({
                    type: 'showError',
                    text: 'Bridge disconnected — restarting automatically. Please resend your message in a moment.'
                });
                await vscode.commands.executeCommand('appleCodeAssist.startBridge');
                return;
            }
            this._view.webview.postMessage({ type: 'showError', text: err.message });
        }
    }
    async sendContextualPrompt(prompt, code, language, systemPrompt = promptTemplates_1.CHAT_PROMPT) {
        if (!this._view) {
            await vscode.commands.executeCommand('appleCodeAssist.openChat');
            for (let i = 0; i < 10; i++) {
                if (this._view)
                    break;
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        if (!this._view)
            return;
        const contextTag = `[Language: ${language}]\n[Selected Code:\n${code}\n]\n\n`;
        const currentMessage = contextTag + prompt;
        this._view.webview.postMessage({ type: 'addUserMessage', text: prompt });
        this.conversationHistory.push({ role: 'user', content: prompt });
        try {
            this._view.webview.postMessage({ type: 'startStreaming' });
            let fullReply = '';
            await this._bridgeClient.stream(systemPrompt, currentMessage, (chunk) => {
                fullReply += chunk;
                this._view?.webview.postMessage({ type: 'streamChunk', chunk });
            });
            this._view.webview.postMessage({ type: 'streamEnd' });
            this.conversationHistory.push({ role: 'assistant', content: fullReply });
            this.turnCount++;
            if (this.turnCount >= this.MAX_TURNS) {
                this.turnCount = 0;
                this._bridgeClient.resetSession().catch(() => { });
            }
            this.saveState();
            this._view.webview.postMessage({ type: 'updateTurnCount', turnCount: this.turnCount });
        }
        catch (err) {
            if (err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
                this._view.webview.postMessage({
                    type: 'showError',
                    text: 'Bridge disconnected — restarting automatically. Please resend your message in a moment.'
                });
                await vscode.commands.executeCommand('appleCodeAssist.startBridge');
                return;
            }
            this._view.webview.postMessage({ type: 'showError', text: err.message });
        }
    }
    async handleApplyCode(code) {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active file editor to apply code to.');
            return;
        }
        const isSelectionEmpty = editor.selection.isEmpty;
        const action = isSelectionEmpty ? 'insert' : 'replace';
        const originalContent = isSelectionEmpty ? '' : editor.document.getText(editor.selection);
        // Show diff preview
        await (0, codeActions_1.showDiffPreview)(originalContent, code, path.basename(editor.document.fileName));
        const choice = await vscode.window.showWarningMessage('Apply AI-generated code change to active file?', { modal: true }, 'Yes, Apply Change', 'No, Cancel');
        if (choice === 'Yes, Apply Change') {
            let success = false;
            if (action === 'insert') {
                success = await (0, codeActions_1.insertCodeAtCursor)(editor, code);
            }
            else {
                success = await (0, codeActions_1.replaceSelection)(editor, code);
            }
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            if (success) {
                vscode.window.showInformationMessage('Code applied successfully.');
            }
        }
        else {
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        }
    }
    _getHtmlForWebview(webview) {
        const nonce = (0, security_1.generateNonce)();
        // URIs for style and javascript assets
        const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'media', 'chat.css'));
        const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'media', 'chat.js'));
        const cspStr = (0, security_1.getContentSecurityPolicy)(webview, nonce);
        const htmlPath = path.join(this._context.extensionUri.fsPath, 'media', 'chat.html');
        let htmlContent = fs.readFileSync(htmlPath, 'utf8');
        // Replace templates placeholders
        htmlContent = htmlContent
            .replace(/\{\{CSP\}\}/g, cspStr)
            .replace(/\{\{NONCE\}\}/g, nonce)
            .replace(/\{\{CSS_URI\}\}/g, cssUri.toString())
            .replace(/\{\{JS_URI\}\}/g, jsUri.toString());
        return htmlContent;
    }
}
exports.ChatViewProvider = ChatViewProvider;
ChatViewProvider.viewType = 'appleCodeAssist.chatView';
//# sourceMappingURL=chatViewProvider.js.map