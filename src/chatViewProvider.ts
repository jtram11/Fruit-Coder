import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { BridgeClient } from './bridgeClient';
import { generateNonce, getContentSecurityPolicy } from './security';
import { applyCodeWithConfirmation } from './codeActions';
import { CHAT_PROMPT } from './promptTemplates';



export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'appleCodeAssist.chatView';
    private _view?: vscode.WebviewView;
    // conversationHistory is kept for UI display only.
    // Conversation context is maintained server-side in the LanguageModelSession.
    private conversationHistory: { role: 'user' | 'assistant', content: string }[] = [];
    // Track turns so we can proactively reset the session before the 4096-token
    // context limit is hit (matches the maxTurns = 6 limit in LLMService.swift).
    private turnCount = 0;
    private readonly MAX_TURNS = 6;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _bridgeClient: BridgeClient
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'sendMessage':
                    await this.handleUserMessage(data.text);
                    break;
                case 'applyCode':
                    await this.handleApplyCode(data.code);
                    break;
                case 'clearHistory':
                    this.conversationHistory = [];
                    this.turnCount = 0;
                    // Reset the Swift-side session so the model starts a fresh context.
                    this._bridgeClient.resetSession().catch(() => {});
                    break;
            }
        });
    }

    private async handleUserMessage(text: string) {
        if (!this._view) return;

        const activeEditor = vscode.window.activeTextEditor;
        const fileLanguage = activeEditor?.document.languageId ?? null;
        const fileName     = activeEditor ? path.basename(activeEditor.document.fileName) : null;
        
        let fileContent = activeEditor?.document.getText() ?? '';
        if (activeEditor && fileContent.length > 6000) {
            const cursorOffset = activeEditor.document.offsetAt(activeEditor.selection.active);
            const halfWindow = 3000;
            let start = Math.max(0, cursorOffset - halfWindow);
            let end = Math.min(fileContent.length, cursorOffset + halfWindow);
            
            if (cursorOffset - halfWindow < 0) {
                end = Math.min(fileContent.length, end + (halfWindow - cursorOffset));
            } else if (cursorOffset + halfWindow > fileContent.length) {
                start = Math.max(0, start - (cursorOffset + halfWindow - fileContent.length));
            }

            fileContent = (start > 0 ? '...[truncated]\n' : '') + 
                          fileContent.substring(start, end) + 
                          (end < activeEditor.document.getText().length ? '\n...[truncated]' : '');
        }

        const contextTag   = fileLanguage
            ? `[Active file: ${fileName} | Language: ${fileLanguage}]\n[Active File Content:\n${fileContent}\n]\n\n`
            : '';

        // Only the CURRENT message is sent to the Swift bridge.
        // Conversation context is maintained server-side in the LanguageModelSession
        // (KV-cache preserved across turns). This reduces per-request input tokens
        // from ~400 to ~30 — the single biggest driver of response latency.
        const currentMessage = contextTag + text;

        // Store in local history for UI display only (not sent to model).
        this.conversationHistory.push({ role: 'user', content: currentMessage });

        try {
            this._view.webview.postMessage({ type: 'startStreaming' });

            let fullReply = '';
            await this._bridgeClient.stream(
                CHAT_PROMPT,
                currentMessage,
                (chunk) => {
                    fullReply += chunk;
                    this._view?.webview.postMessage({ type: 'streamChunk', chunk });
                }
            );

            this._view.webview.postMessage({ type: 'streamEnd' });

            this.conversationHistory.push({ role: 'assistant', content: fullReply });

            // Proactively reset the session every MAX_TURNS to stay within the
            // 4096-token context limit. Mirrors the server-side maxTurns guard.
            this.turnCount++;
            if (this.turnCount >= this.MAX_TURNS) {
                this.turnCount = 0;
                this._bridgeClient.resetSession().catch(() => {});
            }

        } catch (err: any) {
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

    private async handleApplyCode(code: string) {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active file editor to apply code to.');
            return;
        }

        const isSelectionEmpty = editor.selection.isEmpty;
        const action = isSelectionEmpty ? 'insert' : 'replace';
        
        const success = await applyCodeWithConfirmation(editor, code, action);
        if (success) {
            vscode.window.showInformationMessage('Code applied successfully.');
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const nonce = generateNonce();
        
        // URIs for style and javascript assets
        const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'chat.css'));
        const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'chat.js'));
        const cspStr = getContentSecurityPolicy(webview, nonce);

        const htmlPath = path.join(this._extensionUri.fsPath, 'media', 'chat.html');
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
