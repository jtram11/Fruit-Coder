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
    private conversationHistory: { role: 'user' | 'assistant', content: string }[] = [];

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
                    break;
            }
        });
    }

    private async handleUserMessage(text: string) {
        if (!this._view) return;

        // Keep history at maximum of 10 messages to fit Apple Intelligence's 4k token window
        if (this.conversationHistory.length > 10) {
            this.conversationHistory.shift();
        }

        // Add user prompt to history
        this.conversationHistory.push({ role: 'user', content: text });

        // Build rolling prompt context
        const conversationPrompt = this.conversationHistory.map(m => 
            `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
        ).join('\n\n') + '\n\nAssistant:';

        try {
            // Signal typing indicator
            this._view.webview.postMessage({ type: 'startStreaming' });

            let fullReply = '';
                CHAT_PROMPT, 
                conversationPrompt, 
                (chunk) => {
                    fullReply += chunk;
                    this._view?.webview.postMessage({ type: 'streamChunk', text: chunk });
                }
            );

            // Add response to history
            this.conversationHistory.push({ role: 'assistant', content: fullReply });
            this._view.webview.postMessage({ type: 'streamEnd' });

        } catch (err: any) {
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
