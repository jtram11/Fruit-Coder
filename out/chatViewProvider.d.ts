import * as vscode from 'vscode';
import { BridgeClient } from './bridgeClient';
export declare class ChatViewProvider implements vscode.WebviewViewProvider {
    private readonly _context;
    private readonly _bridgeClient;
    static readonly viewType = "appleCodeAssist.chatView";
    private _view?;
    private conversationHistory;
    private turnCount;
    private readonly MAX_TURNS;
    private selectedMode;
    private selectedLanguage;
    constructor(_context: vscode.ExtensionContext, _bridgeClient: BridgeClient);
    private saveState;
    resolveWebviewView(webviewView: vscode.WebviewView, context: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken): void;
    private handleUserMessage;
    sendContextualPrompt(prompt: string, code: string, language: string, systemPrompt?: string): Promise<void>;
    private handleApplyCode;
    private _getHtmlForWebview;
}
