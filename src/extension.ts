import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { BridgeClient } from './bridgeClient';
import { ChatViewProvider } from './chatViewProvider';
import { registerTerminalWatcher, parseErrorOutput, analyzeError, getCodeContext } from './errorAnalyzer';
import { buildCodeGenPrompt, CODE_GENERATION_PROMPT, CODE_EXPLANATION_PROMPT } from './promptTemplates';
import { applyCodeWithConfirmation } from './codeActions';

let bridgeProcess: ChildProcess | undefined;
let statusBarItem: vscode.StatusBarItem;

async function startBridgeInternal(context: vscode.ExtensionContext, bridgeClient: BridgeClient, silent: boolean): Promise<void> {
    if (bridgeProcess) {
        if (!silent) {
            vscode.window.showInformationMessage('Apple LLM Bridge is already running.');
        }
        return;
    }

    statusBarItem.text = "$(sync~spin) Starting Apple LLM...";
    statusBarItem.tooltip = "Launching the local Swift FoundationModels bridge server";

    // Path to built Swift binary
    const possiblePaths = [
        path.join(context.extensionUri.fsPath, 'apple-llm-bridge', '.build', 'release', 'apple-llm-bridge'),
        path.join(context.extensionUri.fsPath, 'apple-llm-bridge', '.build', 'debug', 'apple-llm-bridge'),
        path.join(context.extensionUri.fsPath, 'apple-llm-bridge', '.build', 'arm64-apple-macosx', 'release', 'apple-llm-bridge'),
        path.join(context.extensionUri.fsPath, 'apple-llm-bridge', '.build', 'arm64-apple-macosx', 'debug', 'apple-llm-bridge'),
        path.join(context.extensionUri.fsPath, 'apple-llm-bridge', '.build', 'x86_64-apple-macosx', 'release', 'apple-llm-bridge'),
        path.join(context.extensionUri.fsPath, 'apple-llm-bridge', '.build', 'x86_64-apple-macosx', 'debug', 'apple-llm-bridge')
    ];
    
    let pathToRun = '';
    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            pathToRun = p;
            break;
        }
    }

    if (!pathToRun) {
        if (!silent) {
            vscode.window.showErrorMessage(
                'Swift bridge binary not found! Please build it using: cd apple-llm-bridge && swift build -c release',
                'Build Now'
            ).then(selection => {
                if (selection === 'Build Now') {
                    vscode.commands.executeCommand('workbench.action.terminal.new');
                }
            });
        }
        statusBarItem.text = "$(error) Apple LLM: Not Built";
        return;
    }

    try {
        // Spawn Swift Bridge Server
        bridgeProcess = spawn(pathToRun, [], {
            stdio: ['ignore', 'pipe', 'pipe'],
            detached: false
        });

        bridgeProcess.stdout?.on('data', (data) => {
            console.log(`[Bridge Server Out]: ${data}`);
        });

        bridgeProcess.stderr?.on('data', (data) => {
            console.error(`[Bridge Server Err]: ${data}`);
        });

        bridgeProcess.on('close', (code) => {
            console.log(`[Bridge Server] closed with code ${code}`);
            bridgeProcess = undefined;
            statusBarItem.text = "$(hubot) Apple LLM: Stopped";
            statusBarItem.command = 'appleCodeAssist.startBridge';
        });

        // Wait for key file & verify health
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Read secret session token
        await bridgeClient.loadSessionKey();

        // Verify availability
        let healthy = false;
        for (let i = 0; i < 5; i++) {
            healthy = await bridgeClient.isHealthy();
            if (healthy) break;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        if (healthy) {
            statusBarItem.text = "$(pass-filled) Apple LLM: Connected";
            statusBarItem.tooltip = "Local Apple Intelligence model is online and authenticated";
            statusBarItem.command = 'appleCodeAssist.stopBridge';
            if (!silent) {
                vscode.window.showInformationMessage(' Apple Intelligence Local Bridge Connected successfully!');
            }
        } else {
            throw new Error('Local server healthcheck timed out.');
        }

    } catch (err: any) {
        if (!silent) {
            vscode.window.showErrorMessage(`Failed to start Apple LLM Bridge: ${err.message}`);
        }
        statusBarItem.text = "$(error) Apple LLM: Error";
        if (bridgeProcess) {
            bridgeProcess.kill('SIGKILL');
            bridgeProcess = undefined;
        }
    }
}

export async function activate(context: vscode.ExtensionContext) {
    console.log('[+] Apple Intelligence Code Assistant extension activating...');

    const bridgeClient = new BridgeClient();

    // Setup Status Bar Item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = "$(hubot) Apple LLM: Stopped";
    statusBarItem.command = 'appleCodeAssist.startBridge';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Register Chat View
    const chatProvider = new ChatViewProvider(context, bridgeClient);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, chatProvider)
    );

    // Command: Start Bridge Server
    const startBridgeCmd = vscode.commands.registerCommand('appleCodeAssist.startBridge', async () => {
        await startBridgeInternal(context, bridgeClient, false);
    });

    // Command: Stop Bridge Server
    const stopBridgeCmd = vscode.commands.registerCommand('appleCodeAssist.stopBridge', () => {
        if (bridgeProcess) {
            bridgeProcess.kill('SIGTERM');
            bridgeProcess = undefined;
            vscode.window.showInformationMessage('Apple LLM Bridge server stopped.');
        } else {
            vscode.window.showWarningMessage('Bridge server is not running.');
        }
    });

    // Command: Generate Code from Prompt
    const generateCodeCmd = vscode.commands.registerCommand('appleCodeAssist.generateCode', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('Please open a file editor to insert generated code.');
            return;
        }

        const instruction = await vscode.window.showInputBox({
            prompt: 'Prompt Apple Intelligence to write code at the cursor',
            placeHolder: 'e.g. Create a function to fetch JSON from an URL'
        });

        if (!instruction) return;

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: " Apple Intelligence generating code...",
            cancellable: false
        }, async () => {
            try {
                const doc = editor.document;
                const language = doc.languageId;
                
                // Get context lines around cursor
                const line = editor.selection.active.line;
                const startLine = Math.max(0, line - 20);
                const endLine = Math.min(doc.lineCount - 1, line + 20);
                
                let context = '';
                for (let i = startLine; i <= endLine; i++) {
                    context += doc.lineAt(i).text + '\n';
                }

                const prompt = buildCodeGenPrompt(language, context, instruction);
                const result = await bridgeClient.generate(CODE_GENERATION_PROMPT, prompt);
                
                // Strip markdown backticks from result
                const codeBlocks = /```(?:\w+)?\n([\s\S]*?)```/i.exec(result);
                const codeToInsert = codeBlocks ? codeBlocks[1] : result;

                await applyCodeWithConfirmation(editor, codeToInsert, 'insert');

            } catch (err: any) {
                vscode.window.showErrorMessage(`Code generation failed: ${err.message}`);
            }
        });
    });

    // Command: Analyze Error Manual Call
    const analyzeErrorCmd = vscode.commands.registerCommand('appleCodeAssist.analyzeError', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('Please open a source script to analyze.');
            return;
        }

        // Prompt user to input error or paste log
        const errorLog = await vscode.window.showInputBox({
            prompt: 'Paste the compiler error or script crash logs to analyze',
            placeHolder: 'e.g. ValueError: division by zero'
        });

        if (!errorLog) return;

        const mockParsed = {
            message: errorLog,
            filePath: editor.document.fileName,
            lineNumber: editor.selection.active.line + 1,
            language: editor.document.languageId,
            fullOutput: errorLog
        };

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: " Analyzing Error manually...",
            cancellable: false
        }, async () => {
            try {
                const context = await getCodeContext(editor.document.fileName, mockParsed.lineNumber);
                const { explanation, fixedCode } = await analyzeError(bridgeClient, mockParsed, context);
                
                const action = await vscode.window.showInformationMessage(
                    `Analysis: ${explanation}`,
                    { modal: true },
                    'Apply Fix Suggestion',
                    'Dismiss'
                );

                if (action === 'Apply Fix Suggestion' && fixedCode) {
                    const line = mockParsed.lineNumber - 1;
                    const replaceRangeVal = new vscode.Range(
                        new vscode.Position(Math.max(0, line - 2), 0),
                        new vscode.Position(Math.min(editor.document.lineCount - 1, line + 2), editor.document.lineAt(Math.min(editor.document.lineCount - 1, line + 2)).text.length)
                    );
                    await applyCodeWithConfirmation(editor, fixedCode, 'range', replaceRangeVal);
                }
            } catch (err: any) {
                vscode.window.showErrorMessage(`Error analysis failed: ${err.message}`);
            }
        });
    });

    // Command: Focus Chat Sidebar
    const openChatCmd = vscode.commands.registerCommand('appleCodeAssist.openChat', () => {
        vscode.commands.executeCommand('workbench.view.extension.apple-code-assist');
    });

    // Command: Explain Selected Code
    const explainCodeCmd = vscode.commands.registerCommand('appleCodeAssist.explainCode', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('Please open a file to explain.');
            return;
        }
        const selection = editor.selection;
        if (selection.isEmpty) {
            vscode.window.showWarningMessage('Please select some code to explain.');
            return;
        }
        const text = editor.document.getText(selection);
        const language = editor.document.languageId;
        await chatProvider.sendContextualPrompt('Explain the selected code.', text, language, CODE_EXPLANATION_PROMPT);
    });

    // Command: Refactor Selected Code
    const refactorCodeCmd = vscode.commands.registerCommand('appleCodeAssist.refactorCode', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('Please open a file to refactor.');
            return;
        }
        const selection = editor.selection;
        if (selection.isEmpty) {
            vscode.window.showWarningMessage('Please select some code to refactor.');
            return;
        }
        const text = editor.document.getText(selection);
        const language = editor.document.languageId;
        await chatProvider.sendContextualPrompt('Refactor the selected code.', text, language);
    });

    // Command: Add Docstring to Selected Code
    const addDocstringCmd = vscode.commands.registerCommand('appleCodeAssist.addDocstring', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('Please open a file to add a docstring.');
            return;
        }
        const selection = editor.selection;
        if (selection.isEmpty) {
            vscode.window.showWarningMessage('Please select some code to add a docstring to.');
            return;
        }
        const text = editor.document.getText(selection);
        const language = editor.document.languageId;
        await chatProvider.sendContextualPrompt('Add a docstring to the selected code.', text, language);
    });

    // Command: Write Unit Test for Selected Code
    const writeUnitTestCmd = vscode.commands.registerCommand('appleCodeAssist.writeUnitTest', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('Please open a file to write a unit test.');
            return;
        }
        const selection = editor.selection;
        if (selection.isEmpty) {
            vscode.window.showWarningMessage('Please select some code to write a unit test for.');
            return;
        }
        const text = editor.document.getText(selection);
        const language = editor.document.languageId;
        await chatProvider.sendContextualPrompt('Write a unit test for the selected code.', text, language);
    });

    // Terminal Scraper Watcher for automatic execution monitoring
    const terminalWatcher = registerTerminalWatcher(bridgeClient);

    context.subscriptions.push(
        startBridgeCmd,
        stopBridgeCmd,
        generateCodeCmd,
        analyzeErrorCmd,
        openChatCmd,
        explainCodeCmd,
        refactorCodeCmd,
        addDocstringCmd,
        writeUnitTestCmd,
        terminalWatcher
    );

    // Auto-start bridge if configuration requests it
    const config = vscode.workspace.getConfiguration('appleCodeAssist');
    if (config.get('autoStartBridge', true)) {
        startBridgeInternal(context, bridgeClient, true);
    }
}

export function deactivate() {
    console.log('[-] Deactivating Apple Intelligence Code Assistant...');
    if (bridgeProcess) {
        bridgeProcess.kill('SIGTERM');
        bridgeProcess = undefined;
    }
}
