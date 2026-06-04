import * as crypto from 'crypto';
import * as path from 'path';
import * as vscode from 'vscode';

/**
 * Generates a random 32-character base64 nonce for CSP headers.
 */
export function generateNonce(): string {
    return crypto.randomBytes(16).toString('base64');
}

/**
 * Computes the HMAC-SHA256 signature (hex) of a payload using the secret.
 */
export function signRequest(body: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

/**
 * Strips ANSI escape codes from terminal output.
 */
export function sanitizeTerminalOutput(output: string): string {
    // eslint-disable-next-line no-control-regex
    const ansiRegex = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
    return output.replace(ansiRegex, '');
}

/**
 * Resolves a file path and checks if it falls under the workspace root.
 * Prevents Directory Traversal vulnerabilities.
 */
export function validateFilePath(filePath: string, workspaceRoot: string): boolean {
    const resolvedPath = path.resolve(filePath);
    const resolvedWorkspace = path.resolve(workspaceRoot);
    
    // Normalize path separators for comparison
    const normalPath = resolvedPath.split(path.sep).join('/');
    const normalWorkspace = resolvedWorkspace.split(path.sep).join('/');
    
    return normalPath.startsWith(normalWorkspace);
}

/**
 * Strips potential HTML/script tags from LLM outputs to prevent XSS in webview.
 */
export function sanitizeLLMOutput(output: string): string {
    return output
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Returns a strict Content-Security-Policy header value for VS Code webviews.
 */
export function getContentSecurityPolicy(webview: vscode.Webview, nonce: string): string {
    return `default-src 'none'; ` +
           `style-src ${webview.cspSource} 'unsafe-inline'; ` +
           `script-src 'nonce-${nonce}'; ` +
           `connect-src http://127.0.0.1:19847; ` +
           `font-src ${webview.cspSource}; ` +
           `img-src ${webview.cspSource} data:;`;
}
