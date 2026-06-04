import * as vscode from 'vscode';
/**
 * Inserts code at the current cursor position in the active text editor.
 */
export declare function insertCodeAtCursor(editor: vscode.TextEditor, code: string): Promise<boolean>;
/**
 * Replaces the active selection in the editor with new code.
 */
export declare function replaceSelection(editor: vscode.TextEditor, code: string): Promise<boolean>;
/**
 * Replaces a specific line range with new code.
 */
export declare function replaceRange(editor: vscode.TextEditor, range: vscode.Range, code: string): Promise<boolean>;
/**
 * Requests explicit user approval via VS Code warning dialog before modifying files.
 * CRITICAL SECURITY REQUIREMENT: Protects against silent code overwrites.
 */
export declare function applyCodeWithConfirmation(editor: vscode.TextEditor, code: string, action: 'insert' | 'replace' | 'range', range?: vscode.Range): Promise<boolean>;
/**
 * Displays a diff preview comparing original content with proposed code fixes.
 */
export declare function showDiffPreview(originalContent: string, newContent: string, fileName: string): Promise<void>;
