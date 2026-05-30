import * as assert from 'assert';
import * as vscode from 'vscode';

// Opens a multi-line document, runs toggle on a single-line selection,
// returns the text of that line after the edit.
async function toggleLine(
	content: string,
	languageId: string,
	line: number,
	startChar: number,
	endChar: number,
): Promise<string> {
	const doc = await vscode.workspace.openTextDocument({ content, language: languageId });
	const editor = await vscode.window.showTextDocument(doc);
	try {
		editor.selection = new vscode.Selection(
			new vscode.Position(line, startChar),
			new vscode.Position(line, endChar),
		);
		await vscode.commands.executeCommand('better-block-comments.toggleBlockComment');
		return doc.lineAt(line).text;
	} finally {
		await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
	}
}

// ---------------------------------------------------------------------------
// Template-section tests depend on the host extension being installed.
// Script/style-section tests always work (JS and CSS are VS Code built-ins).
// ---------------------------------------------------------------------------

suite('Mixed-language toggle — e2e', () => {
	// -----------------------------------------------------------------------
	// Svelte
	// -----------------------------------------------------------------------
	suite('svelte', () => {
		// Line lengths (0-indexed):
		//  0  '<script>'               → 8 chars
		//  1  '  const x = 1;'        → 14 chars  select [2,14] = 'const x = 1;'
		//  2  '</script>'
		//  3  '<style>'
		//  4  '  .foo { color: red; }' → 22 chars  select [2,22] = '.foo { color: red; }'
		//  5  '</style>'
		//  6  '<div>'
		//  7  '  hello world'          → 13 chars  select [2,13] = 'hello world'
		//  8  '</div>'
		const content = [
			'<script>',
			'  const x = 1;',
			'</script>',
			'<style>',
			'  .foo { color: red; }',
			'</style>',
			'<div>',
			'  hello world',
			'</div>',
		].join('\n');

		test('<script> section uses JS block comment /* */', async () => {
			const result = await toggleLine(content, 'svelte', 1, 2, 14);
			assert.strictEqual(result, '  /* const x = 1; */');
		});

		test('<style> section uses CSS block comment /* */', async () => {
			const result = await toggleLine(content, 'svelte', 4, 2, 22);
			assert.strictEqual(result, '  /* .foo { color: red; } */');
		});

		// Requires Svelte VS Code extension (svelte.svelte-vscode) to be installed.
		test('template section uses Svelte/HTML block comment <!-- -->', async () => {
			const result = await toggleLine(content, 'svelte', 7, 2, 13);
			assert.strictEqual(result, '  <!-- hello world -->');
		});
	});

	// -----------------------------------------------------------------------
	// Vue
	// -----------------------------------------------------------------------
	suite('vue', () => {
		// Line lengths:
		//  0  '<script setup>'
		//  1  '  const x = 1;'            → 14 chars  select [2,14]
		//  2  '</script>'
		//  3  '<style scoped>'
		//  4  '  .v { color: blue; }'     → 21 chars  select [2,21]
		//  5  '</style>'
		//  6  '<template>'
		//  7  '  <p>hello</p>'            → 14 chars  select [2,14]
		//  8  '</template>'
		const content = [
			'<script setup>',
			'  const x = 1;',
			'</script>',
			'<style scoped>',
			'  .v { color: blue; }',
			'</style>',
			'<template>',
			'  <p>hello</p>',
			'</template>',
		].join('\n');

		test('<script setup> section uses JS block comment /* */', async () => {
			const result = await toggleLine(content, 'vue', 1, 2, 14);
			assert.strictEqual(result, '  /* const x = 1; */');
		});

		test('<style scoped> section uses CSS block comment /* */', async () => {
			const result = await toggleLine(content, 'vue', 4, 2, 21);
			assert.strictEqual(result, '  /* .v { color: blue; } */');
		});

		// Requires Vue VS Code extension to be installed.
		test('template section uses Vue/HTML block comment <!-- -->', async () => {
			const result = await toggleLine(content, 'vue', 7, 2, 14);
			assert.strictEqual(result, '  <!-- <p>hello</p> -->');
		});
	});

	// -----------------------------------------------------------------------
	// Astro
	// -----------------------------------------------------------------------
	suite('astro', () => {
		// Line lengths:
		//  0  '---'
		//  1  "const greeting = 'hello';"  → 25 chars  select [0,25]
		//  2  '---'
		//  3  '<main>'
		//  4  '  <p>astro page</p>'        → 19 chars  select [2,19]
		//  5  '</main>'
		const content = [
			'---',
			"const greeting = 'hello';",
			'---',
			'<main>',
			'  <p>astro page</p>',
			'</main>',
		].join('\n');

		test('frontmatter (between --- delimiters) uses JS block comment /* */', async () => {
			const result = await toggleLine(content, 'astro', 1, 0, 25);
			assert.strictEqual(result, "/* const greeting = 'hello'; */");
		});

		// Requires Astro VS Code extension to be installed.
		test('template section uses Astro/HTML block comment <!-- -->', async () => {
			const result = await toggleLine(content, 'astro', 4, 2, 19);
			assert.strictEqual(result, '  <!-- <p>astro page</p> -->');
		});
	});

	// -----------------------------------------------------------------------
	// HTML (built-in — no extra extension required)
	// -----------------------------------------------------------------------
	suite('html', () => {
		// Line lengths:
		//  0  '<html>'
		//  1  '<head>'
		//  2  '<script>'
		//  3  '  var n = 42;'              → 13 chars  select [2,13]
		//  4  '</script>'
		//  5  '<style>'
		//  6  '  body { margin: 0; }'     → 21 chars  select [2,21]
		//  7  '</style>'
		//  8  '</head>'
		//  9  '<body>'
		//  10 '  <p>content</p>'           → 16 chars  select [2,16]
		//  11 '</body>'
		//  12 '</html>'
		const content = [
			'<html>',
			'<head>',
			'<script>',
			'  var n = 42;',
			'</script>',
			'<style>',
			'  body { margin: 0; }',
			'</style>',
			'</head>',
			'<body>',
			'  <p>content</p>',
			'</body>',
			'</html>',
		].join('\n');

		test('<script> section uses JS block comment /* */', async () => {
			const result = await toggleLine(content, 'html', 3, 2, 13);
			assert.strictEqual(result, '  /* var n = 42; */');
		});

		test('<style> section uses CSS block comment /* */', async () => {
			const result = await toggleLine(content, 'html', 6, 2, 21);
			assert.strictEqual(result, '  /* body { margin: 0; } */');
		});

		test('<body> section uses HTML block comment <!-- -->', async () => {
			const result = await toggleLine(content, 'html', 10, 2, 16);
			assert.strictEqual(result, '  <!-- <p>content</p> -->');
		});
	});

	// -----------------------------------------------------------------------
	// PHP
	// -----------------------------------------------------------------------
	suite('php', () => {
		// Line lengths:
		//  0  '<?php'
		//  1  '  $x = 1;'                 → 9 chars   select [2,9]
		//  2  '?>'
		//  3  '<p>php page</p>'            → 15 chars  select [0,15]
		//  4  '<script>'
		//  5  '  var z = 3;'              → 12 chars  select [2,12]
		//  6  '</script>'
		//  7  '<style>'
		//  8  '  .cls { }'               → 10 chars  select [2,10]
		//  9  '</style>'
		const content = [
			'<?php',
			'  $x = 1;',
			'?>',
			'<p>php page</p>',
			'<script>',
			'  var z = 3;',
			'</script>',
			'<style>',
			'  .cls { }',
			'</style>',
		].join('\n');

		test('PHP code body uses PHP block comment /* */', async () => {
			const result = await toggleLine(content, 'php', 1, 2, 9);
			assert.strictEqual(result, '  /* $x = 1; */');
		});

		// HTML section outside <script>/<style> returns 'php' (known limitation —
		// distinguishing PHP code from PHP HTML template requires deeper parsing).
		test('HTML section of PHP file uses PHP block comment /* */', async () => {
			const result = await toggleLine(content, 'php', 3, 0, 15);
			assert.strictEqual(result, '/* <p>php page</p> */');
		});

		test('<script> inside PHP uses JS block comment /* */', async () => {
			const result = await toggleLine(content, 'php', 5, 2, 12);
			assert.strictEqual(result, '  /* var z = 3; */');
		});

		test('<style> inside PHP uses CSS block comment /* */', async () => {
			const result = await toggleLine(content, 'php', 8, 2, 10);
			assert.strictEqual(result, '  /* .cls { } */');
		});
	});

	// -----------------------------------------------------------------------
	// HTML template languages (EJS / Nunjucks / Twig / Blade)
	// Body section always falls back to html tokens <!-- -->.
	// <script>/<style> embedded sections still use JS/CSS tokens.
	// These tests work without the template extension installed because the
	// fallback path calls getBlockCommentTokens('html'), which is built-in.
	// -----------------------------------------------------------------------
	suite('HTML template languages', () => {
		// Line lengths:
		//  0  '<script>'
		//  1  '  var x = 1;'    → 12 chars  select [2,12]
		//  2  '</script>'
		//  3  '<style>'
		//  4  '  body { }'      → 10 chars  select [2,10]
		//  5  '</style>'
		//  6  '<div>'
		//  7  '  some markup'   → 13 chars  select [2,13]
		//  8  '</div>'
		const content = [
			'<script>',
			'  var x = 1;',
			'</script>',
			'<style>',
			'  body { }',
			'</style>',
			'<div>',
			'  some markup',
			'</div>',
		].join('\n');

		for (const langId of ['ejs', 'nunjucks', 'jinja', 'twig', 'blade']) {
			test(`${langId}: body section uses HTML block comment <!-- -->`, async () => {
				const result = await toggleLine(content, langId, 7, 2, 13);
				assert.strictEqual(result, '  <!-- some markup -->');
			});

			test(`${langId}: <script> section uses JS block comment /* */`, async () => {
				const result = await toggleLine(content, langId, 1, 2, 12);
				assert.strictEqual(result, '  /* var x = 1; */');
			});

			test(`${langId}: <style> section uses CSS block comment /* */`, async () => {
				const result = await toggleLine(content, langId, 4, 2, 10);
				assert.strictEqual(result, '  /* body { } */');
			});
		}
	});

	// -----------------------------------------------------------------------
	// Razor — brace-depth counting for @{ } C# blocks.
	// These tests work without a Razor extension because:
	//   - C# block path calls getBlockCommentTokens('csharp') — built-in in VS Code
	//   - HTML path calls getBlockCommentTokens('html') — built-in
	// -----------------------------------------------------------------------
	suite('razor', () => {
		// Line lengths:
		//  0  '@{'
		//  1  '  var msg = "hello";'   → 20 chars  select [2,20]  (inside @{})
		//  2  '}'
		//  3  '<p>razor page</p>'      → 17 chars  select [0,17]  (HTML body)
		//  4  '@if (Model.Show) {'
		//  5  '  <span>yes</span>'     → 18 chars  select [2,18]  (HTML inside @if)
		//  6  '}'
		const content = [
			'@{',
			'  var msg = "hello";',
			'}',
			'<p>razor page</p>',
			'@if (Model.Show) {',
			'  <span>yes</span>',
			'}',
		].join('\n');

		test('inside @{ } block uses C# block comment /* */', async () => {
			// cursorChar=2 (start of the C# statement) — toggleLine places cursor at startChar
			const result = await toggleLine(content, 'razor', 1, 2, 20);
			assert.strictEqual(result, '  /* var msg = "hello"; */');
		});

		test('HTML body outside @{ } uses HTML block comment <!-- -->', async () => {
			const result = await toggleLine(content, 'razor', 3, 0, 17);
			assert.strictEqual(result, '<!-- <p>razor page</p> -->');
		});

		// @if { } wraps HTML, not C# — cursor on the HTML line should get <!-- -->
		test('HTML line inside @if { } block uses HTML block comment <!-- -->', async () => {
			const result = await toggleLine(content, 'razor', 5, 2, 18);
			assert.strictEqual(result, '  <!-- <span>yes</span> -->');
		});
	});
});
