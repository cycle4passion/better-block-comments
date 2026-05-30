import * as assert from 'assert';
import { computePostAddSelection, computePostRemoveInsideSelection } from '../../blockCommentUtils';
import { Position, Selection } from './vscode-mock';

// Pure logic extracted from toggleBlockComment for unit testing.
// These mirror the isOuterComment check and line comment toggle logic
// without requiring a VS Code instance.

function isOuterComment(trimmed: string, open: string, close: string): boolean {
  if (!trimmed.startsWith(open) || !trimmed.endsWith(close)) return false;
  const inner = trimmed.slice(open.length, trimmed.length - close.length);
  return !inner.includes(close);
}

function toggleLineComment(text: string, token: string): string {
  const lines = text.split('\n');
  const allCommented = lines.every(l => l.trimStart().startsWith(token));
  return allCommented
    ? lines.map(l => l.replace(new RegExp(`^(\\s*)${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s?`), '$1')).join('\n')
    : lines.map(l => `${token} ${l}`).join('\n');
}

function sel(anchorLine: number, anchorChar: number, activeLine: number, activeChar: number) {
  return new Selection(new Position(anchorLine, anchorChar), new Position(activeLine, activeChar)) as any;
}

suite('toggleBlockComment — unit', () => {
  suite('isOuterComment', () => {
    test('simple block comment', () => {
      assert.ok(isOuterComment('/* foo */', '/*', '*/'));
    });

    test('rejects multi-comment selection', () => {
      assert.ok(!isOuterComment('/* a */ b /* c */', '/*', '*/'));
    });

    test('accepts augmented inner delimiters', () => {
      assert.ok(isOuterComment('/* /§ inner §/ */', '/*', '*/'));
    });

    test('empty comment', () => {
      assert.ok(isOuterComment('/*  */', '/*', '*/'));
    });

    test('HTML block comment', () => {
      assert.ok(isOuterComment('<!-- foo -->', '<!--', '-->'));
    });

    test('rejects HTML multi-comment', () => {
      assert.ok(!isOuterComment('<!-- a --> b <!-- c -->', '<!--', '-->'));
    });
  });

  suite('toggleLineComment', () => {
    test('adds token when no lines commented', () => {
      assert.strictEqual(toggleLineComment('foo\nbar', '#'), '# foo\n# bar');
    });

    test('removes token when all lines commented', () => {
      assert.strictEqual(toggleLineComment('# foo\n# bar', '#'), 'foo\nbar');
    });

    test('adds when only some lines commented', () => {
      assert.strictEqual(toggleLineComment('# foo\nbar', '#'), '# # foo\n# bar');
    });

    test('handles // token with escaping', () => {
      assert.strictEqual(toggleLineComment('// foo', '//'), 'foo');
    });

    test('preserves indentation on removal', () => {
      assert.strictEqual(toggleLineComment('  # foo', '#'), '  foo');
    });
  });

  suite('computePostAddSelection', () => {
    test('single-line: both endpoints shift by open.length + 1', () => {
      // "/* foo */" wraps "foo" at [0,0]–[0,3]; offset = 2+1 = 3
      const r = computePostAddSelection(sel(0, 0, 0, 3), { open: '/*', close: '*/' });
      assert.strictEqual(r.anchor.line, 0); assert.strictEqual(r.anchor.character, 3);
      assert.strictEqual(r.active.line, 0); assert.strictEqual(r.active.character, 6);
    });

    test('single-line: HTML open token (<!--) offset = 4+1 = 5', () => {
      const r = computePostAddSelection(sel(0, 2, 0, 7), { open: '<!--', close: '-->' });
      assert.strictEqual(r.anchor.character, 7);
      assert.strictEqual(r.active.character, 12);
    });

    test('multi-line: anchor shifts, active stays same', () => {
      // Selection [1,4]–[3,6] wrapped; open="/*" offset=3
      const r = computePostAddSelection(sel(1, 4, 3, 6), { open: '/*', close: '*/' });
      assert.strictEqual(r.anchor.line, 1); assert.strictEqual(r.anchor.character, 7);
      assert.strictEqual(r.active.line, 3); assert.strictEqual(r.active.character, 6);
    });
  });

  suite('computePostRemoveInsideSelection', () => {
    test('single-line: anchor at openIdx, active at openIdx + contentLen', () => {
      // "/* foo */" — original selection [0,3]–[0,6] ("foo"), openIdx=0, closeIdx=7
      const r = computePostRemoveInsideSelection(sel(0, 3, 0, 6), '/* foo */', 0, 7);
      assert.strictEqual(r.anchor.line, 0); assert.strictEqual(r.anchor.character, 0);
      assert.strictEqual(r.active.line, 0); assert.strictEqual(r.active.character, 3);
    });

    test('single-line: zero-length selection collapses to openIdx', () => {
      const r = computePostRemoveInsideSelection(sel(0, 5, 0, 5), '/* foo */', 0, 7);
      assert.strictEqual(r.anchor.character, 0);
      assert.strictEqual(r.active.character, 0);
    });

    test('multi-line: active at closeIdx - 1 when space precedes close token', () => {
      // endLineText = "end */" — closeIdx=4, char at 3 is ' '
      const r = computePostRemoveInsideSelection(sel(0, 3, 1, 3), 'end */', 0, 4);
      assert.strictEqual(r.anchor.line, 0); assert.strictEqual(r.anchor.character, 0);
      assert.strictEqual(r.active.line, 1); assert.strictEqual(r.active.character, 3);
    });

    test('multi-line: active at closeIdx when no space precedes close token', () => {
      // endLineText = "end*/" — closeIdx=3, char at 2 is 'd' (no space)
      const r = computePostRemoveInsideSelection(sel(0, 3, 1, 3), 'end*/', 0, 3);
      assert.strictEqual(r.anchor.line, 0); assert.strictEqual(r.anchor.character, 0);
      assert.strictEqual(r.active.line, 1); assert.strictEqual(r.active.character, 3);
    });
  });
});
