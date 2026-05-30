import * as assert from 'assert';
import * as vscode from 'vscode';

suite('toggleBlockComment — e2e', () => {
  async function withDocument(content: string, languageId: string, fn: (doc: vscode.TextDocument, editor: vscode.TextEditor) => Promise<void>) {
    const doc = await vscode.workspace.openTextDocument({ content, language: languageId });
    const editor = await vscode.window.showTextDocument(doc);
    await fn(doc, editor);
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  }

  async function toggle(editor: vscode.TextEditor, anchor: vscode.Position, active: vscode.Position) {
    editor.selection = new vscode.Selection(anchor, active);
    await vscode.commands.executeCommand('better-block-comments.toggleBlockComment');
  }

  test('wraps JS selection in block comment', async () => {
    await withDocument('const x = 1;', 'javascript', async (doc, editor) => {
      await toggle(editor, new vscode.Position(0, 0), new vscode.Position(0, 12));
      assert.strictEqual(doc.getText(), '/* const x = 1; */');
    });
  });

  test('unwraps JS block comment', async () => {
    await withDocument('/* const x = 1; */', 'javascript', async (doc, editor) => {
      await toggle(editor, new vscode.Position(0, 0), new vscode.Position(0, 18));
      assert.strictEqual(doc.getText(), 'const x = 1;');
    });
  });

  test('augments inner delimiters when wrapping', async () => {
    await withDocument('/* inner */', 'javascript', async (doc, editor) => {
      await toggle(editor, new vscode.Position(0, 0), new vscode.Position(0, 11));
      assert.strictEqual(doc.getText(), '/* /§ inner §/ */');
    });
  });

  test('restores inner delimiters when unwrapping', async () => {
    await withDocument('/* /§ inner §/ */', 'javascript', async (doc, editor) => {
      await toggle(editor, new vscode.Position(0, 0), new vscode.Position(0, 17));
      assert.strictEqual(doc.getText(), '/* inner */');
    });
  });

  test('line comment toggle adds and removes', async () => {
    await withDocument('line one\nline two', 'python', async (doc, editor) => {
      await toggle(editor, new vscode.Position(0, 0), new vscode.Position(1, 8));
      assert.strictEqual(doc.getText(), '# line one\n# line two');
      await toggle(editor, new vscode.Position(0, 0), new vscode.Position(1, 10));
      assert.strictEqual(doc.getText(), 'line one\nline two');
    });
  });

  // Universal Comment (collapsed cursor) tests
  test('universal comment: adds line comment on collapsed cursor in JS', async () => {
    await withDocument('const x = 1;', 'javascript', async (doc, editor) => {
      // Collapsed cursor mid-line — should toggle //
      await toggle(editor, new vscode.Position(0, 6), new vscode.Position(0, 6));
      assert.strictEqual(doc.getText(), '// const x = 1;');
    });
  });

  test('universal comment: removes line comment on collapsed cursor in JS', async () => {
    await withDocument('// const x = 1;', 'javascript', async (doc, editor) => {
      await toggle(editor, new vscode.Position(0, 4), new vscode.Position(0, 4));
      assert.strictEqual(doc.getText(), 'const x = 1;');
    });
  });

  test('universal comment: preserves indentation when adding', async () => {
    await withDocument('  const x = 1;', 'javascript', async (doc, editor) => {
      await toggle(editor, new vscode.Position(0, 4), new vscode.Position(0, 4));
      assert.strictEqual(doc.getText(), '  // const x = 1;');
    });
  });

  test('universal comment: preserves indentation when removing', async () => {
    await withDocument('  // const x = 1;', 'javascript', async (doc, editor) => {
      await toggle(editor, new vscode.Position(0, 6), new vscode.Position(0, 6));
      assert.strictEqual(doc.getText(), '  const x = 1;');
    });
  });

  // Inline End Comment tests
  test('inline end: adds line comment at end of line content', async () => {
    await withDocument('const x = 1;', 'javascript', async (doc, editor) => {
      // Cursor at the end of line content
      const endChar = 'const x = 1;'.length;
      await toggle(editor, new vscode.Position(0, endChar), new vscode.Position(0, endChar));
      assert.strictEqual(doc.getText(), 'const x = 1; // ');
    });
  });

  test('inline end: removes existing line comment from end of line', async () => {
    await withDocument('const x = 1; // ', 'javascript', async (doc, editor) => {
      const endChar = 'const x = 1; // '.length;
      await toggle(editor, new vscode.Position(0, endChar), new vscode.Position(0, endChar));
      assert.strictEqual(doc.getText(), 'const x = 1;');
    });
  });

  // Inside-comment detection for selections
  test('inside-comment: unwraps when selection sits inside block comment tokens', async () => {
    await withDocument('/* hello */', 'javascript', async (doc, editor) => {
      // Select only "hello" (chars 3–8), tokens are outside the selection
      await toggle(editor, new vscode.Position(0, 3), new vscode.Position(0, 8));
      assert.strictEqual(doc.getText(), 'hello');
    });
  });

  test('inside-comment: unwraps HTML comment when selection is inside', async () => {
    await withDocument('<!-- world -->', 'html', async (doc, editor) => {
      // Select "world" (chars 5–10)
      await toggle(editor, new vscode.Position(0, 5), new vscode.Position(0, 10));
      assert.strictEqual(doc.getText(), 'world');
    });
  });
});
