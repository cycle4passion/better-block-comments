// Minimal vscode stub for unit tests running outside a VS Code host.
// Add members here only as tests require them.

export class Position {
  constructor(public line: number, public character: number) {}
  translate(_lineDelta: number, characterDelta: number) {
    return new Position(this.line, this.character + characterDelta);
  }
}

export class Selection {
  anchor: Position;
  active: Position;
  line: number;
  character: number;
  constructor(anchor: Position, active: Position) {
    this.anchor = anchor;
    this.active = active;
    this.line = active.line;
    this.character = active.character;
  }
  get isEmpty() {
    return this.anchor.line === this.active.line && this.anchor.character === this.active.character;
  }
  get start(): Position {
    const aBeforeB = this.anchor.line < this.active.line ||
      (this.anchor.line === this.active.line && this.anchor.character <= this.active.character);
    return aBeforeB ? this.anchor : this.active;
  }
  get end(): Position {
    const aBeforeB = this.anchor.line < this.active.line ||
      (this.anchor.line === this.active.line && this.anchor.character <= this.active.character);
    return aBeforeB ? this.active : this.anchor;
  }
}

export class Range {
  constructor(public start: Position | number, public end: Position | number) {}
}

export const extensions = { all: [] as any[] };

export const workspace = {
  getConfiguration: () => ({ get: (_key: string, def: unknown) => def }),
};
