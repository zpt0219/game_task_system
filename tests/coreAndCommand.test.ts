import { describe, expect, it } from 'vitest';
import { ViewModel } from '../src/app/viewModel';
import { createDefaultDocument } from '../src/core/document';
import { ChoiceGraphNode, SelectorGraphNode } from '../src/core/types';

describe('Core EditOps, Cascade Cleanup, Gesture Undo, and Layout', () => {
  it('cleans up selector/choice condition checks and subnode edges on batch delete (Bug #2 fix)', () => {
    const vm = new ViewModel();
    vm.loadProjectData(createDefaultDocument());

    const cond = vm.edit.addCondition(100, 100)!;
    const ev = vm.edit.addEvent(300, 100, cond.id)!;

    const selNode = vm.edit.addSubNode(ev.id, 'selector', 200, 100) as SelectorGraphNode;
    const choiceNode = vm.edit.addSubNode(ev.id, 'choice', 400, 100) as ChoiceGraphNode;
    const targetActNode = vm.edit.addSubNode(ev.id, 'action', 600, 100)!;

    // Wire selector -> choice -> targetActNode, and reference cond in choice
    vm.edit.mutateDocument('SetupChecksAndLinks', (d) => {
      const e = d.events.find((x) => x.id === ev.id)!;
      const s = e.actionGraph.nodes.find((n) => n.id === selNode.id) as SelectorGraphNode;
      const c = e.actionGraph.nodes.find((n) => n.id === choiceNode.id) as ChoiceGraphNode;
      s.cases[0].checks = [{ conditionId: cond.id }];
      s.cases[0].targetId = targetActNode.id;
      s.defaultTargetId = targetActNode.id;
      c.options[0].checks = [{ conditionId: cond.id }];
      c.options[0].targetId = targetActNode.id;
    });

    // Batch delete both cond and targetActNode
    const deleted = vm.edit.deleteItems([
      { kind: 'condition', id: cond.id },
      { kind: 'subnode', id: targetActNode.id, eventId: ev.id }
    ]);
    expect(deleted).toBe(2);

    const updatedEv = vm.doc.events.find((x) => x.id === ev.id)!;
    expect(updatedEv.incomingConditions).toEqual([]);

    const updatedSel = updatedEv.actionGraph.nodes.find(
      (n) => n.id === selNode.id
    ) as SelectorGraphNode;
    const updatedChoice = updatedEv.actionGraph.nodes.find(
      (n) => n.id === choiceNode.id
    ) as ChoiceGraphNode;

    // Dangling condition checks must be cleaned up
    expect(updatedSel.cases[0].checks).toEqual([]);
    expect(updatedChoice.options[0].checks).toEqual([]);

    // Dangling targetId pointers must be cleaned up
    expect(updatedSel.cases[0].targetId).toBeUndefined();
    expect(updatedSel.defaultTargetId).toBeUndefined();
    expect(updatedChoice.options[0].targetId).toBeUndefined();

    // Undo restores everything cleanly in a single step
    vm.undo();
    const restoredEv = vm.doc.events.find((x) => x.id === ev.id)!;
    expect(restoredEv.incomingConditions).toEqual([cond.id]);
    const restoredSel = restoredEv.actionGraph.nodes.find(
      (n) => n.id === selNode.id
    ) as SelectorGraphNode;
    expect(restoredSel.cases[0].checks).toHaveLength(1);
    expect(restoredSel.cases[0].targetId).toBe(targetActNode.id);
  });

  it('commits an entire multi-step node drag gesture as a single Undo entry (Bug #3 fix)', () => {
    const vm = new ViewModel();
    vm.loadProjectData(createDefaultDocument());
    const ev = vm.edit.addEvent(100, 100)!;

    vm.edit.beginNodeMove();
    vm.edit.moveNodesTo([{ kind: 'event', id: ev.id, x: 150, y: 120 }]);
    vm.edit.moveNodesTo([{ kind: 'event', id: ev.id, x: 220, y: 180 }]);
    vm.edit.moveNodesTo([{ kind: 'event', id: ev.id, x: 300, y: 240 }]);
    const committed = vm.edit.endNodeMove();

    expect(committed).toBe(true);
    expect(vm.doc.events[0].x).toBe(300);
    expect(vm.doc.events[0].y).toBe(240);

    // Single undo returns directly to (100, 100)
    vm.undo();
    expect(vm.doc.events[0].x).toBe(100);
    expect(vm.doc.events[0].y).toBe(100);
  });

  it('computes DAG layout for subgraph nodes even with cyclic back-edges', () => {
    const vm = new ViewModel();
    vm.loadProjectData(createDefaultDocument());
    const ev = vm.edit.addEvent(100, 100)!;
    const choice = vm.edit.addSubNode(ev.id, 'choice', 50, 50) as ChoiceGraphNode;
    const act = vm.edit.addSubNode(ev.id, 'action', 50, 50)!;

    // Create a loop: start -> choice -> act -> choice
    const start = ev.actionGraph.nodes.find((n) => n.type === 'start')!;
    vm.edit.connectSubGraph(ev.id, { nodeId: start.id }, choice.id);
    vm.edit.connectSubGraph(ev.id, { nodeId: choice.id, optId: choice.options[0].id }, act.id);
    vm.edit.connectSubGraph(ev.id, { nodeId: act.id }, choice.id);

    const ok = vm.edit.resetSubGraphLayout(ev.id);
    expect(ok).toBe(true);

    const afterStart = vm.doc.events[0].actionGraph.nodes.find((n) => n.id === start.id)!;
    const afterChoice = vm.doc.events[0].actionGraph.nodes.find((n) => n.id === choice.id)!;
    const afterAct = vm.doc.events[0].actionGraph.nodes.find((n) => n.id === act.id)!;

    expect(afterStart.x).toBeLessThan(afterChoice.x);
    expect(afterChoice.x).toBeLessThan(afterAct.x);
  });

  it('preserves EditorContext logs across worldState mutations and mode switches (Bug #1 fix)', () => {
    const vm = new ViewModel();
    vm.loadProjectData(createDefaultDocument());
    vm.edit.addVar({
      key: 'hero.gold',
      label: '金币',
      category: 'stat',
      kind: 'number',
      icon: '💰',
      initial: 50
    });

    vm.log('初始日志 1', true);
    vm.mutateWorldState((s) => {
      s['hero.gold'] = 150;
    });
    vm.setMode('edit');
    vm.setMode('play');
    vm.log('状态变更后日志 2');

    expect(vm.context.logs).toHaveLength(4); // 含两次模式切换日志
    expect(vm.context.logs[0].message).toBe('初始日志 1');
    expect(vm.context.logs[3].message).toBe('状态变更后日志 2');
  });

  it('uses StudioPrompts.confirm for referenced variable deletion and cascades cleanup (Bug #4 fix)', async () => {
    const confirmCalls: string[] = [];
    const vm = new ViewModel({
      prompts: {
        confirm: async (msg) => {
          confirmCalls.push(msg);
          return true;
        }
      }
    });
    vm.loadProjectData(createDefaultDocument());

    vm.edit.addVar({
      key: 'items.key',
      label: '地牢钥匙',
      category: 'item',
      kind: 'bool',
      icon: '🔑',
      initial: false
    });
    // addCondition automatically creates a first condition referencing items.key
    const cond = vm.edit.addCondition(100, 100)!;
    expect(vm.getCondition(cond.id)?.conds).toHaveLength(1);
    expect(vm.getCondition(cond.id)?.conds[0].var).toBe('items.key');

    const deleted = await vm.edit.deleteVar('items.key');
    expect(deleted).toBe(true);
    expect(confirmCalls).toHaveLength(1);
    expect(vm.getVar('items.key')).toBeUndefined();
    expect(vm.getCondition(cond.id)?.conds).toHaveLength(0);

    // Undo restores both the variable and its reference in the condition
    vm.undo();
    expect(vm.getVar('items.key')).toBeDefined();
    expect(vm.getCondition(cond.id)?.conds).toHaveLength(1);
  });
});
