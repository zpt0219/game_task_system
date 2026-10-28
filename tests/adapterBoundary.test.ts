/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from 'vitest';
import ts from 'typescript';
import { ViewModel } from '../src/app/viewModel';
import { createDefaultDocument } from '../src/core/document';

const sources = import.meta.glob<string>('../src/**/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true
});

function resolveImport(from: string, target: string): string | undefined {
  if (!target.startsWith('.')) return;
  const parts = from.split('/');
  parts.pop();
  for (const part of target.split('/')) {
    if (part === '..') parts.pop();
    else if (part !== '.') parts.push(part);
  }
  const base = parts.join('/');
  const path = [base, `${base}.ts`, `${base}/index.ts`].find((key) => key in sources);
  if (!path) throw new Error(`Unresolved local dependency: ${from} -> ${target}`);
  return path;
}

function inspectGraph(entries: string[]): string[] {
  const visited = new Set<string>();
  function inspect(file: string) {
    if (visited.has(file)) return;
    visited.add(file);
    expect(file).not.toMatch(/\/app\/adapters\/|\/panels\/|\/app\/app\.ts$/);
    const ast = ts.createSourceFile(file, sources[file], ts.ScriptTarget.Latest, true);
    function walk(node: ts.Node) {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const dependency = resolveImport(file, node.moduleSpecifier.text);
        if (dependency) inspect(dependency);
      }
      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        const dependency = resolveImport(file, node.arguments[0].text);
        if (dependency) inspect(dependency);
      }
      if (
        ts.isIdentifier(node) &&
        ['window', 'localStorage', 'fetch', 'HTMLElement', 'SVGElement', 'SVGPathElement'].includes(
          node.text
        )
      ) {
        throw new Error(`Browser dependency ${node.text} in ${file}`);
      }
      if (
        ts.isPropertyAccessExpression(node) &&
        ts.isIdentifier(node.expression) &&
        ['document', 'globalThis'].includes(node.expression.text)
      ) {
        throw new Error(`Global environment access ${node.getText(ast)} in ${file}`);
      }
      if (
        file.startsWith('../src/core/') &&
        ts.isPropertyAccessExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'console'
      ) {
        throw new Error(`Logging side effect in pure core: ${file}`);
      }
      ts.forEachChild(node, walk);
    }
    walk(ast);
  }
  for (const entry of entries) inspect(entry);
  return [...visited];
}

describe('Zero-DOM Dependency Boundary & Headless ViewModel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('keeps core/, command/, viewModel.ts, ports.ts, and AutosaveService.ts free of browser globals', () => {
    const entries = Object.keys(sources).filter((path) =>
      /\/src\/(core\/(types|document|session|editOps|graph|engine|layout|projectData)|command\/)/.test(
        path
      )
    );
    const graph = inspectGraph([
      ...entries,
      '../src/app/viewModel.ts',
      '../src/app/ports.ts',
      '../src/app/services/AutosaveService.ts'
    ]);
    expect(graph).toContain('../src/core/editOps.ts');
    expect(graph).toContain('../src/core/layout.ts');
    expect(graph).toContain('../src/command/commandHandler.ts');
  });

  it('constructs and edits headlessly without touching window, document, localStorage, or fetch', () => {
    const globals = ['window', 'document', 'localStorage', 'fetch'] as const;
    const descriptors = globals.map((key) => Object.getOwnPropertyDescriptor(globalThis, key));
    const access = vi.fn(() => {
      throw new Error('browser access forbidden');
    });
    globals.forEach((key) =>
      Object.defineProperty(globalThis, key, { configurable: true, get: access })
    );
    try {
      const vm = new ViewModel();
      vm.loadProjectData(createDefaultDocument());
      const ev = vm.edit.addEvent(100, 120);
      expect(ev).toBeDefined();
      expect(vm.doc.events).toHaveLength(1);
      expect(vm.canUndo).toBe(true);
      vm.undo();
      expect(vm.doc.events).toHaveLength(0);
      vm.dispose();
      expect(access).not.toHaveBeenCalled();
    } finally {
      globals.forEach((key, i) => {
        const descriptor = descriptors[i];
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      });
    }
  });
});
