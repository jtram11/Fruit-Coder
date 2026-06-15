import * as vscode from 'vscode';
import { BridgeClient } from './bridgeClient';
export declare class ChatViewProvider implements vscode.WebviewViewProvider {
    private readonly _extensionUri;
    private readonly _bridgeClient;
    static readonly viewType = "appleCodeAssist.chatView";
    private _view?;
    private conversationHistory;
    private turnCount;
    private readonly MAX_TURNS;
    constructor(_extensionUri: vscode.Uri, _bridgeClient: BridgeClient);
    resolveWebviewView(webviewView: vscode.WebviewView, context: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken): void;
    private handleUserMessage;
    private handleApplyCode;
    private _getHtmlForWebview;
}
