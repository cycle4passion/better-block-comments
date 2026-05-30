// Register the vscode mock before any test files are loaded, so that
// `import * as vscode from 'vscode'` in production modules resolves to our stub.
import Module = require('module');
import path = require('path');

const mockPath = path.resolve(__dirname, 'vscode-mock');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const original = (Module as any)._load;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(Module as any)._load = function (request: string, ...rest: unknown[]) {
  if (request === 'vscode') {
    return require(mockPath);
  }
  return original.call(this, request, ...rest);
};
