import { ViewModel } from '../../app/viewModel';
import { varReaders, varWriters } from '../../core/graph';
import { VarCategory, VarDef } from '../../core/types';
import { escapeHtml } from '../../utils/dom';

function bindInput(parent: HTMLElement, selector: string, fn: (val: string) => void): void {
  const el = parent.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement | null;
  if (el) {
    el.oninput = () => fn(el.value);
  }
}

export function renderVarInspector(
  container: HTMLElement,
  vm: ViewModel,
  v: VarDef
): void {
  const doc = vm.doc;
  const state = vm.session.worldState;
  const val = state[v.key];
  const writers = varWriters(doc, v.key);
  const readers = varReaders(doc, v.key);
  const isEdit = vm.session.mode === 'edit';

  const catNameMap: Record<string, string> = {
    party: '👥 人物 (Party)',
    item: '🎒 道具 (Item)',
    teleport: '🗽 传送点 (Teleport)',
    achievement: '🏆 成就 (Achievement)',
    flag: '🚩 标记 (Flag)'
  };
  const catTitle = catNameMap[v.category] || v.category;

  const card = document.createElement('div');
  card.className = 'inspector-section';

  if (isEdit) {
    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <span class="event-type-badge" style="background:#065f46; color:#a7f3d0;">${escapeHtml(
          catTitle
        )}</span>
        <div style="display: flex; align-items: center; gap: 6px;">
          <span class="event-status-pill status-blue">当前值: ${
            val === undefined ? '∅' : escapeHtml(String(val))
          }</span>
          ${
            v.category !== 'stat'
              ? `<button id="btnDeleteVar" class="btn-node-delete" title="删除此变量">
                  <span>删除</span>
                </button>`
              : ''
          }
        </div>
      </div>

      <div class="inspector-field">
        <label class="inspector-label">实体名称与图标</label>
        <div style="display: flex; gap: 8px;">
          <input id="editVarIcon" class="inspector-input" style="width: 48px; text-align: center; font-size: 18px; padding: 4px;" value="${escapeHtml(
            v.icon
          )}" />
          <input id="editVarLabel" class="inspector-input" style="flex: 1; font-weight: 600;" value="${escapeHtml(
            v.label
          )}" />
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
        <div class="inspector-field">
          <label class="inspector-label">变量分类</label>
          <select id="editVarCategory" class="inspector-select">
            <option value="party" ${v.category === 'party' ? 'selected' : ''}>👥 人物 (Party)</option>
            <option value="item" ${v.category === 'item' ? 'selected' : ''}>🎒 道具 (Item)</option>
            <option value="teleport" ${v.category === 'teleport' ? 'selected' : ''}>🗽 传送点 (Teleport)</option>
            <option value="achievement" ${v.category === 'achievement' ? 'selected' : ''}>🏆 成就 (Achievement)</option>
            <option value="flag" ${v.category === 'flag' ? 'selected' : ''}>🚩 标记 (Flag)</option>
          </select>
        </div>
        <div class="inspector-field">
          <label class="inspector-label">标识键名 (Key)</label>
          <input class="inspector-input" style="font-family: monospace; font-size: 11px; background:#1e293b; color:#94a3b8;" value="${escapeHtml(
            v.key
          )}" readonly />
        </div>
      </div>

      <div class="inspector-field">
        <label class="inspector-label">描述说明 (Description)</label>
        <textarea id="editVarDesc" class="inspector-textarea" rows="3" placeholder="描述此实体的用途、获取途径与前置依赖...">${escapeHtml(
          v.desc || ''
        )}</textarea>
      </div>

      <button id="btnOpenFocal" class="dialog-btn primary-btn" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 7px; margin-bottom: 12px;">
        <span>🔍</span> 在画布查看此实体的专属因果图谱
      </button>

      <div class="inspector-label" style="color: #10b981;">
        📥 改变此项的 Event (入边: ${writers.length} 个)
      </div>
      <div style="margin-bottom: 12px;">
        ${
          writers.length === 0
            ? '<div style="font-size: 11px; color: #64748b;">初始固有 / 无 Event 写入</div>'
            : writers
                .map(
                  (ev) =>
                    `<div style="background:#0f172a; padding:4px 8px; border-radius:4px; font-size:11px; margin-bottom:3px; color:#6ee7b7;">• ${escapeHtml(
                      ev.title
                    )}</div>`
                )
                .join('')
        }
      </div>

      <div class="inspector-label" style="color: #38bdf8;">
        📤 受此项影响的 Event (出边: ${readers.length} 个)
      </div>
      <div>
        ${
          readers.length === 0
            ? '<div style="font-size: 11px; color: #64748b;">无后续 Event 消费此项</div>'
            : readers
                .map(
                  (ev) =>
                    `<div style="background:#0f172a; padding:4px 8px; border-radius:4px; font-size:11px; margin-bottom:3px; color:#7dd3fc;">• ${escapeHtml(
                      ev.title
                    )}</div>`
                )
                .join('')
        }
      </div>
    `;

    bindInput(card, '#editVarLabel', (val) => {
      vm.edit.mutateDocument(
        'EditVarLabel',
        (d) => {
          const target = d.vars.find((x) => x.key === v.key);
          if (target) target.label = val.trim() || '未命名实体';
        },
        'field',
        `var_label_${v.key}`
      );
    });
    bindInput(card, '#editVarIcon', (val) => {
      vm.edit.mutateDocument(
        'EditVarIcon',
        (d) => {
          const target = d.vars.find((x) => x.key === v.key);
          if (target) target.icon = val.trim() || '🔹';
        },
        'field',
        `var_icon_${v.key}`
      );
    });
    bindInput(card, '#editVarDesc', (val) => {
      vm.edit.mutateDocument(
        'EditVarDesc',
        (d) => {
          const target = d.vars.find((x) => x.key === v.key);
          if (target) target.desc = val.trim();
        },
        'field',
        `var_desc_${v.key}`
      );
    });
    card.querySelector('#editVarCategory')?.addEventListener('change', (e) => {
      const newCat = (e.target as HTMLSelectElement).value as VarCategory;
      vm.edit.mutateDocument(
        'EditVarCategory',
        (d) => {
          const target = d.vars.find((x) => x.key === v.key);
          if (target) target.category = newCat;
        },
        'structure'
      );
    });
    card.querySelector('#btnDeleteVar')?.addEventListener('click', () => {
      void vm.edit.deleteVar(v.key);
    });
  } else {
    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span class="event-type-badge" style="background:#065f46; color:#a7f3d0;">${escapeHtml(
          catTitle
        )}</span>
        <span class="event-status-pill status-blue">当前值: ${
          val === undefined ? '∅' : escapeHtml(String(val))
        }</span>
      </div>

      <div style="font-size: 16px; font-weight: 700; color: #fff; margin-bottom: 4px;">
        ${v.icon} ${escapeHtml(v.label)}
      </div>
      <div style="font-size: 11px; color: #64748b; font-family: monospace; margin-bottom: 8px;">
        key: ${escapeHtml(v.key)} · 类型: ${escapeHtml(v.kind)}
      </div>
      <div style="font-size: 12px; color: #94a3b8; line-height: 1.5; margin-bottom: 12px;">
        ${escapeHtml(v.desc || '该变量由游戏内 Event 执行改变，并在 Condition 条件中被读取。')}
      </div>

      <button id="btnOpenFocal" class="dialog-btn primary-btn" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 7px; margin-bottom: 12px;">
        <span>🔍</span> 在画布查看此实体的专属因果图谱
      </button>

      <div class="inspector-label" style="color: #10b981;">
        📥 改变此项的 Event (入边: ${writers.length} 个)
      </div>
      <div style="margin-bottom: 12px;">
        ${
          writers.length === 0
            ? '<div style="font-size: 11px; color: #64748b;">初始固有 / 无 Event 写入</div>'
            : writers
                .map(
                  (ev) =>
                    `<div style="background:#0f172a; padding:4px 8px; border-radius:4px; font-size:11px; margin-bottom:3px; color:#6ee7b7;">• ${escapeHtml(
                      ev.title
                    )}</div>`
                )
                .join('')
        }
      </div>

      <div class="inspector-label" style="color: #38bdf8;">
        📤 受此项影响的 Event (出边: ${readers.length} 个)
      </div>
      <div>
        ${
          readers.length === 0
            ? '<div style="font-size: 11px; color: #64748b;">无后续 Event 消费此项</div>'
            : readers
                .map(
                  (ev) =>
                    `<div style="background:#0f172a; padding:4px 8px; border-radius:4px; font-size:11px; margin-bottom:3px; color:#7dd3fc;">• ${escapeHtml(
                      ev.title
                    )}</div>`
                )
                .join('')
        }
      </div>
    `;
  }
  container.appendChild(card);

  card.querySelector('#btnOpenFocal')?.addEventListener('click', () => {
    vm.setFocalVar(v.key);
  });
}
