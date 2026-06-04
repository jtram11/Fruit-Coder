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
exports.insertCodeAtCursor = insertCodeAtCursor;
exports.replaceSelection = replaceSelection;
exports.replaceRange = replaceRange;
exports.applyCodeWithConfirmation = applyCodeWithConfirmation;
exports.showDiffPreview = showDiffPreview;
const vscode = __importStar(require("vscode"));
/**
 * Inserts code at the current cursor position in the active text editor.
 */
async function insertCodeAtCursor(editor, code) {
    return editor.edit(editBuilder => {
        editBuilder.insert(editor.selection.active, code);
    });
}
/**
 * Replaces the active selection in the editor with new code.
 */
async function replaceSelection(editor, code) {
    return editor.edit(editBuilder => {
        editBuilder.replace(editor.selection, code);
    });
}
/**
 * Replaces a specific line range with new code.
 */
async function replaceRange(editor, range, code) {
    return editor.edit(editBuilder => {
        editBuilder.replace(range, code);
    });
}
/**
 * Requests explicit user approval via VS Code warning dialog before modifying files.
 * CRITICAL SECURITY REQUIREMENT: Protects against silent code overwrites.
 */
async function applyCodeWithConfirmation(editor, code, action, range) {
    const message = action === 'range'
        ? `Apply AI suggested bug-fix to lines ${range ? (range.start.line + 1) + '-' + (range.end.line + 1) : ''}? This will overwrite your code.`
        : `Apply AI-generated code change to active file?`;
    const choice = await vscode.window.showWarningMessage(message, { modal: true }, 'Yes, Apply Change', 'No, Cancel');
    if (choice === 'Yes, Apply Change') {
        if (action === 'insert') {
            return await insertCodeAtCursor(editor, code);
        }
        else if (action === 'replace') {
            return await replaceSelection(editor, code);
        }
        else if (action === 'range' && range) {
            return await replaceRange(editor, range, code);
        }
    }
    return false;
}
/**
 * Displays a diff preview comparing original content with proposed code fixes.
 */
async function showDiffPreview(originalContent, newContent, fileName) {
    // Create temporary virtual documents for diff comparison
    const originalDoc = await vscode.workspace.openTextDocument({
        content: originalContent,
        language: vscode.window.activeTextEditor?.document.languageId
    });
    const proposedDoc = await vscode.workspace.openTextDocument({
        content: newContent,
        language: vscode.window.activeTextEditor?.document.languageId
    });
    await vscode.commands.executeCommand('vscode.diff', originalDoc.uri, proposedDoc.uri, `Original Code ↔ Fixed Code (${fileName})`);
}
//# sourceMappingURL=codeActions.js.map