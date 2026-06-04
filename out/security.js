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
exports.generateNonce = generateNonce;
exports.signRequest = signRequest;
exports.sanitizeTerminalOutput = sanitizeTerminalOutput;
exports.validateFilePath = validateFilePath;
exports.sanitizeLLMOutput = sanitizeLLMOutput;
exports.getContentSecurityPolicy = getContentSecurityPolicy;
const crypto = __importStar(require("crypto"));
const path = __importStar(require("path"));
/**
 * Generates a random 32-character base64 nonce for CSP headers.
 */
function generateNonce() {
    return crypto.randomBytes(16).toString('base64');
}
/**
 * Computes the HMAC-SHA256 signature (hex) of a payload using the secret.
 */
function signRequest(body, secret) {
    return crypto.createHmac('sha256', secret).update(body).digest('hex');
}
/**
 * Strips ANSI escape codes from terminal output.
 */
function sanitizeTerminalOutput(output) {
    // eslint-disable-next-line no-control-regex
    const ansiRegex = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
    return output.replace(ansiRegex, '');
}
/**
 * Resolves a file path and checks if it falls under the workspace root.
 * Prevents Directory Traversal vulnerabilities.
 */
function validateFilePath(filePath, workspaceRoot) {
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
function sanitizeLLMOutput(output) {
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
function getContentSecurityPolicy(webview, nonce) {
    return `default-src 'none'; ` +
        `style-src ${webview.cspSource} 'unsafe-inline'; ` +
        `script-src 'nonce-${nonce}'; ` +
        `connect-src http://127.0.0.1:19847; ` +
        `font-src ${webview.cspSource}; ` +
        `img-src ${webview.cspSource} data:;`;
}
//# sourceMappingURL=security.js.map