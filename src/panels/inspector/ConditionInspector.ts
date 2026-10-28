import { ViewModel } from '../../app/viewModel';
import { evalCond, evalCondition } from '../../core/engine';
import { eventsDependingOn } from '../../core/graph';
import { CmpCond, ConditionDef, VarValue } from '../../core/types';
import { escapeHtml } from '../../utils/dom';

function bindInput(parent: HTMLElement, selector: string, fn: (val: string) => void): void {
  const el = parent.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement | null;
  if (el) {
    el.oninput = () => fn(el.value);
  }
}

export function renderConditionInspector(
  container: HTMLElement,
  vm: ViewModel,
  tr: ConditionDef
): void {
  const doc = vm.doc;
  const state = vm.session.worldState;
  const isSatisfied = evalCondition(doc, state, tr);
  const dependentEvents = eventsDependingOn(doc, tr.id);

  // 1. 基础信息卡片
  const metaCard = document.createElement('div');
  metaCard.className = 'inspector-section';
  metaCard.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
      <span class="event-type-badge" style="background:#1e1b4b; color:#c7d2fe; border: 1px solid rgba(99,102,241,0.5);">CONDITION 条件节点</span>
      <button id="btnDeleteCondition" class="btn-node-delete" title="删除此 Condition 节点 (快捷键: Delete)">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
        <span>删除节点</span>
      </button>
    </div>

    <div class="inspector-label">标题 (Title)</div>
    <input type="text" id="trTitle" class="inspector-input" value="${escapeHtml(
      tr.title
    )}" style="width: 100%; margin-bottom: 8px; box-sizing: border-box;" />

    <div class="inspector-label">描述 (Desc)</div>
    <textarea id="trDesc" class="inspector-textarea" style="width: 100%; height: 52px; margin-bottom: 8px; resize: vertical; box-sizing: border-box;">${escapeHtml(
      tr.desc || ''
    )}</textarea>

    <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; background: #0f172a; border: 1px solid #334155; border-radius: 6px;">
      <span style="font-size: 11px; color: #94a3b8;">当前实时求值状态：</span>
      <span class="event-status-pill ${isSatisfied ? 'status-green' : 'status-grey'}" style="font-size: 11px;">
        ${isSatisfied ? '● 满足 (TRUE)' : '○ 未满足 (FALSE)'}
      </span>
    </div>
  `;
  container.appendChild(metaCard);

  bindInput(metaCard, '#trTitle', (v) => {
    vm.edit.mutateDocument(
      'EditCondTitle',
      (d) => {
        const targetTr = d.conditions.find((x: ConditionDef) => x.id === tr.id);
        if (targetTr) targetTr.title = v;
      },
      'field',
      `tr_title_${tr.id}`
    );
  });
  bindInput(metaCard, '#trDesc', (v) => {
    vm.edit.mutateDocument(
      'EditCondDesc',
      (d) => {
        const targetTr = d.conditions.find((x: ConditionDef) => x.id === tr.id);
        if (targetTr) targetTr.desc = v;
      },
      'field',
      `tr_desc_${tr.id}`
    );
  });

  const btnDel = metaCard.querySelector('#btnDeleteCondition') as HTMLElement;
  btnDel.onclick = () => {
    vm.edit.deleteCondition(tr.id);
  };

  // 2. 判断条件列表
  const condCard = document.createElement('div');
  condCard.className = 'inspector-section';
  condCard.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
      <div class="inspector-label" style="margin-bottom: 0;">条件表达式</div>
      <div style="display: flex; align-items: center; gap: 6px;">
        <select id="trMatch" style="background:#0f172a; color:#f8fafc; border:1px solid #334155; border-radius:4px; font-size:11px; padding:2px 4px;">
          <option value="all" ${tr.match === 'all' ? 'selected' : ''}>同时满足 (AND)</option>
          <option value="any" ${tr.match === 'any' ? 'selected' : ''}>满足任一 (OR)</option>
        </select>
        <button id="btnAddCond" class="mini-btn-action" style="padding: 2px 8px; font-size: 11px;">+ 加条件</button>
      </div>
    </div>
    <div id="condsList"></div>
  `;
  container.appendChild(condCard);

  condCard.querySelector('#trMatch')?.addEventListener('change', (e) => {
    const m = (e.target as HTMLSelectElement).value as 'all' | 'any';
    vm.edit.mutateDocument(
      'EditCondMatch',
      (d) => {
        const targetTr = d.conditions.find((x: ConditionDef) => x.id === tr.id);
        if (targetTr) targetTr.match = m;
      },
      'field'
    );
  });

  condCard.querySelector('#btnAddCond')?.addEventListener('click', () => {
    const first = doc.vars[0];
    if (!first) return;
    vm.edit.mutateDocument(
      'AddCondRow',
      (d) => {
        const targetTr = d.conditions.find((x: ConditionDef) => x.id === tr.id);
        if (targetTr) {
          targetTr.conds.push({
            var: first.key,
            op: '==',
            value: first.kind === 'bool' ? true : first.initial
          });
        }
      },
      'structure'
    );
  });

  const cList = condCard.querySelector('#condsList') as HTMLElement;
  tr.conds.forEach((c, cIdx) => {
    const cEl = renderCondItem(vm, tr, c, cIdx);
    cList.appendChild(cEl);
  });

  // 3. 依赖此 Condition 的 Event 列表
  const controlledCard = document.createElement('div');
  controlledCard.className = 'inspector-section';
  controlledCard.innerHTML = `
    <div class="inspector-label" style="color: #38bdf8;">
      📤 依赖此 Condition 的 Event 列表 (${dependentEvents.length} 个)
    </div>
    <div style="font-size: 11px; color: #94a3b8; margin-bottom: 6px;">
      顶层大图中，以下 Event 声明依赖此 Condition 作为前置判断依据：
    </div>
    ${
      dependentEvents.length === 0
        ? '<div style="color: #64748b; font-size: 11px;">暂无 Event 依赖此 Condition</div>'
        : dependentEvents
            .map(
              (ev) => `
          <div style="display: flex; justify-content: space-between; align-items: center; background: #0f172a; border: 1px solid #334155; border-radius: 6px; padding: 6px 8px; margin-bottom: 4px; font-size: 12px;">
            <span style="font-weight: 600; color: #f8fafc;">${escapeHtml(ev.title)}</span>
            <button class="mini-btn btn-goto-ev" data-id="${ev.id}" style="font-size: 10px; padding: 2px 6px;">前往查看 ▶</button>
          </div>
        `
            )
            .join('')
    }
  `;
  container.appendChild(controlledCard);

  controlledCard.querySelectorAll('.btn-goto-ev').forEach((btn) => {
    (btn as HTMLElement).onclick = () => {
      const id = (btn as HTMLElement).dataset.id;
      if (id) vm.select({ kind: 'event', id });
    };
  });
}

function renderCondItem(
  vm: ViewModel,
  tr: ConditionDef,
  c: CmpCond,
  cIdx: number
): HTMLElement {
  const doc = vm.doc;
  const state = vm.session.worldState;
  const isMet = evalCond(doc, state, c);

  const row = document.createElement('div');
  row.style.cssText = `
    display: grid;
    grid-template-columns: 1fr 60px 80px 24px;
    gap: 4px;
    align-items: center;
    background: #0f172a;
    border: 1px solid ${isMet ? '#10b981' : '#334155'};
    border-radius: 6px;
    padding: 6px;
    margin-bottom: 4px;
  `;

  row.innerHTML = `
    <select class="cond-var" style="background:#111827; color:#f8fafc; border:1px solid #334155; font-size:11px; padding:3px; border-radius:4px;">
      ${doc.vars
        .map(
          (v) =>
            `<option value="${escapeHtml(v.key)}" ${v.key === c.var ? 'selected' : ''}>${
              v.icon
            } ${escapeHtml(v.label)}</option>`
        )
        .join('')}
    </select>

    <select class="cond-op" style="background:#111827; color:#38bdf8; font-weight:700; border:1px solid #334155; font-size:11px; padding:3px; border-radius:4px; text-align:center;">
      <option value="==" ${c.op === '==' ? 'selected' : ''}>==</option>
      <option value="!=" ${c.op === '!=' ? 'selected' : ''}>!=</option>
      <option value=">" ${c.op === '>' ? 'selected' : ''}>&gt;</option>
      <option value=">=" ${c.op === '>=' ? 'selected' : ''}>&gt;=</option>
      <option value="<" ${c.op === '<' ? 'selected' : ''}>&lt;</option>
      <option value="<=" ${c.op === '<=' ? 'selected' : ''}>&lt;=</option>
    </select>

    <input type="text" class="cond-val" value="${escapeHtml(
      String(c.value)
    )}" style="padding: 3px; font-size: 11px;" />

    <button class="mini-btn danger-btn btn-del-cond" style="padding: 2px 4px;">×</button>
  `;

  const selVar = row.querySelector('.cond-var') as HTMLSelectElement;
  selVar.onchange = () => {
    const v = selVar.value;
    vm.edit.mutateDocument(
      'EditCondVar',
      (d) => {
        const targetTr = d.conditions.find((x: ConditionDef) => x.id === tr.id);
        if (targetTr && targetTr.conds[cIdx]) {
          targetTr.conds[cIdx].var = v;
        }
      },
      'field'
    );
  };

  const selOp = row.querySelector('.cond-op') as HTMLSelectElement;
  selOp.onchange = () => {
    const op = selOp.value as CmpCond['op'];
    vm.edit.mutateDocument(
      'EditCondOp',
      (d) => {
        const targetTr = d.conditions.find((x: ConditionDef) => x.id === tr.id);
        if (targetTr && targetTr.conds[cIdx]) {
          targetTr.conds[cIdx].op = op;
        }
      },
      'field'
    );
  };

  const inpVal = row.querySelector('.cond-val') as HTMLInputElement;
  inpVal.oninput = () => {
    const txt = inpVal.value.trim();
    let val: VarValue = txt;
    if (txt === 'true') val = true;
    else if (txt === 'false') val = false;
    else if (!isNaN(Number(txt)) && txt !== '') val = Number(txt);
    vm.edit.mutateDocument(
      'EditCondVal',
      (d) => {
        const targetTr = d.conditions.find((x: ConditionDef) => x.id === tr.id);
        if (targetTr && targetTr.conds[cIdx]) {
          targetTr.conds[cIdx].value = val;
        }
      },
      'field',
      `tr_cond_val_${tr.id}_${cIdx}`
    );
  };

  row.querySelector('.btn-del-cond')?.addEventListener('click', () => {
    vm.edit.mutateDocument(
      'DeleteCondRow',
      (d) => {
        const targetTr = d.conditions.find((x: ConditionDef) => x.id === tr.id);
        if (targetTr) {
          targetTr.conds.splice(cIdx, 1);
        }
      },
      'structure'
    );
  });

  return row;
}
