import * as vscode from 'vscode';
import { augmentedForms } from './blockCommentUtils';

export type BlockCommentTokens = {
	open: string;
	close: string;
};

export type BlockCommentEditContext = {
	editor: vscode.TextEditor;
	selection: vscode.Selection;
	tokens: BlockCommentTokens;
};

/** Insert an empty block comment at the cursor: `open  close` */
export function insertEmptyBlockComment(
	editBuilder: vscode.TextEditorEdit,
	ctx: BlockCommentEditContext,
): void {
	const { open, close } = ctx.tokens;
	// Two spaces between tokens so the cursor lands inside with room to type.
	// Caller is responsible for repositioning the cursor after the edit resolves.
	editBuilder.insert(ctx.selection.active, `${open}  ${close}`);
}

/** Remove an inline empty block comment surrounding the cursor on the current line. */
export function removeEmptyBlockComment(
	editBuilder: vscode.TextEditorEdit,
	ctx: BlockCommentEditContext,
): void {
	const { editor, selection, tokens } = ctx;
	const { open, close } = tokens;
	const lineNo = selection.active.line;
	const lineText = editor.document.lineAt(lineNo).text;
	const cursor = selection.active.character;

	const openIdx = lineText.lastIndexOf(open, cursor);
	const closeIdx = lineText.indexOf(close, cursor);

	if (openIdx === -1 || closeIdx === -1) return;

	const between = lineText.slice(openIdx + open.length, closeIdx).trim();
	editBuilder.replace(new vscode.Range(lineNo, openIdx, lineNo, closeIdx + close.length), between);
}

/**
 * Remove the outer block comment from the selection and restore any inner
 * augmented delimiters (§ → original character).
 * Returns false if no outer comment pair was found.
 */
export function removeBlockCommentAroundSelection(
	editBuilder: vscode.TextEditorEdit,
	ctx: BlockCommentEditContext,
): boolean {
	const { editor, selection, tokens } = ctx;
	const { open, close } = tokens;
	const selectionText = editor.document.getText(selection);

	const openIdx = selectionText.indexOf(open);
	const closeIdx = selectionText.lastIndexOf(close);

	if (openIdx === -1 || closeIdx === -1 || closeIdx <= openIdx) return false;

	let inner = selectionText.slice(openIdx + open.length, closeIdx);

	// Strip the single padding space added by addWithAugmentation
	if (inner.startsWith(' ')) inner = inner.slice(1);
	if (inner.endsWith(' ')) inner = inner.slice(0, -1);

	// De-augment: restore §-substituted inner delimiters back to their originals
	const { augOpen, augClose } = augmentedForms(tokens);
	const deaugmented = inner.split(augOpen).join(open).split(augClose).join(close);

	editBuilder.replace(selection, deaugmented);
	return true;
}

