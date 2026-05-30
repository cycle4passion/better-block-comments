import * as vscode from 'vscode';
import { toggleBlockComment } from './toggleBlockComment';

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerTextEditorCommand(
    'better-block-comments.toggleBlockComment',
    toggleBlockComment
  );
  context.subscriptions.push(disposable);
}

export function deactivate() {}
