import { ViewModel } from '../../app/viewModel';
import { getCondition } from '../../core/editOps';
import { getEventStatus } from '../../core/engine';
import { varsWrittenBy } from '../../core/graph';
import { EventDef } from '../../core/types';
import { escapeHtml } from '../../utils/dom';

function bindInput(parent: HTMLElement, selector: string, fn: (val: string) => void): void {
  const el = parent.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement | null;
  if (el) {
    el.oninput = () => fn(el.value);
  }
}

export function renderEventInspector(
  container: HTMLElement,
  vm: ViewModel,
  ev: EventDef
): void {
  const doc = vm.doc;
  const state = vm.session.worldState;
  const evStatus = getEventStatus(doc, state, ev);

  // 0. Action Tree 内部图谱入口卡片
  const subNodeCount = ev.actionGraph?.nodes?.length || 0;
  const isInsideSubGraph = vm.session.subGraphEventId === ev.id;
  const treeCard = document.createElement('div');
  treeCard.className = 'inspector-section';
  treeCard.style.border = '1px solid #8b5cf6';
  treeCard.style.background =
    'linear-gradient(135deg, rgba(139, 92, 246, 0.12) 0%, rgba(30, 27, 75, 0.4) 100%)';
  treeCard.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
      <span style="font-size: 12px; font-weight: 700; color: #c084fc;">🕸️ Action Tree (内部有向流图)</span>
      <span class="status-pill status-blue" style="font-size: 10px;">${subNodeCount} 个节点</span>
    </div>
    <div style="font-size: 11px; color: #cbd5e1; margin-bottom: 10px; line-height: 1.5;">
      ${
        isInsideSubGraph
          ? '当前已处于该事件的 Action Tree 内部子图视图。'
          : '事件内部由 Start、Selector、Choice、Action 节点组成可视化流图，支持条件分流、玩家选项与循环回跳。'
      }
    </div>
    ${
      isInsideSubGraph
        ? `<button id="btnExitSubGraph" class="mini-btn" style="width: 100%; padding: 6px; background: #334155; color: #f8fafc; border: none; border-radius: 4px; cursor: pointer;">← 返回全局大图 (ESC)</button>`
        : `<button id="btnEnterSubGraph" class="dialog-btn" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 8px; background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%); color: #fff; font-weight: 700; border: none; border-radius: 6px; cursor: pointer;">
            <span>🕸️</span> 进入 Action Tree 内部图谱
          </button>`
    }
  `;
  container.appendChild(treeCard);

  treeCard.querySelector('#btnEnterSubGraph')?.addEventListener('click', () => {
    vm.setSubGraphEventId(ev.id);
    vm.log(`🕸️ 已进入「${ev.title}」内部 Action Tree 图谱`, true);
  });
  treeCard.querySelector('#btnExitSubGraph')?.addEventListener('click', () => {
    vm.setSubGraphEventId(null);
  });

  // 1. 基础信息卡片
  const metaCard = document.createElement('div');
  metaCard.className = 'inspector-section';
  metaCard.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span class="event-type-badge">EVENT 节点</span>
        <span class="event-status-pill ${evStatus.colorClass}" style="font-size: 11px;">${escapeHtml(
          evStatus.title
        )}</span>
      </div>
      <button id="btnDeleteEvent" class="btn-node-delete" title="删除此 Event 节点 (快捷键: Delete)">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
        <span>删除节点</span>
      </button>
    </div>

    <div class="inspector-label">节点标题 (Title)</div>
    <input type="text" id="evTitle" class="inspector-input" value="${escapeHtml(
      ev.title
    )}" style="width: 100%; margin-bottom: 8px; box-sizing: border-box;" />

    <div class="inspector-label">代码绑定标识 (sourceRef，对应 Godot 脚本)</div>
    <input type="text" id="evSourceRef" class="inspector-input" value="${escapeHtml(
      ev.sourceRef || ''
    )}" placeholder="例: king_conversation" style="width: 100%; margin-bottom: 8px; font-family: monospace; font-size: 11px; box-sizing: border-box;" />

    <div class="inspector-label">功能描述 (Desc)</div>
    <textarea id="evDesc" class="inspector-textarea" style="width: 100%; height: 56px; resize: vertical; box-sizing: border-box;">${escapeHtml(
      ev.desc || ''
    )}</textarea>
  `;
  container.appendChild(metaCard);

  bindInput(metaCard, '#evTitle', (v) => {
    vm.edit.mutateDocument(
      'EditEventTitle',
      (d) => {
        const target = d.events.find((e) => e.id === ev.id);
        if (target) target.title = v;
      },
      'field',
      `ev_title_${ev.id}`
    );
  });
  bindInput(metaCard, '#evSourceRef', (v) => {
    vm.edit.mutateDocument(
      'EditEventSourceRef',
      (d) => {
        const target = d.events.find((e) => e.id === ev.id);
        if (target) target.sourceRef = v;
      },
      'field',
      `ev_src_${ev.id}`
    );
  });
  bindInput(metaCard, '#evDesc', (v) => {
    vm.edit.mutateDocument(
      'EditEventDesc',
      (d) => {
        const target = d.events.find((e) => e.id === ev.id);
        if (target) target.desc = v;
      },
      'field',
      `ev_desc_${ev.id}`
    );
  });

  const btnDel = metaCard.querySelector('#btnDeleteEvent') as HTMLElement;
  btnDel.onclick = () => {
    vm.edit.deleteEvent(ev.id);
  };

  // 2. 依赖的前置条件 (Conditions) 管理（内嵌下拉选择器，告别原生 prompt）
  const incomingCondIds = ev.incomingConditions ?? [];
  const availableConds = doc.conditions.filter((t) => !incomingCondIds.includes(t.id));

  const trigCard = document.createElement('div');
  trigCard.className = 'inspector-section';
  trigCard.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
      <div class="inspector-label" style="margin-bottom: 0;">
        🔍 依赖的前置条件 (Conditions：${incomingCondIds.length})
      </div>
    </div>
    ${
      availableConds.length > 0
        ? `
      <div style="display: flex; gap: 6px; margin-bottom: 8px;">
        <select id="selectAddCond" class="inspector-select" style="flex: 1; font-size: 11px;">
          ${availableConds
            .map(
              (c) =>
                `<option value="${c.id}">🔍 ${escapeHtml(
                  c.title.replace(/^🔍 condition: /, '')
                )}</option>`
            )
            .join('')}
        </select>
        <button id="btnConnectTrig" class="mini-btn-action" style="padding: 3px 10px; font-size: 11px; white-space: nowrap;">
          + 关联 Condition
        </button>
      </div>
    `
        : ''
    }
    <div id="incomingTrigsContainer" style="display: flex; flex-wrap: wrap; gap: 6px;">
      ${
        incomingCondIds.length === 0
          ? '<div style="font-size: 11px; color: #64748b; padding: 2px 0;">💡 暂无依赖 Condition (此 Event 仅执行默认行为)</div>'
          : incomingCondIds
              .map((cid) => {
                const cond = getCondition(doc, cid);
                const title = cond ? cond.title.replace(/^🔍 condition: /, '') : cid;
                return `
            <span style="display: inline-flex; align-items: center; gap: 4px; font-size: 11px; background: #1e293b; border: 1px solid #38bdf8; color: #38bdf8; border-radius: 4px; padding: 2px 6px;">
              <span>🔍 ${escapeHtml(title)}</span>
              <button class="btn-disconnect-trig" data-tid="${cid}" style="background: none; border: none; color: #f87171; cursor: pointer; font-size: 13px; font-weight: bold; padding: 0 2px; line-height: 1;" title="断开依赖">×</button>
            </span>
          `;
              })
              .join('')
      }
    </div>
  `;
  container.appendChild(trigCard);

  trigCard.querySelector('#btnConnectTrig')?.addEventListener('click', () => {
    const selEl = trigCard.querySelector('#selectAddCond') as HTMLSelectElement | null;
    const chosenId = selEl?.value;
    if (chosenId) {
      vm.edit.connectCondition(ev.id, chosenId);
    }
  });

  trigCard.querySelectorAll('.btn-disconnect-trig').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cid = (btn as HTMLElement).dataset.tid;
      if (cid) {
        vm.edit.disconnectCondition(ev.id, cid);
      }
    });
  });

  // 3. Action Tree 内部节点概览
  const nodes = ev.actionGraph?.nodes || [];
  const overviewCard = document.createElement('div');
  overviewCard.className = 'inspector-section';
  overviewCard.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
      <div class="inspector-label" style="margin-bottom: 0; font-size: 12px; font-weight: 700;">
        Action Tree 节点 (${nodes.length} 个)
      </div>
    </div>
    <div style="display: flex; flex-direction: column; gap: 4px;">
      ${nodes
        .map((n) => {
          const icon =
            n.type === 'start'
              ? '▶'
              : n.type === 'action'
              ? '🎬'
              : n.type === 'selector'
              ? '🔀'
              : '💬';
          const title = 'title' in n ? n.title : 'Start 入口';
          return `
          <div class="subnode-overview-item" data-nid="${
            n.id
          }" style="display: flex; justify-content: space-between; align-items: center; background: #0f172a; border: 1px solid #334155; border-radius: 4px; padding: 5px 8px; cursor: pointer; font-size: 11px;">
            <span style="color: #f1f5f9; display: flex; align-items: center; gap: 6px;">
              <span>${icon}</span>
              <span style="font-weight: 600;">${escapeHtml(title)}</span>
            </span>
            <span style="color: #64748b; font-family: monospace; font-size: 10px;">${escapeHtml(
              n.id
            )}</span>
          </div>
        `;
        })
        .join('')}
    </div>
  `;
  container.appendChild(overviewCard);

  overviewCard.querySelectorAll('.subnode-overview-item').forEach((item) => {
    (item as HTMLElement).onclick = () => {
      const nid = (item as HTMLElement).dataset.nid;
      if (nid) {
        vm.setSubGraphEventId(ev.id);
        vm.select({ kind: 'subnode', id: nid, eventId: ev.id });
      }
    };
  });

  // 4. 关联影响摘要
  const relCard = document.createElement('div');
  relCard.className = 'inspector-section';
  const writtenKeys = varsWrittenBy(doc, ev);
  relCard.innerHTML = `
    <div class="inspector-label">关联改写状态 (写入数据)</div>
    ${
      writtenKeys.length === 0
        ? '<div style="color: #64748b; font-size: 11px;">此 Event 未直接修改任何全局数据/道具</div>'
        : writtenKeys
            .map((k) => {
              const v = doc.vars.find((x) => x.key === k);
              return `
            <div style="display: flex; justify-content: space-between; align-items: center; background: #0b0d17; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 6px; padding: 7px 10px; margin-bottom: 6px; gap: 8px;">
              <div style="display: flex; align-items: center; gap: 6px; min-width: 0; overflow: hidden;">
                <span style="font-size: 14px; flex-shrink: 0;">${v ? v.icon : '📝'}</span>
                <span style="font-weight: 600; font-size: 12px; color: #f8fafc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(
                  v ? v.label : k
                )}</span>
                <span style="color: #64748b; font-size: 10px; font-family: var(--font-mono); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">(${escapeHtml(
                  k
                )})</span>
              </div>
              <button class="mini-btn btn-view-var" data-key="${escapeHtml(
                k
              )}" style="font-size: 11px; padding: 3px 8px; background: rgba(56, 189, 248, 0.1); border-color: rgba(56, 189, 248, 0.3); color: #38bdf8; white-space: nowrap; flex-shrink: 0;">专属图谱 ▶</button>
            </div>
          `;
            })
            .join('')
    }
  `;
  container.appendChild(relCard);

  relCard.querySelectorAll('.btn-view-var').forEach((btn) => {
    (btn as HTMLElement).onclick = () => {
      const key = (btn as HTMLElement).dataset.key;
      if (key) vm.setFocalVar(key);
    };
  });
}
