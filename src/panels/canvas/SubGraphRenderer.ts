import { ViewModel } from '../../app/viewModel';
import { getCondition, getEvent } from '../../core/editOps';
import { ActionGraphNodeUnion } from '../../core/types';
import { escapeHtml } from '../../utils/dom';
import { WireInteraction } from './WireInteraction';

export interface SubGraphRenderDeps {
  nodesContainer: HTMLElement;
  wire: WireInteraction;
  attachSubNodeInteraction: (
    el: HTMLElement,
    node: ActionGraphNodeUnion,
    eventId: string
  ) => void;
}

export function buildSubGraphDOM(
  vm: ViewModel,
  eventId: string,
  deps: SubGraphRenderDeps
): void {
  const { nodesContainer, wire, attachSubNodeInteraction } = deps;
  nodesContainer.innerHTML = '';
  const ev = getEvent(vm.doc, eventId);
  if (!ev || !ev.actionGraph) return;

  ev.actionGraph.nodes.forEach((node) => {
    const el = document.createElement('div');
    el.id = `subnode-${node.id}`;
    el.dataset.id = node.id;
    el.dataset.kind = 'subnode';
    el.style.left = `${node.x}px`;
    el.style.top = `${node.y}px`;

    switch (node.type) {
      case 'start': {
        el.className = 'graph-node sub-node start-node';
        el.innerHTML = `
          <div class="sub-node-header">
            <span>▶ Start</span>
          </div>
          <div class="node-port port-out" data-nid="${node.id}" title="【按住拖拽连线】鼠标按住拖至下一节点 In 端点建立连线"></div>
        `;
        const portOut = el.querySelector('.port-out') as HTMLElement | null;
        portOut?.addEventListener('pointerdown', (e) => {
          wire.handlePortPointerDown(e, portOut, {
            mode: 'subgraph',
            sourceId: node.id
          });
        });
        portOut?.addEventListener('click', (e) => e.stopPropagation());
        break;
      }

      case 'action': {
        el.className = 'graph-node sub-node action-node';
        const stepsHtml = node.steps
          .map((s) => {
            if (s.type === 'say')
              return `<div class="step-preview-item" title="${escapeHtml(s.text)}">💬 ${escapeHtml(
                s.speaker
              )}: ${escapeHtml(s.text.slice(0, 16))}</div>`;
            if (s.type === 'set')
              return `<div class="step-preview-item">📝 ${escapeHtml(s.var)} = ${escapeHtml(
                String(s.value ?? s.from)
              )}</div>`;
            if (s.type === 'add')
              return `<div class="step-preview-item">➕ ${escapeHtml(s.var)} ${
                s.amount >= 0 ? '+' : ''
              }${s.amount}</div>`;
            return '';
          })
          .join('');

        el.innerHTML = `
          <div class="node-port port-in" data-nid="${node.id}" title="【输入端点】按住可拔出既有连线改接，亦可吸附新连线"></div>
          <div class="sub-node-header">
            <span>${escapeHtml(node.title || '🎬 Action')}</span>
            <div class="node-port port-out" data-nid="${node.id}" title="【输出端点】按住拖出连线"></div>
          </div>
          <div class="action-steps-preview">
            ${stepsHtml || '<div class="step-preview-item" style="color:#64748b;">(暂无执行步骤)</div>'}
          </div>
        `;
        const portIn = el.querySelector('.port-in') as HTMLElement | null;
        portIn?.addEventListener('pointerdown', (e) => {
          wire.handlePortInPointerDown(e, portIn, {
            mode: 'subgraph',
            targetId: node.id
          });
        });
        portIn?.addEventListener('click', (e) => {
          e.stopPropagation();
          if (wire.activeWire && wire.activeWire.mode === 'subgraph') {
            wire.completeWireConnection(node.id);
            wire.cancelActiveWire();
          } else if (wire.subConnectingSource) {
            wire.completeSubConnecting(node.id);
          }
        });
        const portOut = el.querySelector('.port-out') as HTMLElement | null;
        portOut?.addEventListener('pointerdown', (e) => {
          wire.handlePortPointerDown(e, portOut, {
            mode: 'subgraph',
            sourceId: node.id
          });
        });
        portOut?.addEventListener('click', (e) => e.stopPropagation());
        break;
      }

      case 'selector': {
        el.className = 'graph-node sub-node selector-node';
        const casesHtml = node.cases
          .map((c) => {
            const checkDesc =
              c.checks
                .map((chk) => {
                  const cid = chk.conditionId;
                  const t = getCondition(vm.doc, cid);
                  const title = t ? t.title.replace(/^🔍 condition: /, '') : cid;
                  const opVal =
                    chk.op && chk.value !== undefined ? ` ${chk.op} ${chk.value}` : '';
                  return `${title}${opVal}`;
                })
                .join(' & ') || '无前置条件';

            return `
            <div class="sub-node-row">
              <div style="min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                <span style="font-weight:600; color:#e2e8f0;">${escapeHtml(c.title)}</span>
                <span style="color:#94a3b8; font-size:10px; margin-left:4px; font-family:monospace;">[${escapeHtml(
                  checkDesc
                )}]</span>
              </div>
              <div class="node-port port-out" data-nid="${node.id}" data-caseid="${
              c.id
            }" title="分支 [${escapeHtml(c.title)}] 输出端点 (按住拖拽连线)"></div>
            </div>
          `;
          })
          .join('');

        el.innerHTML = `
          <div class="node-port port-in" data-nid="${node.id}" title="【输入端点】按住可拔出既有连线改接，亦可吸附新连线"></div>
          <div class="sub-node-header">
            <span>${escapeHtml(node.title || '🔀 Selector')}</span>
          </div>
          <div class="sub-node-rows">
            ${casesHtml}
            <div class="sub-node-row default-row">
              <span>Default (保底默认)</span>
              <div class="node-port port-out" data-nid="${node.id}" data-default="true" title="Default 保底输出端点 (按住拖拽连线)"></div>
            </div>
          </div>
        `;
        const portIn = el.querySelector('.port-in') as HTMLElement | null;
        portIn?.addEventListener('pointerdown', (e) => {
          wire.handlePortInPointerDown(e, portIn, {
            mode: 'subgraph',
            targetId: node.id
          });
        });
        portIn?.addEventListener('click', (e) => {
          e.stopPropagation();
          if (wire.activeWire && wire.activeWire.mode === 'subgraph') {
            wire.completeWireConnection(node.id);
            wire.cancelActiveWire();
          } else if (wire.subConnectingSource) {
            wire.completeSubConnecting(node.id);
          }
        });
        el.querySelectorAll('.port-out').forEach((p) => {
          const portEl = p as HTMLElement;
          portEl.addEventListener('pointerdown', (e) => {
            const caseId = portEl.dataset.caseid;
            const isDefault = portEl.dataset.default === 'true';
            wire.handlePortPointerDown(e, portEl, {
              mode: 'subgraph',
              sourceId: node.id,
              caseId,
              isDefault
            });
          });
          portEl.addEventListener('click', (e) => e.stopPropagation());
        });
        break;
      }

      case 'choice': {
        el.className = 'graph-node sub-node choice-node';
        const optionsHtml = node.options
          .map((o, oIdx) => {
            const checkDesc =
              o.checks && o.checks.length > 0
                ? o.checks
                    .map((chk) => {
                      const cid = chk.conditionId;
                      const t = getCondition(vm.doc, cid);
                      const title = t ? t.title.replace(/^🔍 condition: /, '') : cid;
                      const opVal =
                        chk.op && chk.value !== undefined ? ` ${chk.op} ${chk.value}` : '';
                      return `${title}${opVal}`;
                    })
                    .join(' & ')
                : '';

            return `
            <div class="sub-node-row">
              <div style="display:flex; align-items:center; gap:4px; min-width:0; overflow:hidden;">
                <span style="color:#fbbf24; font-weight:700; font-size:10px;">[${oIdx}]</span>
                <span style="font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(
                  o.text
                )}</span>
                ${
                  checkDesc
                    ? `<span style="font-size:9px; color:#f87171; background:rgba(248,113,113,0.15); padding:1px 4px; border-radius:3px;">需:${escapeHtml(
                        checkDesc
                      )}</span>`
                    : ''
                }
              </div>
              <div class="node-port port-out" data-nid="${node.id}" data-optid="${
              o.id
            }" title="选项 [${escapeHtml(o.text)}] 输出端点 (按住拖拽连线)"></div>
            </div>
          `;
          })
          .join('');

        el.innerHTML = `
          <div class="node-port port-in" data-nid="${node.id}" title="【输入端点】按住可拔出既有连线改接，亦可吸附新连线"></div>
          <div class="sub-node-header">
            <span>💬 ${escapeHtml(node.speaker || 'NPC')}: ${escapeHtml(
          node.title || 'Choice'
        )}</span>
          </div>
          <div class="choice-speech-quote">“${escapeHtml(node.text.slice(0, 36))}${
          node.text.length > 36 ? '...' : ''
        }”</div>
          <div class="sub-node-rows">
            ${optionsHtml}
          </div>
        `;
        const portIn = el.querySelector('.port-in') as HTMLElement | null;
        portIn?.addEventListener('pointerdown', (e) => {
          wire.handlePortInPointerDown(e, portIn, {
            mode: 'subgraph',
            targetId: node.id
          });
        });
        portIn?.addEventListener('click', (e) => {
          e.stopPropagation();
          if (wire.activeWire && wire.activeWire.mode === 'subgraph') {
            wire.completeWireConnection(node.id);
            wire.cancelActiveWire();
          } else if (wire.subConnectingSource) {
            wire.completeSubConnecting(node.id);
          }
        });
        el.querySelectorAll('.port-out').forEach((p) => {
          const portEl = p as HTMLElement;
          portEl.addEventListener('pointerdown', (e) => {
            const optId = portEl.dataset.optid;
            wire.handlePortPointerDown(e, portEl, {
              mode: 'subgraph',
              sourceId: node.id,
              optId
            });
          });
          portEl.addEventListener('click', (e) => e.stopPropagation());
        });
        break;
      }
    }

    attachSubNodeInteraction(el, node, eventId);
    nodesContainer.appendChild(el);
  });
}
