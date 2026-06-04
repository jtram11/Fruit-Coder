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
exports.parseErrorOutput = parseErrorOutput;
exports.getCodeContext = getCodeContext;
exports.analyzeError = analyzeError;
exports.registerTerminalWatcher = registerTerminalWatcher;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const promptTemplates_1 = require("./promptTemplates");
const security_1 = require("./security");
const codeActions_1 = require("./codeActions");
/**
 * Parses raw terminal output using Regex to extract files, lines, and errors.
 */
function parseErrorOutput(output) {
    const cleanOutput = (0, security_1.sanitizeTerminalOutput)(output);
    // 1. Python Traceback
    // File "script.py", line 12, in <module>
    const pythonRegex = /File\s+"([^"]+)",\s+line\s+(\d+)(?:,\s+in\s+\w+)?[\s\S]*?(\w*(?:Error|Exception|NameError|TypeError|SyntaxError|IndexError):\s+.*)/i;
    const pythonMatch = pythonRegex.exec(cleanOutput);
    if (pythonMatch) {
        return {
            filePath: pythonMatch[1],
            lineNumber: parseInt(pythonMatch[2], 10),
            message: pythonMatch[3].trim(),
            language: 'python',
            fullOutput: cleanOutput
        };
    }
    // 2. Node.js/JavaScript stack trace
    // at Object.<anonymous> (/path/to/file.js:12:34)
    // ReferenceError: x is not defined
    const nodeRegex = /(\w*Error:\s+.*)[\s\S]*?at\s+.*?\(([^:]+):(\d+):(\d+)\)/i;
    const nodeMatch = nodeRegex.exec(cleanOutput);
    if (nodeMatch) {
        return {
            message: nodeMatch[1].trim(),
            filePath: nodeMatch[2],
            lineNumber: parseInt(nodeMatch[3], 10),
            language: 'javascript',
            fullOutput: cleanOutput
        };
    }
    // 3. TypeScript compiler
    // src/file.ts(12,34): error TS2304: Cannot find name 'x'.
    const tsRegex = /([^\s(]+)\((\d+),(\d+)\):\s+error\s+(TS\d+:\s+.*)/i;
    const tsMatch = tsRegex.exec(cleanOutput);
    if (tsMatch) {
        return {
            filePath: tsMatch[1],
            lineNumber: parseInt(tsMatch[2], 10),
            message: tsMatch[4].trim(),
            language: 'typescript',
            fullOutput: cleanOutput
        };
    }
    // 4. Rust compiler
    // error[E0308]: mismatched types
    //   --> src/main.rs:12:15
    const rustRegex = /error(\[E\d+\])?:\s+(.*)[\s\S]*?-->\s+([^:]+):(\d+):(\d+)/i;
    const rustMatch = rustRegex.exec(cleanOutput);
    if (rustMatch) {
        return {
            message: rustMatch[2].trim() + (rustMatch[1] ? ` (${rustMatch[1]})` : ''),
            filePath: rustMatch[3],
            lineNumber: parseInt(rustMatch[4], 10),
            language: 'rust',
            fullOutput: cleanOutput
        };
    }
    // 5. Go compiler
    // ./main.go:12:15: undefined: x
    const goRegex = /([^\s:]+\.go):(\d+):(\d+):\s+(.*)/i;
    const goMatch = goRegex.exec(cleanOutput);
    if (goMatch) {
        return {
            filePath: goMatch[1],
            lineNumber: parseInt(goMatch[2], 10),
            message: goMatch[4].trim(),
            language: 'go',
            fullOutput: cleanOutput
        };
    }
    // 6. C/C++ compiler (gcc/clang)
    // file.cpp:12:15: error: 'x' was not declared in this scope
    const cppRegex = /([^\s:]+\.(?:c|cpp|cc|h|hpp)):(\d+):(\d+):\s+error:\s+(.*)/i;
    const cppMatch = cppRegex.exec(cleanOutput);
    if (cppMatch) {
        return {
            filePath: cppMatch[1],
            lineNumber: parseInt(cppMatch[2], 10),
            message: cppMatch[4].trim(),
            language: 'cpp',
            fullOutput: cleanOutput
        };
    }
    return null;
}
/**
 * Reads lines around the error line from a file.
 */
async function getCodeContext(filePath, errorLine, contextLines = 10) {
    try {
        const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
        if (!fs.existsSync(absolutePath)) {
            return '';
        }
        const content = fs.readFileSync(absolutePath, 'utf8');
        const lines = content.split('\n');
        const start = Math.max(0, errorLine - contextLines - 1);
        const end = Math.min(lines.length, errorLine + contextLines);
        return lines.slice(start, end).join('\n');
    }
    catch {
        return '';
    }
}
/**
 * Asks the LLM to analyze the error and suggest fixed code.
 */
async function analyzeError(client, error, codeContext) {
    const prompt = (0, promptTemplates_1.buildErrorPrompt)(error.message, codeContext, error.language, error.filePath);
    const response = await client.generate(promptTemplates_1.ERROR_ANALYSIS_PROMPT, prompt);
    // Parse the structured output
    const explanationMatch = /EXPLANATION:\s*([\s\S]*?)(?=FIXED_CODE:|$)/i.exec(response);
    const fixedCodeMatch = /FIXED_CODE:\s*```(?:\w+)?\n([\s\S]*?)```/i.exec(response);
    const explanation = explanationMatch ? explanationMatch[1].trim() : 'Failed to parse error explanation.';
    const fixedCode = fixedCodeMatch ? fixedCodeMatch[1] : '';
    return { explanation, fixedCode };
}
/**
 * Monitors terminals for error occurrences and displays interactive alerts.
 * Uses the stable Shell Integration API to capture terminal execution output streams.
 */
function registerTerminalWatcher(client) {
    let terminalBuffer = '';
    return vscode.window.onDidStartTerminalShellExecution(async (event) => {
        const execution = event.execution;
        const stream = execution.read();
        try {
            for await (const chunk of stream) {
                terminalBuffer += chunk;
                // Truncate buffer to stay within limits
                if (terminalBuffer.length > 50000) {
                    terminalBuffer = terminalBuffer.slice(-20000);
                }
                const parsed = parseErrorOutput(terminalBuffer);
                if (parsed) {
                    // Determine absolute path
                    let fileUri;
                    const workspaceFolders = vscode.workspace.workspaceFolders;
                    if (path.isAbsolute(parsed.filePath)) {
                        fileUri = vscode.Uri.file(parsed.filePath);
                    }
                    else if (workspaceFolders && workspaceFolders.length > 0) {
                        const resolved = path.join(workspaceFolders[0].uri.fsPath, parsed.filePath);
                        if ((0, security_1.validateFilePath)(resolved, workspaceFolders[0].uri.fsPath)) {
                            fileUri = vscode.Uri.file(resolved);
                        }
                    }
                    if (fileUri && fs.existsSync(fileUri.fsPath)) {
                        // Alert user of error detection
                        const selection = await vscode.window.showErrorMessage(` Detected runtime error in ${path.basename(parsed.filePath)}: "${parsed.message.slice(0, 60)}"`, 'Analyze Error', 'Clear Terminal Logs');
                        if (selection === 'Analyze Error') {
                            terminalBuffer = ''; // Clear buffer to prevent repeat triggers
                            await triggerErrorInference(client, parsed, fileUri);
                        }
                        else if (selection === 'Clear Terminal Logs') {
                            terminalBuffer = '';
                        }
                    }
                }
            }
        }
        catch (err) {
            console.error('Error reading terminal execution stream:', err);
        }
    });
}
/**
 * Handles error analysis logic, retrieves file contents, requests LLM fixes, and prompts for code replacement.
 */
async function triggerErrorInference(client, parsed, fileUri) {
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: " Analyzing Error with Apple Intelligence...",
        cancellable: false
    }, async (progress) => {
        try {
            const context = await getCodeContext(fileUri.fsPath, parsed.lineNumber);
            const { explanation, fixedCode } = await analyzeError(client, parsed, context);
            // Focus and open the file
            const editor = await vscode.window.showTextDocument(fileUri);
            // Show the analysis results
            const action = await vscode.window.showInformationMessage(`Analysis: ${explanation}`, { modal: true }, 'Apply Suggested Fix', 'Dismiss');
            if (action === 'Apply Suggested Fix' && fixedCode) {
                // Find matching error line range in file to replace
                // Create a range centered on the error line
                const doc = editor.document;
                const errorLineZeroBased = Math.max(0, parsed.lineNumber - 1);
                // Let's replace the block of code context
                // For safety, let's ask the user to confirm applying the change
                const targetRange = new vscode.Range(new vscode.Position(Math.max(0, errorLineZeroBased - 3), 0), new vscode.Position(Math.min(doc.lineCount - 1, errorLineZeroBased + 3), doc.lineAt(Math.min(doc.lineCount - 1, errorLineZeroBased + 3)).text.length));
                await (0, codeActions_1.applyCodeWithConfirmation)(editor, fixedCode, 'range', targetRange);
            }
        }
        catch (err) {
            vscode.window.showErrorMessage(`Error analysis failed: ${err.message}`);
        }
    });
}
//# sourceMappingURL=errorAnalyzer.js.map