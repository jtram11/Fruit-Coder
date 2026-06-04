import * as vscode from 'vscode';
import { BridgeClient } from './bridgeClient';
export interface ParsedError {
    message: string;
    filePath: string;
    lineNumber: number;
    language: string;
    fullOutput: string;
}
/**
 * Parses raw terminal output using Regex to extract files, lines, and errors.
 */
export declare function parseErrorOutput(output: string): ParsedError | null;
/**
 * Reads lines around the error line from a file.
 */
export declare function getCodeContext(filePath: string, errorLine: number, contextLines?: number): Promise<string>;
/**
 * Asks the LLM to analyze the error and suggest fixed code.
 */
export declare function analyzeError(client: BridgeClient, error: ParsedError, codeContext: string): Promise<{
    explanation: string;
    fixedCode: string;
}>;
/**
 * Monitors terminals for error occurrences and displays interactive alerts.
 * Uses the stable Shell Integration API to capture terminal execution output streams.
 */
export declare function registerTerminalWatcher(client: BridgeClient): vscode.Disposable;
