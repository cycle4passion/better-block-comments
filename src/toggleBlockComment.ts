import * as vscode from 'vscode';
import {
	insertEmptyBlockComment,
	removeEmptyBlockComment,
	removeBlockCommentAroundSelection,
	type BlockCommentEditContext,
} from './blockCommentSpecialCases';
import {
	getBlockCommentTokens,
	getLineCommentToken,
	addWithAugmentation,
	escapeRegExp,
	detectRazorSection,
	placeCursorsInsideEmptyComment,
	detectInsideBlockComment,
	computePostAddSelection,
	computePostRemoveInsideSelection,
} from './blockCommentUtils';

// HTML templating languages: expressions are inline delimiters (<% %>, {{ }}) rather
// than block tags, so there's no meaningful "code section" to scan into. The
// <script>/<style> tag scan still applies for embedded JS/CSS; everything else is
// HTML markup and should use html block comment tokens, not the template lang's own.
const HTML_TEMPLATE_LANGS = new Set(['ejs', 'nunjucks', 'jinja', 'twig', 'blade']);

// Razor embeds C# in HTML via @{ } blocks. Needs brace-depth counting to detect
// which language the cursor is in — a tag scan is useless here.
const RAZOR_LANGS = new Set(['razor', 'aspnetcorerazor']);

// All languages that go through the upward <script>/<style> tag scan.
const TAG_SCAN_LANGS = new Set([
	'svelte', 'vue', 'astro', 'html', 'php', 'mdx',
	...HTML_TEMPLATE_LANGS,
]);

// Detect which embedded language section the cursor sits in for mixed-language files.
// cursorChar is required for Razor (brace-depth scan); optional for tag-scanned langs.
export function detectLangId(
	doc: vscode.TextDocument,
	cursorLine: number,
	cursorChar?: number,
): string {
	const base = doc.languageId;

	// Razor — brace-depth counting to detect @{ } C# blocks.
	if (RAZOR_LANGS.has(base)) {
		const char = cursorChar ?? doc.lineAt(cursorLine).text.length;
		return detectRazorSection(doc, cursorLine, char);
	}

	// Upward <script>/<style> tag scan (Svelte, Vue, Astro, HTML, PHP, and HTML template langs).
	if (!TAG_SCAN_LANGS.has(base)) return base;

	// Astro frontmatter: lines 0..N between the two --- delimiters.
	if (base === 'astro') {
		let fmDelimiters = 0;
		for (let i = 0; i <= cursorLine; i++) {
			if (doc.lineAt(i).text.trim() === '---') fmDelimiters++;
		}
		if (fmDelimiters === 1) return 'javascript';
	}

	// HTML template languages fall back to 'html' — their own lang ID has no useful
	// block comment tokens. Svelte/Vue/Astro/HTML/PHP fall back to their own lang ID.
	const fallback = HTML_TEMPLATE_LANGS.has(base) ? 'html' : base;

	for (let i = cursorLine; i >= 0; i--) {
		const line = doc.lineAt(i).text.trimStart();
		if (/^<script/i.test(line)) return 'javascript';
		if (/^<style/i.test(line)) return 'css';
		if (/^<\/script>/i.test(line) || /^<\/style>/i.test(line)) return fallback;
	}

	return fallback;
}

export async function toggleBlockComment(editor: vscode.TextEditor) {
	const langId = detectLangId(
		editor.document,
		editor.selection.active.line,
		editor.selection.active.character,
	);
	const tokens = await getBlockCommentTokens(langId);

	// --- Fallback: language has no block comment syntax, use line comments ---
	if (!tokens) {
		const enabled = vscode.workspace
			.getConfiguration('betterBlockComments')
			.get<boolean>('lineCommentFallback', true);
		if (!enabled) return;

		const lineComment = await getLineCommentToken(langId);
		if (!lineComment) return;

		await editor.edit(
			(editBuilder) => {
				for (const selection of editor.selections) {
					const selectedText = editor.document.getText(selection);
					const lines = selectedText.split('\n');

					// True toggle: remove if every line starts with the token, otherwise add
					const allCommented = lines.every((line) => line.trimStart().startsWith(lineComment));

					const result = allCommented
						? lines
								.map((line) =>
									line.replace(new RegExp(`^(\\s*)${escapeRegExp(lineComment)}\\s?`), '$1'),
								)
								.join('\n')
						: lines.map((line) => `${lineComment} ${line}`).join('\n');

					editBuilder.replace(selection, result);
				}
			},
			{ undoStopBefore: true, undoStopAfter: true },
		);
		return;
	}

	// --- Block comment path: all cursors in a single undo step ---
	const universalCommentEnabled = vscode.workspace
		.getConfiguration('betterBlockComments')
		.get<boolean>('universalComment.enabled', true);

	// Pre-fetch line comment token only when needed (avoids async inside editBuilder)
	let lineCommentToken: string | undefined;
	if (universalCommentEnabled && editor.selections.some((s) => s.isEmpty)) {
		lineCommentToken = await getLineCommentToken(langId);
	}

	const inlineEndEnabled = vscode.workspace
		.getConfiguration('betterBlockComments')
		.get<boolean>('universalComment.inlineEnd', true);

	// Track positions where we insert an empty comment so we can land the cursor
	// inside it (one space past the open token) after the edit resolves.
	const insertedAt: vscode.Position[] = [];
	// Track inline-end insertions for cursor repositioning after the edit.
	const inlineEndInsertions: { lineNo: number; targetChar: number }[] = [];
	// Track post-edit selection adjustments for the selection-present paths.
	// null means "leave whatever VS Code sets"; non-null overrides.
	const selectionAdjustments: (vscode.Selection | null)[] = editor.selections.map(() => null);

	await editor.edit(
		(editBuilder) => {
			for (let selIdx = 0; selIdx < editor.selections.length; selIdx++) {
				const selection = editor.selections[selIdx];
				const ctx: BlockCommentEditContext = { editor, selection, tokens };

				// Case 1 & 2: collapsed cursor
				if (selection.isEmpty) {
					if (universalCommentEnabled && lineCommentToken) {
						const lineNo = selection.active.line;
						const lineText = editor.document.lineAt(lineNo).text;
						const trimmedEnd = lineText.trimEnd();
						const cursorChar = selection.active.character;
						const isAtLineEnd = trimmedEnd.length > 0 && cursorChar >= trimmedEnd.length;

						if (inlineEndEnabled && isAtLineEnd) {
							// Inline End Comment: toggle `⎵TOKEN⎵` at end of content
							const inlineIdx = trimmedEnd.lastIndexOf(' ' + lineCommentToken);
							if (inlineIdx > 0) {
								// Remove trailing inline comment (space before token through end of line)
								editBuilder.delete(new vscode.Range(lineNo, inlineIdx, lineNo, lineText.length));
							} else {
								// Append inline comment after content
								editBuilder.insert(
									new vscode.Position(lineNo, trimmedEnd.length),
									' ' + lineCommentToken + ' ',
								);
								inlineEndInsertions.push({
									lineNo,
									targetChar: trimmedEnd.length + lineCommentToken.length + 2,
								});
							}
						} else {
							// Universal Comment: toggle line comment after indentation
							const indentLen = lineText.length - lineText.trimStart().length;
							const lineContent = lineText.slice(indentLen);
							const tokenWithSpace = lineCommentToken + ' ';
							if (lineContent.startsWith(tokenWithSpace)) {
								editBuilder.delete(new vscode.Range(lineNo, indentLen, lineNo, indentLen + tokenWithSpace.length));
							} else if (lineContent.startsWith(lineCommentToken)) {
								editBuilder.delete(new vscode.Range(lineNo, indentLen, lineNo, indentLen + lineCommentToken.length));
							} else {
								editBuilder.insert(new vscode.Position(lineNo, indentLen), tokenWithSpace);
							}
						}
					} else {
						// Insert or remove empty block comment
						const line = editor.document.lineAt(selection.active.line).text;
						const isInsideExisting =
							line.lastIndexOf(tokens.open, selection.active.character) !== -1 &&
							line.indexOf(tokens.close, selection.active.character) !== -1;

						if (isInsideExisting) {
							removeEmptyBlockComment(editBuilder, ctx);
						} else {
							insertEmptyBlockComment(editBuilder, ctx);
							insertedAt.push(selection.active);
						}
					}
					continue;
				}

				// Case 3+: selection present — determine toggle direction
				const trimmed = editor.document.getText(selection).trim();
				const { open, close } = tokens;

				// Tightened check: the first open and last close must be an outer matched pair —
				// the content between them must not contain another close token.
				const inner = trimmed.slice(open.length, trimmed.length - close.length);
				const isOuterComment =
					trimmed.startsWith(open) && trimmed.endsWith(close) && !inner.includes(close);

				// VS Code-style inside-comment detection: tokens may sit just outside the selection.
				const startLineText = editor.document.lineAt(selection.start.line).text;
				const endLineText = editor.document.lineAt(selection.end.line).text;
				const insideResult = !isOuterComment
					? detectInsideBlockComment(
						startLineText, endLineText,
						selection.start.line, selection.end.line,
						selection.start.character, selection.end.character,
						tokens,
					)
					: null;

				if (isOuterComment) {
					// Already commented (selection includes tokens) — attempt removal.
					// Falls back to add if the removal guard triggers.
					const removed = removeBlockCommentAroundSelection(editBuilder, ctx);
					if (!removed) {
						addWithAugmentation(editBuilder, selection, editor, tokens);
						selectionAdjustments[selIdx] = computePostAddSelection(selection, tokens);
					}
				} else if (insideResult) {
					// Selection sits inside a block comment — expand to tokens and remove.
					const { openIdx, closeIdx } = insideResult;
					const expandedStart = new vscode.Position(selection.start.line, openIdx);
					const expandedEnd = new vscode.Position(selection.end.line, closeIdx + close.length);
					const expandedCtx: BlockCommentEditContext = {
						editor,
						selection: new vscode.Selection(expandedStart, expandedEnd),
						tokens,
					};
					removeBlockCommentAroundSelection(editBuilder, expandedCtx);
					selectionAdjustments[selIdx] = computePostRemoveInsideSelection(
						selection, endLineText, openIdx, closeIdx,
					);
				} else {
					// Not yet commented — wrap with block comment, augmenting any inner delimiters.
					addWithAugmentation(editBuilder, selection, editor, tokens);
					selectionAdjustments[selIdx] = computePostAddSelection(selection, tokens);
				}
			}
		},
		{ undoStopBefore: true, undoStopAfter: true },
	);

	if (selectionAdjustments.some((s) => s !== null)) {
		editor.selections = editor.selections.map((sel, i) => selectionAdjustments[i] ?? sel);
	}

	if (insertedAt.length > 0) {
		editor.selections = placeCursorsInsideEmptyComment(editor.selections, insertedAt, tokens);
	}

	if (inlineEndInsertions.length > 0) {
		editor.selections = editor.selections.map((sel) => {
			const ins = inlineEndInsertions.find(({ lineNo }) => lineNo === sel.active.line);
			if (!ins) return sel;
			const pos = new vscode.Position(ins.lineNo, ins.targetChar);
			return new vscode.Selection(pos, pos);
		});
	}
}
