import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import type { BlockCommentTokens } from './blockCommentSpecialCases';

// U+00A7 Section Sign — never appears in any language's comment delimiter syntax.
// Used to substitute the dangerous character in inner block comment delimiters
// so they cannot prematurely terminate the outer wrapping comment.
export const AUGMENTOR = '§';

// Strip // line comments and /* */ block comments from JSONC, preserving string literals.
function stripJsonComments(raw: string): string {
  return raw.replace(
    /("(?:[^"\\]|\\.)*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
    (match, strLiteral) => strLiteral ?? ''
  );
}

// Read and parse the language-configuration.json contributed by whichever extension
// owns the given language ID. Works for both built-in and user-installed extensions.
async function getLanguageConfig(langId: string): Promise<Record<string, any> | undefined> {
  const ext = vscode.extensions.all.find(e => {
    const langs = e.packageJSON?.contributes?.languages;
    return Array.isArray(langs) && langs.some((l: any) => l.id === langId && l.configuration);
  });
  if (!ext) return undefined;

  const langEntry = (ext.packageJSON.contributes.languages as any[]).find(
    (l: any) => l.id === langId && l.configuration
  );
  const configPath = path.join(ext.extensionPath, langEntry.configuration);

  try {
    const raw = await fs.readFile(configPath, 'utf8');
    return JSON.parse(stripJsonComments(raw));
  } catch {
    return undefined;
  }
}

export async function getBlockCommentTokens(langId: string): Promise<BlockCommentTokens | undefined> {
  const config = await getLanguageConfig(langId);
  const bc = config?.comments?.blockComment;
  if (!Array.isArray(bc) || bc.length < 2) return undefined;
  return { open: bc[0], close: bc[1] };
}

export async function getLineCommentToken(langId: string): Promise<string | undefined> {
  const config = await getLanguageConfig(langId);
  const lc = config?.comments?.lineComment;
  return typeof lc === 'string' ? lc : undefined;
}

export function addWithAugmentation(
  editBuilder: vscode.TextEditorEdit,
  selection: vscode.Selection,
  editor: vscode.TextEditor,
  tokens: BlockCommentTokens
): void {
  const { open, close } = tokens;
  const selectedText = editor.document.getText(selection);
  const { augOpen, augClose } = augmentedForms(tokens);

  const augmented = selectedText
    .replace(new RegExp(escapeRegExp(open), 'g'), augOpen)
    .replace(new RegExp(escapeRegExp(close), 'g'), augClose);

  editBuilder.replace(selection, `${open} ${augmented} ${close}`);
}

// Walks upward from the cursor tracking { } depth to detect whether the cursor
// sits inside a Razor @{ } C# block. Returns 'csharp' if so, 'html' otherwise.
//
// Only @{ lines trigger C# detection — @if/@for/@while contain HTML markup, not C#,
// so an unmatched { on those lines is intentionally ignored.
//
// Known limitation: unbalanced { or } inside string literals can cause false results.
export function detectRazorSection(
  doc: { lineAt(i: number): { text: string } },
  cursorLine: number,
  cursorChar: number,
): string {
  let depth = 0;
  for (let i = cursorLine; i >= 0; i--) {
    const text = doc.lineAt(i).text;
    const end = i === cursorLine ? cursorChar : text.length;
    for (let c = end - 1; c >= 0; c--) {
      if (text[c] === '}') {
        depth++;
      } else if (text[c] === '{') {
        if (depth > 0) {
          depth--;
        } else {
          // Unmatched open brace. C# only when the line is a bare @{ block —
          // not @if/@for/@while, which wrap HTML, not C# statements.
          if (/^\s*@\s*\{/.test(text)) return 'csharp';
        }
      }
    }
  }
  return 'html';
}

// After insertEmptyBlockComment places `${open}  ${close}`, VS Code leaves the cursor
// after the close token. This maps each post-insert selection back to one space inside
// the open token (/* | */) by matching it against the recorded pre-insert positions.
export function placeCursorsInsideEmptyComment(
  selections: readonly vscode.Selection[],
  insertedAt: vscode.Position[],
  tokens: BlockCommentTokens,
): vscode.Selection[] {
  const commentLen = tokens.open.length + 2 + tokens.close.length;
  return selections.map((sel) => {
    const orig = insertedAt.find(
      (p) => sel.active.line === p.line && sel.active.character === p.character + commentLen,
    );
    if (!orig) return sel;
    const inside = orig.translate(0, tokens.open.length + 1);
    return new vscode.Selection(inside, inside);
  });
}

/**
 * VS Code-style detection: returns token positions if the selection sits inside
 * (or immediately at the boundary of) a block comment on the same lines.
 * Mirrors _createOperationsForBlockComment's lastIndexOf / indexOf search logic.
 */
export function detectInsideBlockComment(
  startLineText: string,
  endLineText: string,
  startLine: number,
  endLine: number,
  startChar: number,
  endChar: number,
  tokens: BlockCommentTokens,
): { openIdx: number; closeIdx: number } | null {
  const { open, close } = tokens;
  // lastIndexOf up to startChar + open.length: finds the open token that ends at or just before startChar.
  const openIdx = startLineText.lastIndexOf(open, startChar + open.length);
  // indexOf from endChar - close.length: finds the close token that starts at or just after endChar.
  const closeIdx = endLineText.indexOf(close, endChar - close.length);
  if (openIdx === -1 || closeIdx === -1) return null;
  // Guard: no close token between found open and close (would indicate broken/nested comment).
  if (startLine === endLine) {
    if (startLineText.slice(openIdx + open.length, closeIdx).includes(close)) return null;
  } else {
    if (startLineText.slice(openIdx + open.length).includes(close)) return null;
    if (endLineText.slice(0, closeIdx).includes(close)) return null;
  }
  return { openIdx, closeIdx };
}

/**
 * Compute the selection that should be active after wrapping with addWithAugmentation.
 * addWithAugmentation does replace(selection, `${open} ${augmented} ${close}`), so:
 * - Single-line: both endpoints shift right by (open.length + 1) for the `open ` prefix.
 * - Multi-line: only the anchor shifts (first line gets the prefix); the active line is
 *   unchanged because the `close` suffix appends after it without shifting that column.
 */
export function computePostAddSelection(
  selection: vscode.Selection,
  tokens: BlockCommentTokens,
): vscode.Selection {
  const { open } = tokens;
  const offset = open.length + 1; // `open ` prefix
  const anchor = new vscode.Position(selection.start.line, selection.start.character + offset);
  const active = selection.start.line === selection.end.line
    ? new vscode.Position(selection.end.line, selection.end.character + offset)
    : new vscode.Position(selection.end.line, selection.end.character);
  return new vscode.Selection(anchor, active);
}

/**
 * Compute the selection after expanding-and-removing a block comment whose tokens
 * sit just outside the original selection.
 * removeBlockCommentAroundSelection replaces `open [space] content [space] close` with
 * `content`, starting at openIdx on the start line, so:
 * - anchor lands at openIdx (where the open token was).
 * - Single-line active: openIdx + (original selection length), i.e. the content width.
 * - Multi-line active: closeIdx minus the leading space before the close token.
 */
export function computePostRemoveInsideSelection(
  selection: vscode.Selection,
  endLineText: string,
  openIdx: number,
  closeIdx: number,
): vscode.Selection {
  const anchor = new vscode.Position(selection.start.line, openIdx);
  let active: vscode.Position;
  if (selection.start.line === selection.end.line) {
    const contentLen = selection.end.character - selection.start.character;
    active = new vscode.Position(selection.start.line, openIdx + contentLen);
  } else {
    const spaceBeforeClose = endLineText[closeIdx - 1] === ' ' ? 1 : 0;
    active = new vscode.Position(selection.end.line, closeIdx - spaceBeforeClose);
  }
  return new vscode.Selection(anchor, active);
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Minimal substitution: replace only the last occurrence of close[0] in open,
// and only the first occurrence in close. One § per token rather than all.
// For HTML (<!-- / -->): <!-§ and §->  instead of <!§§ and §§>
// For JS/CSS (/* / */):  /§  and §/   (unchanged — only one * in each)
export function augmentedForms(tokens: BlockCommentTokens): { augOpen: string; augClose: string } {
  const c = tokens.close[0];
  const lastInOpen  = tokens.open.lastIndexOf(c);
  const firstInClose = tokens.close.indexOf(c);
  return {
    augOpen:  lastInOpen  === -1 ? tokens.open  : tokens.open.slice(0, lastInOpen)  + AUGMENTOR + tokens.open.slice(lastInOpen  + 1),
    augClose: firstInClose === -1 ? tokens.close : tokens.close.slice(0, firstInClose) + AUGMENTOR + tokens.close.slice(firstInClose + 1),
  };
}
