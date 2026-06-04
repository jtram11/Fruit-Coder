import * as vscode from 'vscode';
/**
 * Generates a random 32-character base64 nonce for CSP headers.
 */
export declare function generateNonce(): string;
/**
 * Computes the HMAC-SHA256 signature (hex) of a payload using the secret.
 */
export declare function signRequest(body: string, secret: string): string;
/**
 * Strips ANSI escape codes from terminal output.
 */
export declare function sanitizeTerminalOutput(output: string): string;
/**
 * Resolves a file path and checks if it falls under the workspace root.
 * Prevents Directory Traversal vulnerabilities.
 */
export declare function validateFilePath(filePath: string, workspaceRoot: string): boolean;
/**
 * Strips potential HTML/script tags from LLM outputs to prevent XSS in webview.
 */
export declare function sanitizeLLMOutput(output: string): string;
/**
 * Returns a strict Content-Security-Policy header value for VS Code webviews.
 */
export declare function getContentSecurityPolicy(webview: vscode.Webview, nonce: string): string;
