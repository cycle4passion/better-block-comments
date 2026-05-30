import * as assert from 'assert';
import { detectLangId } from '../../toggleBlockComment';

// Minimal mock — detectLangId only reads languageId and lineAt(n).text.
function doc(lines: string[], langId: string): any {
	return {
		languageId: langId,
		lineAt: (i: number) => ({ text: lines[i] }),
	};
}

suite('detectLangId — unit', () => {
	// -------------------------------------------------------------------------
	// Non-mixed: pass through unchanged
	// -------------------------------------------------------------------------
	suite('non-mixed languages', () => {
		test('javascript', () => assert.strictEqual(detectLangId(doc(['const x = 1;'], 'javascript'), 0), 'javascript'));
		test('python', () => assert.strictEqual(detectLangId(doc(['x = 1'], 'python'), 0), 'python'));
		test('css', () => assert.strictEqual(detectLangId(doc(['.foo { }'], 'css'), 0), 'css'));
		test('ruby', () => assert.strictEqual(detectLangId(doc(['puts "hi"'], 'ruby'), 0), 'ruby'));
	});

	// -------------------------------------------------------------------------
	// Svelte
	// -------------------------------------------------------------------------
	suite('svelte', () => {
		const lines = [
			'<script>',           // 0
			'  const x = 1;',    // 1
			'</script>',          // 2
			'<style>',            // 3
			'  .foo { }',         // 4
			'</style>',           // 5
			'<div>',              // 6
			'  hello world',      // 7
			'</div>',             // 8
		];
		const d = () => doc(lines, 'svelte');

		test('cursor in <script> body → javascript', () => assert.strictEqual(detectLangId(d(), 1), 'javascript'));
		test('cursor on <script> line → javascript', () => assert.strictEqual(detectLangId(d(), 0), 'javascript'));
		test('cursor on </script> line → svelte', () => assert.strictEqual(detectLangId(d(), 2), 'svelte'));
		test('cursor in <style> body → css', () => assert.strictEqual(detectLangId(d(), 4), 'css'));
		test('cursor on <style> line → css', () => assert.strictEqual(detectLangId(d(), 3), 'css'));
		test('cursor on </style> line → svelte', () => assert.strictEqual(detectLangId(d(), 5), 'svelte'));
		test('cursor in template (after </style>) → svelte', () => assert.strictEqual(detectLangId(d(), 7), 'svelte'));
	});

	suite('svelte — style before script', () => {
		const lines = [
			'<style>',           // 0
			'  .bar { }',        // 1
			'</style>',          // 2
			'<script>',          // 3
			'  const y = 2;',   // 4
			'</script>',         // 5
			'<p>hello</p>',      // 6
		];
		const d = () => doc(lines, 'svelte');

		test('cursor in <script> when <style> appears before it → javascript', () => {
			assert.strictEqual(detectLangId(d(), 4), 'javascript');
		});
		test('cursor in template after </script> → svelte', () => {
			assert.strictEqual(detectLangId(d(), 6), 'svelte');
		});
	});

	// -------------------------------------------------------------------------
	// Vue (same scan, different language attributes like setup/scoped)
	// -------------------------------------------------------------------------
	suite('vue', () => {
		const lines = [
			'<script setup>',     // 0
			'  const x = 1;',    // 1
			'</script>',          // 2
			'<style scoped>',     // 3
			'  .v { }',           // 4
			'</style>',           // 5
			'<template>',         // 6
			'  <p>hello</p>',    // 7
			'</template>',        // 8
		];
		const d = () => doc(lines, 'vue');

		test('<script setup> body → javascript', () => assert.strictEqual(detectLangId(d(), 1), 'javascript'));
		test('<style scoped> body → css', () => assert.strictEqual(detectLangId(d(), 4), 'css'));
		test('template body → vue', () => assert.strictEqual(detectLangId(d(), 7), 'vue'));
	});

	// -------------------------------------------------------------------------
	// Astro (frontmatter between --- delimiters)
	// -------------------------------------------------------------------------
	suite('astro', () => {
		const lines = [
			'---',                        // 0
			"const greeting = 'hello';",  // 1
			'---',                        // 2
			'<div>',                      // 3
			'  <p>astro</p>',            // 4
			'</div>',                     // 5
		];
		const d = () => doc(lines, 'astro');

		test('cursor in frontmatter → javascript', () => assert.strictEqual(detectLangId(d(), 1), 'javascript'));
		// cursor on the opening --- counts as inside frontmatter (one delimiter at/before cursor)
		test('cursor on opening --- → javascript', () => assert.strictEqual(detectLangId(d(), 0), 'javascript'));
		// cursor on closing --- sees two delimiters → falls through to tag scan → astro
		test('cursor on closing --- → astro', () => assert.strictEqual(detectLangId(d(), 2), 'astro'));
		test('cursor in template → astro', () => assert.strictEqual(detectLangId(d(), 4), 'astro'));
	});

	suite('astro — <script> inside template', () => {
		const lines = [
			'---',             // 0
			'const x = 1;',   // 1
			'---',             // 2
			'<script>',        // 3
			'  var y = 2;',   // 4
			'</script>',       // 5
			'<p>page</p>',    // 6
		];
		const d = () => doc(lines, 'astro');

		test('<script> inside astro template → javascript', () => assert.strictEqual(detectLangId(d(), 4), 'javascript'));
		test('template after </script> → astro', () => assert.strictEqual(detectLangId(d(), 6), 'astro'));
	});

	suite('astro — no frontmatter', () => {
		const lines = ['<div>', '  <p>hello</p>', '</div>'];
		test('template with no --- delimiters → astro', () => {
			assert.strictEqual(detectLangId(doc(lines, 'astro'), 1), 'astro');
		});
	});

	// -------------------------------------------------------------------------
	// HTML
	// -------------------------------------------------------------------------
	suite('html', () => {
		const lines = [
			'<html>',                    // 0
			'<head>',                    // 1
			'<script>',                  // 2
			'  var n = 42;',            // 3
			'</script>',                 // 4
			'<style>',                   // 5
			'  body { margin: 0; }',    // 6
			'</style>',                  // 7
			'</head>',                   // 8
			'<body>',                    // 9
			'  <p>content</p>',         // 10
			'</body>',                   // 11
			'</html>',                   // 12
		];
		const d = () => doc(lines, 'html');

		test('cursor in <script> → javascript', () => assert.strictEqual(detectLangId(d(), 3), 'javascript'));
		test('cursor in <style> → css', () => assert.strictEqual(detectLangId(d(), 6), 'css'));
		test('cursor in <body> (after </style>) → html', () => assert.strictEqual(detectLangId(d(), 10), 'html'));
		test('cursor in <head> before any script/style → html', () => assert.strictEqual(detectLangId(d(), 1), 'html'));
	});

	// -------------------------------------------------------------------------
	// PHP (PHP body and HTML section both return 'php'; only <script>/<style> differ)
	// -------------------------------------------------------------------------
	suite('php', () => {
		const lines = [
			'<?php',            // 0
			'  $x = 1;',       // 1
			'?>',               // 2
			'<div>',            // 3
			'  <p>php</p>',    // 4
			'</div>',           // 5
			'<script>',         // 6
			'  var z = 3;',    // 7
			'</script>',        // 8
			'<style>',          // 9
			'  .cls { }',      // 10
			'</style>',         // 11
		];
		const d = () => doc(lines, 'php');

		test('cursor in PHP code body → php', () => assert.strictEqual(detectLangId(d(), 1), 'php'));
		// HTML section has no script/style opener above it — treated as php (known limitation)
		test('cursor in HTML section of PHP → php', () => assert.strictEqual(detectLangId(d(), 4), 'php'));
		test('cursor in <script> inside PHP → javascript', () => assert.strictEqual(detectLangId(d(), 7), 'javascript'));
		test('cursor in <style> inside PHP → css', () => assert.strictEqual(detectLangId(d(), 10), 'css'));
	});

	// -------------------------------------------------------------------------
	// Case insensitivity
	// -------------------------------------------------------------------------
	suite('case insensitivity', () => {
		test('<SCRIPT> tag matches', () => {
			const d = doc(['<SCRIPT>', '  var x;', '</SCRIPT>', '<p>html</p>'], 'html');
			assert.strictEqual(detectLangId(d, 1), 'javascript');
		});

		test('</SCRIPT> closing tag triggers base return', () => {
			const d = doc(['<SCRIPT>', '  var x;', '</SCRIPT>', '<p>html</p>'], 'html');
			assert.strictEqual(detectLangId(d, 3), 'html');
		});

		test('<Style> tag matches', () => {
			const d = doc(['<Style>', '  .x {}', '</Style>', '<p>html</p>'], 'html');
			assert.strictEqual(detectLangId(d, 1), 'css');
		});
	});

	// -------------------------------------------------------------------------
	// Leading whitespace (trimStart)
	// -------------------------------------------------------------------------
	suite('indented tags', () => {
		test('indented <script> tag is still detected', () => {
			const d = doc(['  <script>', '  var x;', '  </script>', '<p>hello</p>'], 'html');
			assert.strictEqual(detectLangId(d, 1), 'javascript');
		});

		test('indented </script> still triggers template return', () => {
			const d = doc(['  <script>', '  var x;', '  </script>', '<p>hello</p>'], 'html');
			assert.strictEqual(detectLangId(d, 3), 'html');
		});
	});

	// -------------------------------------------------------------------------
	// HTML template languages (EJS / Nunjucks / Twig / Blade)
	// Tag scan still runs for <script>/<style>; fallback is 'html', not the template lang.
	// -------------------------------------------------------------------------
	suite('HTML template languages — fallback to html', () => {
		for (const langId of ['ejs', 'nunjucks', 'jinja', 'twig', 'blade']) {
			suite(langId, () => {
				const lines = [
					'<script>',
					'  var x = 1;',
					'</script>',
					'<style>',
					'  body { }',
					'</style>',
					'<div>',
					'  <% content %>',
					'</div>',
				];
				const d = () => doc(lines, langId);

				test('cursor in <script> → javascript', () => {
					assert.strictEqual(detectLangId(d(), 1), 'javascript');
				});

				test('cursor in <style> → css', () => {
					assert.strictEqual(detectLangId(d(), 4), 'css');
				});

				test('cursor in template body → html (not ' + langId + ')', () => {
					assert.strictEqual(detectLangId(d(), 7), 'html');
				});

				test('cursor after </style> → html (not ' + langId + ')', () => {
					assert.strictEqual(detectLangId(d(), 6), 'html');
				});
			});
		}
	});

	// -------------------------------------------------------------------------
	// Razor — brace-depth counting for @{ } C# blocks
	// -------------------------------------------------------------------------
	suite('razor', () => {
		for (const langId of ['razor', 'aspnetcorerazor']) {
			suite(langId, () => {
				test('cursor inside @{ } block → csharp', () => {
					const lines = ['@{', '  var x = 1;', '}'];
					// cursorChar=2 (inside the block — past the indentation)
					assert.strictEqual(detectLangId(doc(lines, langId), 1, 2), 'csharp');
				});

				test('cursor in HTML after @{ } block → html', () => {
					const lines = ['@{', '  var x = 1;', '}', '<p>hello</p>'];
					assert.strictEqual(detectLangId(doc(lines, langId), 3, 0), 'html');
				});

				test('cursor on HTML line inside @if { } (control flow) → html', () => {
					// @if is NOT @{ — the brace is on a separate or combined line but the
					// line opener is @if, not bare @{, so it does not trigger csharp.
					const lines = ['@if (condition)', '{', '  <p>text</p>', '}'];
					assert.strictEqual(detectLangId(doc(lines, langId), 2, 2), 'html');
				});

				test('cursor on @if (cond) { line with combined brace → html', () => {
					// @if (cond) { — line does not match /^\s*@\s*\{/
					const lines = ['@if (condition) {', '  <p>text</p>', '}'];
					assert.strictEqual(detectLangId(doc(lines, langId), 1, 2), 'html');
				});

				test('cursor just after @{ opening on same line → csharp', () => {
					// '@{' line — cursor at char 2 (just after {), scan chars 0..1
					const lines = ['@{', '  var x = 1;', '}'];
					assert.strictEqual(detectLangId(doc(lines, langId), 0, 2), 'csharp');
				});

				test('cursor inside inline @{ var x = 1; } → csharp', () => {
					// '@{ var x = 1; }' — cursor at char 7 (inside braces)
					const lines = ['@{ var x = 1; }'];
					assert.strictEqual(detectLangId(doc(lines, langId), 0, 7), 'csharp');
				});

				test('cursor on HTML line after inline @{ } on previous line → html', () => {
					const lines = ['@{ var x = 1; }', '<p>hello</p>'];
					assert.strictEqual(detectLangId(doc(lines, langId), 1, 0), 'html');
				});

				test('@{ } with nested object braces — cursor still reads as csharp', () => {
					const lines = [
						'@{',
						'  var d = new Dictionary<string, int> {',
						'    { "a", 1 },',
						'  };',
						'  var y = 2;',
						'}',
					];
					assert.strictEqual(detectLangId(doc(lines, langId), 4, 2), 'csharp');
				});

				test('no @{ block anywhere → html', () => {
					const lines = ['<html>', '<body>', '  <p>hello</p>', '</body>', '</html>'];
					assert.strictEqual(detectLangId(doc(lines, langId), 2, 2), 'html');
				});
			});
		}
	});
});
