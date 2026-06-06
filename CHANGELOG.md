# Changelog

## [1.0.1]

- **Universal Comment for languages without line comments**: in any language or embedded section that has no line comment token (e.g. HTML markup, CSS), a collapsed cursor on a non-empty line now wraps the full line content with the language's block comment tokens (`<!-- content -->`, `/* content */`, etc.) instead of inserting an empty comment. Re-triggering on an already-commented line removes the tokens. Empty lines still insert an empty block comment as before.

## [1.0.0]

- `better-block-comments.toggleBlockComment` command (`cmd+alt+/` / `ctrl+alt+/`)
- Block comment toggle with section-sign augmentation (`§`) to safely handle nested delimiters
- True line comment toggle for languages without block comment syntax
- Multi-cursor support with single undo step
- **Universal Comment** (`betterBlockComments.universalComment.enabled`, default `true`): collapsed-cursor toggle now inserts the language's line comment token at the indentation point instead of an empty block comment, working across all languages
- **Inline End Comment** (`betterBlockComments.universalComment.inlineEnd`, default `true`): when the cursor is at or past the end of line content, toggles a trailing `⎵TOKEN⎵` annotation on the same line
- **Inside-comment detection for selections**: selecting text that sits *inside* a block comment (tokens just outside the selection) now correctly expands and removes the surrounding comment, mirroring VS Code's built-in behaviour
- Selection preservation after comment operations — anchor/active positions are recomputed after add and remove so the selection tracks the original content
- `detectInsideBlockComment` utility in `blockCommentUtils.ts` (pure, exported, fully unit-tested)
- `vscode-mock.ts` + `setup.ts` unit-test harness so the mocha `test:unit` suite runs outside a VS Code host
- 112 unit tests (up from ~25): covers `detectInsideBlockComment`, `computePostAddSelection`, `computePostRemoveInsideSelection`, and the universal/inline-end e2e paths
  