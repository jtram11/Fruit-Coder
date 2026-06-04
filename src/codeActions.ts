import * as vscode from 'vscode';

/**
 * Inserts code at the current cursor position in the active text editor.
 */
export async function insertCodeAtCursor(editor: vscode.TextEditor, code: string): Promise<boolean> {
    return editor.edit(editBuilder => {
        editBuilder.insert(editor.selection.active, code);
    });
}

/**
 * Replaces the active selection in the editor with new code.
 */
export async function replaceSelection(editor: vscode.TextEditor, code: string): Promise<boolean> {
    return editor.edit(editBuilder => {
        editBuilder.replace(editor.selection, code);
    });
}

/**
 * Replaces a specific line range with new code.
 */
export async function replaceRange(editor: vscode.TextEditor, range: vscode.Range, code: string): Promise<boolean> {
    return editor.edit(editBuilder => {
        editBuilder.replace(range, code);
    });
}

/**
 * Requests explicit user approval via VS Code warning dialog before modifying files.
 * CRITICAL SECURITY REQUIREMENT: Protects against silent code overwrites.
 */
export async function applyCodeWithConfirmation(
    editor: vscode.TextEditor,
    code: string,
    action: 'insert' | 'replace' | 'range',
    range?: vscode.Range
): Promise<boolean> {
    const message = action === 'range' 
        ? `Apply AI suggested bug-fix to lines ${range ? (range.start.line + 1) + '-' + (range.end.line + 1) : ''}? This will overwrite your code.`
        : `Apply AI-generated code change to active file?`;
        
    const choice = await vscode.window.showWarningMessage(
        message,
        { modal: true },
        'Yes, Apply Change',
        'No, Cancel'
    );

    if (choice === 'Yes, Apply Change') {
        if (action === 'insert') {
            return await insertCodeAtCursor(editor, code);
        } else if (action === 'replace') {
            return await replaceSelection(editor, code);
        } else if (action === 'range' && range) {
            return await replaceRange(editor, range, code);
        }
    }
    return false;
}

/**
 * Displays a diff preview comparing original content with proposed code fixes.
 */
export async function showDiffPreview(originalContent: string, newContent: string, fileName: string): Promise<void> {
    // Create temporary virtual documents for diff comparison
    const originalDoc = await vscode.workspace.openTextDocument({
        content: originalContent,
        language: vscode.window.activeTextEditor?.document.languageId
    });
    
    const proposedDoc = await vscode.workspace.openTextDocument({
        content: newContent,
        language: vscode.window.activeTextEditor?.document.languageId
    });

    await vscode.commands.executeCommand(
        'vscode.diff',
        originalDoc.uri,
        proposedDoc.uri,
        `Original Code ↔ Fixed Code (${fileName})`
    );
}
