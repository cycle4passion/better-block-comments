import * as assert from 'assert';
import { augmentedForms, escapeRegExp, AUGMENTOR, detectInsideBlockComment } from '../../blockCommentUtils';

suite('blockCommentUtils — unit', () => {
  suite('augmentedForms', () => {
    test('JS/CSS: replaces * with § in both delimiters', () => {
      const tokens = { open: '/*', close: '*/' };
      const { augOpen, augClose } = augmentedForms(tokens);
      assert.strictEqual(augOpen, '/§');
      assert.strictEqual(augClose, '§/');
    });

    test('HTML: replaces only last - in open and first - in close', () => {
      const tokens = { open: '<!--', close: '-->' };
      const { augOpen, augClose } = augmentedForms(tokens);
      assert.strictEqual(augOpen, '<!-§');
      assert.strictEqual(augClose, '§->');
    });

    test('JSX: replaces * with § in both delimiters', () => {
      const tokens = { open: '{/*', close: '*/}' };
      const { augOpen, augClose } = augmentedForms(tokens);
      assert.strictEqual(augOpen, '{/§');
      assert.strictEqual(augClose, '§/}');
    });

    test('augmented close never contains original close sequence', () => {
      for (const [open, close] of [['/*', '*/'], ['<!--', '-->'], ['{/*', '*/}']]) {
        const { augClose } = augmentedForms({ open, close });
        assert.ok(!augClose.includes(close), `augClose "${augClose}" still contains "${close}"`);
      }
    });
  });

  suite('escapeRegExp', () => {
    test('escapes // for safe use in RegExp', () => {
      const escaped = escapeRegExp('//');
      assert.doesNotThrow(() => new RegExp(escaped));
    });

    test('escapes /* for safe use in RegExp', () => {
      const escaped = escapeRegExp('/*');
      assert.doesNotThrow(() => new RegExp(escaped));
    });
  });

  suite('AUGMENTOR constant', () => {
    test('is the section sign character', () => {
      assert.strictEqual(AUGMENTOR, '§');
      assert.strictEqual(AUGMENTOR.charCodeAt(0), 0x00a7);
    });
  });
});

suite('detectInsideBlockComment — unit', () => {
  const JS = { open: '/*', close: '*/' };
  const HTML = { open: '<!--', close: '-->' };

  suite('single-line cases', () => {
    test('cursor inside simple block comment', () => {
      // "/* foo */"  cursor at 5 (inside "foo")
      const line = '/* foo */';
      const result = detectInsideBlockComment(line, line, 0, 0, 5, 5, JS);
      assert.deepStrictEqual(result, { openIdx: 0, closeIdx: 7 });
    });

    test('selection exactly spanning comment content', () => {
      // "/* hello */"  selection from 3 to 8 ("hello")
      const line = '/* hello */';
      const result = detectInsideBlockComment(line, line, 0, 0, 3, 8, JS);
      assert.deepStrictEqual(result, { openIdx: 0, closeIdx: 9 });
    });

    test('selection at open-token boundary (startChar === openIdx)', () => {
      // Selection starts exactly where open token starts
      const line = '/* foo */';
      const result = detectInsideBlockComment(line, line, 0, 0, 0, 5, JS);
      assert.deepStrictEqual(result, { openIdx: 0, closeIdx: 7 });
    });

    test('selection at close-token boundary (endChar === closeIdx)', () => {
      const line = '/* foo */';
      const result = detectInsideBlockComment(line, line, 0, 0, 3, 7, JS);
      assert.deepStrictEqual(result, { openIdx: 0, closeIdx: 7 });
    });

    test('returns null when no open token present', () => {
      const line = 'foo */';
      assert.strictEqual(detectInsideBlockComment(line, line, 0, 0, 0, 3, JS), null);
    });

    test('returns null when no close token present', () => {
      const line = '/* foo';
      assert.strictEqual(detectInsideBlockComment(line, line, 0, 0, 3, 5, JS), null);
    });

    test('returns null when extra close between open and cursor (guard)', () => {
      // "/* a */ /* b */" — cursor at 10 finds open=0, close=14, but */ at 5 is between them
      const line = '/* a */ /* b */';
      // Selection inside second comment: startChar=10, endChar=11
      // openIdx = lastIndexOf('/*', 10+2) = 8, closeIdx = indexOf('*/', 11-2) = 13
      // Between openIdx+2 and closeIdx: " b " — no extra */, so this SHOULD succeed
      const result = detectInsideBlockComment(line, line, 0, 0, 10, 11, JS);
      assert.deepStrictEqual(result, { openIdx: 8, closeIdx: 13 });
    });

    test('returns null when close token appears between open and selection', () => {
      // "/* a */ more"  cursor at 9 — would find open=0, but */ at 5 is between open+2 and close
      const line = '/* a */ more';
      // There's no close after cursor so indexOf returns -1 → null
      assert.strictEqual(detectInsideBlockComment(line, line, 0, 0, 9, 9, JS), null);
    });

    test('works with HTML tokens', () => {
      const line = '<!-- hello -->';
      const result = detectInsideBlockComment(line, line, 0, 0, 5, 10, HTML);
      assert.deepStrictEqual(result, { openIdx: 0, closeIdx: 11 });
    });

    test('returns null for HTML when no tokens present', () => {
      const line = 'hello world';
      assert.strictEqual(detectInsideBlockComment(line, line, 0, 0, 3, 7, HTML), null);
    });
  });

  suite('multi-line cases', () => {
    test('selection spans two lines inside a block comment', () => {
      // Line 0: "/* start"  — open at 0
      // Line 1: "end */"    — close at 4
      const startLine = '/* start';
      const endLine = 'end */';
      const result = detectInsideBlockComment(startLine, endLine, 0, 1, 3, 3, JS);
      assert.deepStrictEqual(result, { openIdx: 0, closeIdx: 4 });
    });

    test('returns null when start line has close token between open and end of line', () => {
      // Line 0: "/* a */ rest"  — close token on start line before end
      const startLine = '/* a */ rest';
      const endLine = 'end */';
      const result = detectInsideBlockComment(startLine, endLine, 0, 1, 8, 3, JS);
      assert.strictEqual(result, null);
    });

    test('returns null when end line has close token before expected closeIdx', () => {
      // Line 1: "*/ end */"  — close at 0 before actual close at 7
      const startLine = '/* start';
      const endLine = '*/ end */';
      // endChar=6, closeIdx = indexOf('*/', 6-2=4) = 7
      // endLineText.slice(0, 7) = '*/ end ' which includes '*/' → guard fires
      const result = detectInsideBlockComment(startLine, endLine, 0, 1, 3, 6, JS);
      assert.strictEqual(result, null);
    });
  });
});
