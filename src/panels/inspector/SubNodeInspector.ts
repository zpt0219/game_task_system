import { ViewModel } from '../../app/viewModel';
import { uid } from '../../core/document';
import {
  ActionGraphNode,
  ActionGraphNodeUnion,
  AtomicStep,
  ChoiceGraphNode,
  ConditionCheck,
  EventDef,
  SelectorGraphNode,
  StartGraphNode
} from '../../core/types';
import { escapeHtml } from '../../utils/dom';

function bindInput(parent: HTMLElement, selector: string, fn: (val: string) => void): void {
  const el = parent.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement | null;
  if (el) {
    el.oninput = () => fn(el.value);
  }
}

export function renderSubNodeInspector(
  container: HTMLElement,
  vm: ViewModel,
  ev: EventDef,
  node: ActionGraphNodeUnion
): void {
  // 1. 顶部导航与元信息
  const topCard = document.createElement('div');
  topCard.className = 'inspector-section';
  const typeBadges: Record<string, { label: string; bg: string; color: string }> = {
    start: { label: 'START 入口节点', bg: '#082f49', color: '#38bdf8' },
    action: { label: 'ACTION 复合动作节点', bg: '#064e3b', color: '#34d399' },
    selector: { label: 'SELECTOR 多路分支节点', bg: '#3b0764', color: '#c084fc' },
    choice: { label: 'CHOICE 玩家选项节点', bg: '#451a03', color: '#fbbf24' }
  };
  const tb = typeBadges[node.type] || { label: node.type, bg: '#334155', color: '#f8fafc' };

  topCard.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
      <span class="event-type-badge" style="background:${tb.bg}; color:${tb.color}; font-weight:700;">
        ${tb.label}
      </span>
      ${
        node.type !== 'start'
          ? `<button id="btnDeleteSubNode" class="btn-node-delete" title="删除此子图节点">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              <span>删除节点</span>
            </button>`
          : '<span style="font-size:10px; color:#64748b;">固定起点不可删除</span>'
      }
    </div>

    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 11px; color: #94a3b8; background: #0f172a; padding: 6px 10px; border-radius: 6px; border: 1px solid #1e293b;">
      <span>所属事件：<b>${escapeHtml(ev.title)}</b></span>
      <button id="btnBackToEventMeta" class="mini-btn" style="font-size: 10px; padding: 2px 6px;">检视事件主体</button>
    </div>
  `;
  container.appendChild(topCard);

  topCard.querySelector('#btnBackToEventMeta')?.addEventListener('click', () => {
    vm.select({ kind: 'event', id: ev.id });
  });

  if (node.type !== 'start') {
    topCard.querySelector('#btnDeleteSubNode')?.addEventListener('click', () => {
      vm.edit.deleteSubNode(ev.id, node.id);
    });
  }

  // 根据 4 类节点分别渲染
  switch (node.type) {
    case 'start':
      renderStartNodeInspector(container, vm, ev, node);
      break;
    case 'action':
      renderActionNodeInspector(container, vm, ev, node);
      break;
    case 'selector':
      renderSelectorNodeInspector(container, vm, ev, node);
      break;
    case 'choice':
      renderChoiceNodeInspector(container, vm, ev, node);
      break;
  }
}

/** 通用流向目标选择控件 (连向 Choice 节点时支持配置默认选中选项) */
function renderTargetSelectUI(
  ev: EventDef,
  currentNextId: string | undefined,
  currentDefaultOptionIndex: number | undefined,
  onTargetChange: (targetId?: string, defaultOptionIndex?: number) => void
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.cssText =
    'background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 6px; padding: 8px; margin-top: 6px;';

  const nodes = ev.actionGraph?.nodes || [];
  const targetNode = nodes.find((n) => n.id === currentNextId);

  const selectOptions = [
    '<option value="">(无 / 流程结束)</option>',
    ...nodes
      .filter((n) => n.type !== 'start')
      .map((n) => {
        const title = 'title' in n ? n.title : (n as ActionGraphNodeUnion).id;
        const typePrefix = n.type === 'action' ? '🎬' : n.type === 'selector' ? '🔀' : '💬';
        return `<option value="${n.id}" ${n.id === currentNextId ? 'selected' : ''}>${typePrefix} ${escapeHtml(
          title
        )} (${n.id})</option>`;
      })
  ].join('');

  let choiceOptionsHtml = '';
  if (targetNode && targetNode.type === 'choice') {
    const curIdx = currentDefaultOptionIndex ?? 0;
    const opts = targetNode.options
      .map(
        (o, idx) =>
          `<option value="${idx}" ${idx === curIdx ? 'selected' : ''}>[${idx}] ${escapeHtml(o.text)}</option>`
      )
      .join('');

    choiceOptionsHtml = `
      <div style="margin-top: 6px; padding-top: 6px; border-top: 1px dashed rgba(255,255,255,0.1);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:3px;">
          <span style="font-size:10px; color:#fbbf24; font-weight:700;">🎯 连入 Choice 默认高亮选项：</span>
          <span style="font-size:9px; color:#94a3b8;">(默认最上面 index: 0)</span>
        </div>
        <select class="choice-default-select inspector-select" style="width:100%; font-size:11px;">
          ${opts || '<option value="0">[0] 默认第一项</option>'}
        </select>
      </div>
    `;
  }

  wrap.innerHTML = `
    <div style="font-size: 11px; color: #94a3b8; margin-bottom: 4px; display: flex; align-items: center; justify-content: space-between;">
      <span>Out 输出端口连向：</span>
      ${
        currentNextId
          ? `<span style="font-size: 10px; color: #34d399;">● 已连入</span>`
          : '<span style="font-size: 10px; color: #64748b;">未连线</span>'
      }
    </div>
    <select class="target-node-select inspector-select" style="width: 100%; font-size: 11px;">
      ${selectOptions}
    </select>
    ${choiceOptionsHtml}
  `;

  const selEl = wrap.querySelector('.target-node-select') as HTMLSelectElement;
  selEl.onchange = () => {
    const val = selEl.value || undefined;
    const newTarget = nodes.find((n) => n.id === val);
    const defaultOptIdx = newTarget?.type === 'choice' ? 0 : undefined;
    onTargetChange(val, defaultOptIdx);
  };

  const choiceSelEl = wrap.querySelector('.choice-default-select') as HTMLSelectElement | null;
  if (choiceSelEl) {
    choiceSelEl.onchange = () => {
      const idx = parseInt(choiceSelEl.value, 10);
      onTargetChange(currentNextId, isNaN(idx) ? 0 : idx);
    };
  }

  return wrap;
}

// 1. Start 节点编辑
function renderStartNodeInspector(
  container: HTMLElement,
  vm: ViewModel,
  ev: EventDef,
  node: StartGraphNode
): void {
  const card = document.createElement('div');
  card.className = 'inspector-section';
  card.innerHTML = `
    <div class="inspector-label">入口流程说明</div>
    <div style="font-size: 11px; color: #94a3b8; line-height: 1.5; margin-bottom: 10px;">
      Start 节点固定为事件触发时的唯一起点，负责引导控制流走向第一个执行的节点。
    </div>
    <div class="inspector-label">起点流向 (Next)</div>
  `;

  const targetUI = renderTargetSelectUI(
    ev,
    node.nextId,
    node.defaultOptionIndex,
    (targetId, defaultOptionIndex) => {
      vm.edit.mutateDocument(
        'EditStartNext',
        (d) => {
          const targetNode = d.events
            .find((e: EventDef) => e.id === ev.id)
            ?.actionGraph?.nodes.find((n: ActionGraphNodeUnion) => n.id === node.id);
          if (targetNode && targetNode.type === 'start') {
            targetNode.nextId = targetId;
            targetNode.defaultOptionIndex = defaultOptionIndex;
          }
        },
        'structure'
      );
    }
  );
  card.appendChild(targetUI);
  container.appendChild(card);
}

// 2. Action 复合动作节点编辑
function renderActionNodeInspector(
  container: HTMLElement,
  vm: ViewModel,
  ev: EventDef,
  node: ActionGraphNode
): void {
  const doc = vm.doc;

  // 标题卡片
  const titleCard = document.createElement('div');
  titleCard.className = 'inspector-section';
  titleCard.innerHTML = `
    <div class="inspector-label">节点名称 (Title)</div>
    <input type="text" id="actionTitle" class="inspector-input" value="${escapeHtml(
      node.title || ''
    )}" placeholder="例: 强化攻击" style="width: 100%; box-sizing: border-box;" />
  `;
  container.appendChild(titleCard);

  bindInput(titleCard, '#actionTitle', (v) => {
    vm.edit.mutateDocument(
      'EditActionTitle',
      (d) => {
        const targetNode = d.events
          .find((e: EventDef) => e.id === ev.id)
          ?.actionGraph?.nodes.find((n: ActionGraphNodeUnion) => n.id === node.id);
        if (targetNode && targetNode.type === 'action') {
          targetNode.title = v;
        }
      },
      'field',
      `sub_title_${node.id}`
    );
  });

  // 后续流向卡片 (Out 连线，可连向后续或回跳形成循环)
  const outCard = document.createElement('div');
  outCard.className = 'inspector-section';
  outCard.innerHTML = `
    <div class="inspector-label">后续控制流 (Out 连线，可连向后续节点或回跳循环)</div>
  `;
  const targetUI = renderTargetSelectUI(
    ev,
    node.nextId,
    node.defaultOptionIndex,
    (targetId, defaultOptionIndex) => {
      vm.edit.mutateDocument(
        'EditActionNext',
        (d) => {
          const targetNode = d.events
            .find((e: EventDef) => e.id === ev.id)
            ?.actionGraph?.nodes.find((n: ActionGraphNodeUnion) => n.id === node.id);
          if (targetNode && targetNode.type === 'action') {
            targetNode.nextId = targetId;
            targetNode.defaultOptionIndex = defaultOptionIndex;
          }
        },
        'structure'
      );
    }
  );
  outCard.appendChild(targetUI);
  container.appendChild(outCard);

  // 内部顺序步骤卡片
  const stepsCard = document.createElement('div');
  stepsCard.className = 'inspector-section';
  stepsCard.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
      <div class="inspector-label" style="margin-bottom:0;">
        顺序执行步骤 (${node.steps.length} 步)
      </div>
    </div>
    <div id="subStepsContainer"></div>
    <div class="step-add-toolbar" style="margin-top:10px;">
      <button class="step-add-pill btn-add-substep" data-type="say">💬 对话</button>
      <button class="step-add-pill btn-add-substep" data-type="set">📝 赋值</button>
      <button class="step-add-pill btn-add-substep" data-type="add">➕ 增减</button>
    </div>
  `;
  container.appendChild(stepsCard);

  const stepsContainer = stepsCard.querySelector('#subStepsContainer') as HTMLElement;
  node.steps.forEach((step, sIdx) => {
    const stepEl = renderAtomicStepCard(vm, ev, node, step, sIdx);
    stepsContainer.appendChild(stepEl);
  });

  stepsCard.querySelectorAll('.btn-add-substep').forEach((btn) => {
    btn.addEventListener('click', () => {
      const type = (btn as HTMLElement).dataset.type;
      vm.edit.mutateDocument(
        'AddActionStep',
        (d) => {
          const targetNode = d.events
            .find((e: EventDef) => e.id === ev.id)
            ?.actionGraph?.nodes.find((n: ActionGraphNodeUnion) => n.id === node.id);
          if (!targetNode || targetNode.type !== 'action') return;

          if (type === 'say') {
            targetNode.steps.push({
              type: 'say',
              speaker: '旁白',
              avatar: '💬',
              text: '编写台词文本...',
              button: '继续'
            });
          } else if (type === 'set') {
            const first = doc.vars[0];
            targetNode.steps.push({
              type: 'set',
              var: first ? first.key : 'hero.gold',
              value: first ? first.initial : 0
            });
          } else if (type === 'add') {
            const firstNum = doc.vars.find((v) => v.kind === 'number');
            targetNode.steps.push({
              type: 'add',
              var: firstNum ? firstNum.key : 'hero.gold',
              amount: 10
            });
          }
        },
        'structure'
      );
    });
  });
}

/** 渲染 Action 内部的原子步骤项 (Say / Set / Add) */
function renderAtomicStepCard(
  vm: ViewModel,
  ev: EventDef,
  node: ActionGraphNode,
  step: AtomicStep,
  sIdx: number
): HTMLElement {
  const doc = vm.doc;
  const card = document.createElement('div');
  card.className = 'step-card';
  card.style.cssText =
    'background: #080e1a; border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; padding: 8px; margin-bottom: 8px;';

  const badges: Record<string, string> = {
    say: '<span style="color:#60a5fa; font-weight:700;">💬 对话 (say)</span>',
    set: '<span style="color:#34d399; font-weight:700;">📝 赋值 (set)</span>',
    add: '<span style="color:#fbbf24; font-weight:700;">➕ 增减 (add)</span>'
  };

  card.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
      <div style="display:flex; align-items:center; gap:6px; font-size:11px;">
        <span style="color:#64748b; font-weight:700;">#${sIdx + 1}</span>
        ${badges[step.type]}
      </div>
      <div style="display:flex; gap:3px;">
        <button class="mini-btn btn-substep-up" ${sIdx === 0 ? 'disabled' : ''}>↑</button>
        <button class="mini-btn btn-substep-down" ${sIdx === node.steps.length - 1 ? 'disabled' : ''}>↓</button>
        <button class="mini-btn danger-btn btn-substep-del">×</button>
      </div>
    </div>
    <div class="step-body"></div>
  `;

  const body = card.querySelector('.step-body') as HTMLElement;

  if (step.type === 'say') {
    body.innerHTML = `
      <div style="display:grid; grid-template-columns: 60px 1fr; gap:6px; margin-bottom:6px;">
        <input type="text" class="say-avatar inspector-input" value="${escapeHtml(
          step.avatar || '💬'
        )}" placeholder="头像" style="text-align:center; font-size:16px;" />
        <input type="text" class="say-speaker inspector-input" value="${escapeHtml(
          step.speaker
        )}" placeholder="说话人" />
      </div>
      <textarea class="say-text inspector-textarea" style="width:100%; height:50px; resize:vertical; margin-bottom:6px; box-sizing:border-box;">${escapeHtml(
        step.text
      )}</textarea>
      <input type="text" class="say-button inspector-input" value="${escapeHtml(
        step.button || '继续'
      )}" placeholder="确认按钮文案 (如: 继续)" style="width:100%; box-sizing:border-box;" />
    `;
    bindInput(body, '.say-avatar', (v) => {
      vm.edit.mutateDocument(
        'EditSayAvatar',
        (d) => {
          const targetNode = d.events
            .find((e: EventDef) => e.id === ev.id)
            ?.actionGraph?.nodes.find((n: ActionGraphNodeUnion) => n.id === node.id);
          if (targetNode && targetNode.type === 'action') {
            const s = targetNode.steps[sIdx];
            if (s && s.type === 'say') s.avatar = v;
          }
        },
        'field',
        `say_avatar_${node.id}_${sIdx}`
      );
    });
    bindInput(body, '.say-speaker', (v) => {
      vm.edit.mutateDocument(
        'EditSaySpeaker',
        (d) => {
          const targetNode = d.events
            .find((e: EventDef) => e.id === ev.id)
            ?.actionGraph?.nodes.find((n: ActionGraphNodeUnion) => n.id === node.id);
          if (targetNode && targetNode.type === 'action') {
            const s = targetNode.steps[sIdx];
            if (s && s.type === 'say') s.speaker = v;
          }
        },
        'field',
        `say_speaker_${node.id}_${sIdx}`
      );
    });
    bindInput(body, '.say-text', (v) => {
      vm.edit.mutateDocument(
        'EditSayText',
        (d) => {
          const targetNode = d.events
            .find((e: EventDef) => e.id === ev.id)
            ?.actionGraph?.nodes.find((n: ActionGraphNodeUnion) => n.id === node.id);
          if (targetNode && targetNode.type === 'action') {
            const s = targetNode.steps[sIdx];
            if (s && s.type === 'say') s.text = v;
          }
        },
        'field',
        `say_text_${node.id}_${sIdx}`
      );
    });
    bindInput(body, '.say-button', (v) => {
      vm.edit.mutateDocument(
        'EditSayButton',
        (d) => {
          const targetNode = d.events
            .find((e: EventDef) => e.id === ev.id)
            ?.actionGraph?.nodes.find((n: ActionGraphNodeUnion) => n.id === node.id);
          if (targetNode && targetNode.type === 'action') {
            const s = targetNode.steps[sIdx];
            if (s && s.type === 'say') s.button = v;
          }
        },
        'field',
        `say_btn_${node.id}_${sIdx}`
      );
    });
  } else if (step.type === 'set') {
    const varOptions = doc.vars
      .map((v) => `<option value="${v.key}" ${v.key === step.var ? 'selected' : ''}>${v.icon} ${v.label} (${v.key})</option>`)
      .join('');

    body.innerHTML = `
      <div style="margin-bottom:6px;">
        <div class="inspector-label" style="font-size:10px;">目标变量：</div>
        <select class="set-var inspector-select" style="width:100%; font-size:11px;">
          ${varOptions}
        </select>
      </div>
      <div>
        <div class="inspector-label" style="font-size:10px;">赋值内容：</div>
        <input type="text" class="set-val inspector-input" value="${escapeHtml(
          step.value !== undefined ? String(step.value) : step.from ? `from:${step.from}` : ''
        )}" placeholder="例: true / 100 / from:hero.maxHp" style="width:100%; font-family:monospace; box-sizing:border-box;" />
      </div>
    `;
    body.querySelector('.set-var')?.addEventListener('change', (e) => {
      const val = (e.target as HTMLSelectElement).value;
      vm.edit.mutateDocument(
        'EditSetVar',
        (d) => {
          const targetNode = d.events
            .find((evItem: EventDef) => evItem.id === ev.id)
            ?.actionGraph?.nodes.find((n: ActionGraphNodeUnion) => n.id === node.id);
          if (targetNode && targetNode.type === 'action') {
            const s = targetNode.steps[sIdx];
            if (s && s.type === 'set') s.var = val;
          }
        },
        'field'
      );
    });
    bindInput(body, '.set-val', (v) => {
      vm.edit.mutateDocument(
        'EditSetVal',
        (d) => {
          const targetNode = d.events
            .find((evItem: EventDef) => evItem.id === ev.id)
            ?.actionGraph?.nodes.find((n: ActionGraphNodeUnion) => n.id === node.id);
          if (targetNode && targetNode.type === 'action') {
            const s = targetNode.steps[sIdx];
            if (s && s.type === 'set') {
              if (v.startsWith('from:')) {
                s.from = v.slice(5).trim();
                delete s.value;
              } else if (v === 'true') {
                s.value = true;
                delete s.from;
              } else if (v === 'false') {
                s.value = false;
                delete s.from;
              } else if (!isNaN(Number(v)) && v.trim() !== '') {
                s.value = Number(v);
                delete s.from;
              } else {
                s.value = v;
                delete s.from;
              }
            }
          }
        },
        'field',
        `set_val_${node.id}_${sIdx}`
      );
    });
  } else if (step.type === 'add') {
    const numVars = doc.vars.filter((v) => v.kind === 'number');
    const varOptions = numVars
      .map((v) => `<option value="${v.key}" ${v.key === step.var ? 'selected' : ''}>${v.icon} ${v.label} (${v.key})</option>`)
      .join('');

    body.innerHTML = `
      <div style="display:grid; grid-template-columns: 1fr 100px; gap:6px;">
        <div>
          <div class="inspector-label" style="font-size:10px;">增减目标：</div>
          <select class="add-var inspector-select" style="width:100%; font-size:11px;">
            ${varOptions}
          </select>
        </div>
        <div>
          <div class="inspector-label" style="font-size:10px;">数值 (可正负)：</div>
          <input type="number" class="add-amount inspector-input" value="${step.amount}" style="width:100%; box-sizing:border-box;" />
        </div>
      </div>
    `;
    body.querySelector('.add-var')?.addEventListener('change', (e) => {
      const val = (e.target as HTMLSelectElement).value;
      vm.edit.mutateDocument(
        'EditAddVar',
        (d) => {
          const targetNode = d.events
            .find((evItem: EventDef) => evItem.id === ev.id)
            ?.actionGraph?.nodes.find((n: ActionGraphNodeUnion) => n.id === node.id);
          if (targetNode && targetNode.type === 'action') {
            const s = targetNode.steps[sIdx];
            if (s && s.type === 'add') s.var = val;
          }
        },
        'field'
      );
    });
    body.querySelector('.add-amount')?.addEventListener('input', (e) => {
      const amt = Number((e.target as HTMLInputElement).value) || 0;
      vm.edit.mutateDocument(
        'EditAddAmount',
        (d) => {
          const targetNode = d.events
            .find((evItem: EventDef) => evItem.id === ev.id)
            ?.actionGraph?.nodes.find((n: ActionGraphNodeUnion) => n.id === node.id);
          if (targetNode && targetNode.type === 'action') {
            const s = targetNode.steps[sIdx];
            if (s && s.type === 'add') s.amount = amt;
          }
        },
        'field',
        `add_amt_${node.id}_${sIdx}`
      );
    });
  }

  // 步骤排序与删除
  card.querySelector('.btn-substep-up')?.addEventListener('click', () => {
    if (sIdx > 0) {
      vm.edit.mutateDocument(
        'MoveStepUp',
        (d) => {
          const targetNode = d.events
            .find((e: EventDef) => e.id === ev.id)
            ?.actionGraph?.nodes.find((n: ActionGraphNodeUnion) => n.id === node.id);
          if (targetNode && targetNode.type === 'action') {
            const temp = targetNode.steps[sIdx];
            targetNode.steps[sIdx] = targetNode.steps[sIdx - 1];
            targetNode.steps[sIdx - 1] = temp;
          }
        },
        'structure'
      );
    }
  });

  card.querySelector('.btn-substep-down')?.addEventListener('click', () => {
    if (sIdx < node.steps.length - 1) {
      vm.edit.mutateDocument(
        'MoveStepDown',
        (d) => {
          const targetNode = d.events
            .find((e: EventDef) => e.id === ev.id)
            ?.actionGraph?.nodes.find((n: ActionGraphNodeUnion) => n.id === node.id);
          if (targetNode && targetNode.type === 'action') {
            const temp = targetNode.steps[sIdx];
            targetNode.steps[sIdx] = targetNode.steps[sIdx + 1];
            targetNode.steps[sIdx + 1] = temp;
          }
        },
        'structure'
      );
    }
  });

  card.querySelector('.btn-substep-del')?.addEventListener('click', () => {
    vm.edit.mutateDocument(
      'DeleteStep',
      (d) => {
        const targetNode = d.events
          .find((e: EventDef) => e.id === ev.id)
          ?.actionGraph?.nodes.find((n: ActionGraphNodeUnion) => n.id === node.id);
        if (targetNode && targetNode.type === 'action') {
          targetNode.steps.splice(sIdx, 1);
        }
      },
      'structure'
    );
  });

  return card;
}

// 3. Selector 多路条件分支节点编辑
function renderSelectorNodeInspector(
  container: HTMLElement,
  vm: ViewModel,
  ev: EventDef,
  node: SelectorGraphNode
): void {
  const incomingCondIds = ev.incomingConditions ?? [];

  // 标题卡片
  const titleCard = document.createElement('div');
  titleCard.className = 'inspector-section';
  titleCard.innerHTML = `
    <div class="inspector-label">节点名称 (Title)</div>
    <input type="text" id="selTitle" class="inspector-input" value="${escapeHtml(
      node.title || ''
    )}" placeholder="例: 阶段判断" style="width: 100%; box-sizing: border-box;" />
  `;
  container.appendChild(titleCard);

  bindInput(titleCard, '#selTitle', (v) => {
    vm.edit.mutateDocument(
      'EditSelectorTitle',
      (d) => {
        const targetNode = d.events
          .find((e: EventDef) => e.id === ev.id)
          ?.actionGraph?.nodes.find((n: ActionGraphNodeUnion) => n.id === node.id);
        if (targetNode && targetNode.type === 'selector') {
          targetNode.title = v;
        }
      },
      'field',
      `sub_title_${node.id}`
    );
  });

  // 分支 Cases 卡片
  const casesCard = document.createElement('div');
  casesCard.className = 'inspector-section';
  casesCard.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
      <div class="inspector-label" style="margin-bottom:0;">
        条件分支列表 (${node.cases.length} 项，从上到下匹配)
      </div>
      <button id="btnAddCase" class="mini-btn-action">+ 添加分支</button>
    </div>
    <div id="casesContainer"></div>
  `;
  container.appendChild(casesCard);

  casesCard.querySelector('#btnAddCase')?.addEventListener('click', () => {
    vm.edit.mutateDocument(
      'AddSelectorCase',
      (d) => {
        const targetNode = d.events
          .find((e: EventDef) => e.id === ev.id)
          ?.actionGraph?.nodes.find((n: ActionGraphNodeUnion) => n.id === node.id);
        if (targetNode && targetNode.type === 'selector') {
          targetNode.cases.push({
            id: uid('case'),
            title: `分支 ${targetNode.cases.length + 1}`,
            checks: incomingCondIds.length > 0 ? [{ conditionId: incomingCondIds[0] }] : []
          });
        }
      },
      'structure'
    );
  });

  const casesContainer = casesCard.querySelector('#casesContainer') as HTMLElement;
  node.cases.forEach((c, cIdx) => {
    const caseEl = document.createElement('div');
    caseEl.className = 'step-card';
    caseEl.style.cssText =
      'background: #0d1222; border: 1px solid rgba(168,85,247,0.3); border-radius: 6px; padding: 10px; margin-bottom: 10px;';

    caseEl.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; gap:6px;">
        <span style="color:#c084fc; font-weight:700; font-size:11px;">Case ${cIdx + 1}</span>
        <input type="text" class="case-title inspector-input" value="${escapeHtml(
          c.title
        )}" placeholder="分支说明" style="flex:1; min-width:0; padding:2px 6px; font-size:12px;" />
        <div style="display:flex; gap:3px;">
          <button class="mini-btn btn-case-up" ${cIdx === 0 ? 'disabled' : ''}>↑</button>
          <button class="mini-btn btn-case-down" ${cIdx === node.cases.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="mini-btn danger-btn btn-case-del">×</button>
        </div>
      </div>

      <div style="font-size:10px; font-weight:700; color:#38bdf8; margin:6px 0 4px; display:flex; justify-content:space-between; align-items:center;">
        <span>🔍 依赖 Condition 判断规则 (需全部满足)：</span>
        ${
          incomingCondIds.length > 0
            ? `<button class="mini-btn btn-add-check" style="font-size:9px; padding:1px 5px;">+ 判断规则</button>`
            : ''
        }
      </div>
      <div class="checks-list" style="margin-bottom:8px;"></div>

      <div class="case-target-wrap"></div>
    `;

    bindInput(caseEl, '.case-title', (v) => {
      vm.edit.mutateDocument(
        'EditCaseTitle',
        (d) => {
          const targetNode = d.events
            .find((e: EventDef) => e.id === ev.id)
            ?.actionGraph?.nodes.find((n: ActionGraphNodeUnion) => n.id === node.id);
          if (targetNode && targetNode.type === 'selector' && targetNode.cases[cIdx]) {
            targetNode.cases[cIdx].title = v;
          }
        },
        'field',
        `case_title_${node.id}_${cIdx}`
      );
    });

    // 规则列表
    const checksList = caseEl.querySelector('.checks-list') as HTMLElement;
    if (c.checks.length === 0) {
      checksList.innerHTML = `<div style="font-size:10px; color:#64748b;">(暂无判断规则)</div>`;
    } else {
      c.checks.forEach((chk, chkIdx) => {
        const chkRow = renderCheckRow(
          vm,
          ev,
          chk,
          (updater, coalesceKey) => {
            vm.edit.mutateDocument(
              'EditSelectorCheck',
              (d) => {
                const targetNode = d.events
                  .find((e: EventDef) => e.id === ev.id)
                  ?.actionGraph?.nodes.find((n: ActionGraphNodeUnion) => n.id === node.id);
                if (targetNode && targetNode.type === 'selector') {
                  const targetChk = targetNode.cases[cIdx]?.checks[chkIdx];
                  if (targetChk) updater(targetChk);
                }
              },
              'field',
              coalesceKey
            );
          },
          () => {
            vm.edit.mutateDocument(
              'DeleteSelectorCheck',
              (d) => {
                const targetNode = d.events
                  .find((e: EventDef) => e.id === ev.id)
                  ?.actionGraph?.nodes.find((n: ActionGraphNodeUnion) => n.id === node.id);
                if (targetNode && targetNode.type === 'selector') {
                  targetNode.cases[cIdx]?.checks.splice(chkIdx, 1);
                }
              },
              'structure'
            );
          }
        );
        checksList.appendChild(chkRow);
      });
    }

    caseEl.querySelector('.btn-add-check')?.addEventListener('click', () => {
      vm.edit.mutateDocument(
        'AddSelectorCheck',
        (d) => {
          const targetNode = d.events
            .find((e: EventDef) => e.id === ev.id)
            ?.actionGraph?.nodes.find((n: ActionGraphNodeUnion) => n.id === node.id);
          if (targetNode && targetNode.type === 'selector' && incomingCondIds.length > 0) {
            targetNode.cases[cIdx]?.checks.push({ conditionId: incomingCondIds[0] });
          }
        },
        'structure'
      );
    });

    // 流向设置
    const targetWrap = caseEl.querySelector('.case-target-wrap') as HTMLElement;
    const targetUI = renderTargetSelectUI(
      ev,
      c.targetId,
      c.defaultOptionIndex,
      (targetId, defaultOptionIndex) => {
        vm.edit.mutateDocument(
          'EditCaseTarget',
          (d) => {
            const targetNode = d.events
              .find((e: EventDef) => e.id === ev.id)
              ?.actionGraph?.nodes.find((n: ActionGraphNodeUnion) => n.id === node.id);
            if (targetNode && targetNode.type === 'selector') {
              const tc = targetNode.cases[cIdx];
              if (tc) {
                tc.targetId = targetId;
                tc.defaultOptionIndex = defaultOptionIndex;
              }
            }
          },
          'structure'
        );
      }
    );
    targetWrap.appendChild(targetUI);

    // 上移下移删除
    caseEl.querySelector('.btn-case-up')?.addEventListener('click', () => {
      if (cIdx > 0) {
        vm.edit.mutateDocument(
          'MoveCaseUp',
          (d) => {
            const targetNode = d.events
              .find((e: EventDef) => e.id === ev.id)
              ?.actionGraph?.nodes.find((n: ActionGraphNodeUnion) => n.id === node.id);
            if (targetNode && targetNode.type === 'selector') {
              const temp = targetNode.cases[cIdx];
              targetNode.cases[cIdx] = targetNode.cases[cIdx - 1];
              targetNode.cases[cIdx - 1] = temp;
            }
          },
          'structure'
        );
      }
    });
    caseEl.querySelector('.btn-case-down')?.addEventListener('click', () => {
      if (cIdx < node.cases.length - 1) {
        vm.edit.mutateDocument(
          'MoveCaseDown',
          (d) => {
            const targetNode = d.events
              .find((e: EventDef) => e.id === ev.id)
              ?.actionGraph?.nodes.find((n: ActionGraphNodeUnion) => n.id === node.id);
            if (targetNode && targetNode.type === 'selector') {
              const temp = targetNode.cases[cIdx];
              targetNode.cases[cIdx] = targetNode.cases[cIdx + 1];
              targetNode.cases[cIdx + 1] = temp;
            }
          },
          'structure'
        );
      }
    });
    caseEl.querySelector('.btn-case-del')?.addEventListener('click', () => {
      vm.edit.mutateDocument(
        'DeleteCase',
        (d) => {
          const targetNode = d.events
            .find((e: EventDef) => e.id === ev.id)
            ?.actionGraph?.nodes.find((n: ActionGraphNodeUnion) => n.id === node.id);
          if (targetNode && targetNode.type === 'selector') {
            targetNode.cases.splice(cIdx, 1);
          }
        },
        'structure'
      );
    });

    casesContainer.appendChild(caseEl);
  });

  // Default 保底目标卡片
  const defCard = document.createElement('div');
  defCard.className = 'inspector-section';
  defCard.innerHTML = `
    <div class="inspector-label">Default 保底流向 (所有条件均不满足时流向)：</div>
  `;
  const defTargetUI = renderTargetSelectUI(
    ev,
    node.defaultTargetId,
    node.defaultOptionIndex,
    (targetId, defaultOptionIndex) => {
      vm.edit.mutateDocument(
        'EditSelectorDefaultTarget',
        (d) => {
          const targetNode = d.events
            .find((e: EventDef) => e.id === ev.id)
            ?.actionGraph?.nodes.find((n: ActionGraphNodeUnion) => n.id === node.id);
          if (targetNode && targetNode.type === 'selector') {
            targetNode.defaultTargetId = targetId;
            targetNode.defaultOptionIndex = defaultOptionIndex;
          }
        },
        'structure'
      );
    }
  );
  defCard.appendChild(defTargetUI);
  container.appendChild(defCard);
}

// 4. Choice 玩家选项分流节点编辑
function renderChoiceNodeInspector(
  container: HTMLElement,
  vm: ViewModel,
  ev: EventDef,
  node: ChoiceGraphNode
): void {
  const incomingCondIds = ev.incomingConditions ?? [];

  // 提问信息卡片
  const askCard = document.createElement('div');
  askCard.className = 'inspector-section';
  askCard.innerHTML = `
    <div class="inspector-label">选项卡片标题</div>
    <input type="text" id="choiceTitle" class="inspector-input" value="${escapeHtml(
      node.title || ''
    )}" placeholder="例: 玩家选项提问" style="width: 100%; margin-bottom: 8px; box-sizing: border-box;" />

    <div style="display:grid; grid-template-columns: 50px 1fr 1fr; gap:6px; margin-bottom:8px;">
      <div>
        <div class="inspector-label">头像</div>
        <input type="text" id="choiceAvatar" class="inspector-input" value="${escapeHtml(
          node.avatar || '💬'
        )}" style="width:100%; text-align:center; font-size:16px; box-sizing:border-box;" />
      </div>
      <div>
        <div class="inspector-label">说话人</div>
        <input type="text" id="choiceSpeaker" class="inspector-input" value="${escapeHtml(
          node.speaker || ''
        )}" style="width:100%; box-sizing:border-box;" />
      </div>
      <div>
        <div class="inspector-label">头衔</div>
        <input type="text" id="choiceSpeakerTitle" class="inspector-input" value="${escapeHtml(
          node.speakerTitle || ''
        )}" placeholder="例: 侍从" style="width:100%; box-sizing:border-box;" />
      </div>
    </div>

    <div class="inspector-label">提问台词正文 (支持 {hero.gold} 变量插值)</div>
    <textarea id="choiceText" class="inspector-textarea" style="width: 100%; height: 56px; resize: vertical; box-sizing: border-box;">${escapeHtml(
      node.text || ''
    )}</textarea>
  `;
  container.appendChild(askCard);

  bindInput(askCard, '#choiceTitle', (v) => {
    vm.edit.mutateDocument(
      'EditChoiceTitle',
      (d) => {
        const targetNode = d.events
          .find((e: EventDef) => e.id === ev.id)
          ?.actionGraph?.nodes.find((n: ActionGraphNodeUnion) => n.id === node.id);
        if (targetNode && targetNode.type === 'choice') {
          targetNode.title = v;
        }
      },
      'field',
      `sub_title_${node.id}`
    );
  });
  bindInput(askCard, '#choiceAvatar', (v) => {
    vm.edit.mutateDocument(
      'EditChoiceAvatar',
      (d) => {
        const targetNode = d.events
          .find((e: EventDef) => e.id === ev.id)
          ?.actionGraph?.nodes.find((n: ActionGraphNodeUnion) => n.id === node.id);
        if (targetNode && targetNode.type === 'choice') {
          targetNode.avatar = v;
        }
      },
      'field'
    );
  });
  bindInput(askCard, '#choiceSpeaker', (v) => {
    vm.edit.mutateDocument(
      'EditChoiceSpeaker',
      (d) => {
        const targetNode = d.events
          .find((e: EventDef) => e.id === ev.id)
          ?.actionGraph?.nodes.find((n: ActionGraphNodeUnion) => n.id === node.id);
        if (targetNode && targetNode.type === 'choice') {
          targetNode.speaker = v;
        }
      },
      'field'
    );
  });
  bindInput(askCard, '#choiceSpeakerTitle', (v) => {
    vm.edit.mutateDocument(
      'EditChoiceSpeakerTitle',
      (d) => {
        const targetNode = d.events
          .find((e: EventDef) => e.id === ev.id)
          ?.actionGraph?.nodes.find((n: ActionGraphNodeUnion) => n.id === node.id);
        if (targetNode && targetNode.type === 'choice') {
          targetNode.speakerTitle = v;
        }
      },
      'field'
    );
  });
  bindInput(askCard, '#choiceText', (v) => {
    vm.edit.mutateDocument(
      'EditChoiceText',
      (d) => {
        const targetNode = d.events
          .find((e: EventDef) => e.id === ev.id)
          ?.actionGraph?.nodes.find((n: ActionGraphNodeUnion) => n.id === node.id);
        if (targetNode && targetNode.type === 'choice') {
          targetNode.text = v;
        }
      },
      'field'
    );
  });

  // 选项列表卡片
  const optCard = document.createElement('div');
  optCard.className = 'inspector-section';
  optCard.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
      <div class="inspector-label" style="margin-bottom:0;">
        玩家选项列表 (${node.options.length} 个)
      </div>
      <button id="btnAddOpt" class="mini-btn-action">+ 添加选项</button>
    </div>
    <div id="optionsContainer"></div>
  `;
  container.appendChild(optCard);

  optCard.querySelector('#btnAddOpt')?.addEventListener('click', () => {
    vm.edit.mutateDocument(
      'AddChoiceOpt',
      (d) => {
        const targetNode = d.events
          .find((e: EventDef) => e.id === ev.id)
          ?.actionGraph?.nodes.find((n: ActionGraphNodeUnion) => n.id === node.id);
        if (targetNode && targetNode.type === 'choice') {
          targetNode.options.push({
            id: uid('opt'),
            text: `选项 ${targetNode.options.length + 1}`,
            style: 'primary'
          });
        }
      },
      'structure'
    );
  });

  const optContainer = optCard.querySelector('#optionsContainer') as HTMLElement;
  node.options.forEach((opt, oIdx) => {
    const oEl = document.createElement('div');
    oEl.className = 'step-card';
    oEl.style.cssText =
      'background: #17120a; border: 1px solid rgba(245,158,11,0.3); border-radius: 6px; padding: 10px; margin-bottom: 10px;';

    oEl.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; gap:6px;">
        <span style="color:#fbbf24; font-weight:700; font-size:11px;">[${oIdx}]</span>
        <input type="text" class="opt-text inspector-input" value="${escapeHtml(
          opt.text
        )}" placeholder="按钮文案" style="flex:1; min-width:0; padding:3px 6px; font-size:12px;" />
        <select class="opt-style inspector-select" style="font-size:11px; padding:2px 4px;">
          <option value="primary" ${opt.style === 'primary' ? 'selected' : ''}>主要(绿)</option>
          <option value="secondary" ${opt.style === 'secondary' ? 'selected' : ''}>次要(灰)</option>
          <option value="danger" ${opt.style === 'danger' ? 'selected' : ''}>危险(红)</option>
        </select>
        <div style="display:flex; gap:3px;">
          <button class="mini-btn btn-opt-up" ${oIdx === 0 ? 'disabled' : ''}>↑</button>
          <button class="mini-btn btn-opt-down" ${oIdx === node.options.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="mini-btn danger-btn btn-opt-del">×</button>
        </div>
      </div>

      <div style="font-size:10px; font-weight:700; color:#f59e0b; margin:6px 0 4px; display:flex; justify-content:space-between; align-items:center;">
        <span>前置可用条件 (不满足置灰)：</span>
        ${
          incomingCondIds.length > 0
            ? `<button class="mini-btn btn-add-opt-check" style="font-size:9px; padding:1px 5px;">+ 前置条件</button>`
            : ''
        }
      </div>
      <div class="opt-checks-list" style="margin-bottom:8px;"></div>

      <div class="opt-target-wrap"></div>
    `;

    bindInput(oEl, '.opt-text', (v) => {
      vm.edit.mutateDocument(
        'EditOptText',
        (d) => {
          const targetNode = d.events
            .find((e: EventDef) => e.id === ev.id)
            ?.actionGraph?.nodes.find((n: ActionGraphNodeUnion) => n.id === node.id);
          if (targetNode && targetNode.type === 'choice' && targetNode.options[oIdx]) {
            targetNode.options[oIdx].text = v;
          }
        },
        'field',
        `opt_text_${node.id}_${oIdx}`
      );
    });

    oEl.querySelector('.opt-style')?.addEventListener('change', (e) => {
      const val = (e.target as HTMLSelectElement).value as 'primary' | 'secondary' | 'danger';
      vm.edit.mutateDocument(
        'EditOptStyle',
        (d) => {
          const targetNode = d.events
            .find((e: EventDef) => e.id === ev.id)
            ?.actionGraph?.nodes.find((n: ActionGraphNodeUnion) => n.id === node.id);
          if (targetNode && targetNode.type === 'choice' && targetNode.options[oIdx]) {
            targetNode.options[oIdx].style = val;
          }
        },
        'field'
      );
    });

    // 选项可用前置条件
    const checksList = oEl.querySelector('.opt-checks-list') as HTMLElement;
    const chks = opt.checks || [];
    if (chks.length === 0) {
      checksList.innerHTML = `<div style="font-size:10px; color:#64748b;">(无条件限制，始终可选)</div>`;
    } else {
      chks.forEach((chk, chkIdx) => {
        const chkRow = renderCheckRow(
          vm,
          ev,
          chk,
          (updater, coalesceKey) => {
            vm.edit.mutateDocument(
              'EditChoiceCheck',
              (d) => {
                const targetNode = d.events
                  .find((e: EventDef) => e.id === ev.id)
                  ?.actionGraph?.nodes.find((n: ActionGraphNodeUnion) => n.id === node.id);
                if (targetNode && targetNode.type === 'choice') {
                  const targetChk = targetNode.options[oIdx]?.checks?.[chkIdx];
                  if (targetChk) updater(targetChk);
                }
              },
              'field',
              coalesceKey
            );
          },
          () => {
            vm.edit.mutateDocument(
              'DeleteChoiceCheck',
              (d) => {
                const targetNode = d.events
                  .find((e: EventDef) => e.id === ev.id)
                  ?.actionGraph?.nodes.find((n: ActionGraphNodeUnion) => n.id === node.id);
                if (targetNode && targetNode.type === 'choice') {
                  targetNode.options[oIdx]?.checks?.splice(chkIdx, 1);
                }
              },
              'structure'
            );
          }
        );
        checksList.appendChild(chkRow);
      });
    }

    oEl.querySelector('.btn-add-opt-check')?.addEventListener('click', () => {
      vm.edit.mutateDocument(
        'AddChoiceCheck',
        (d) => {
          const targetNode = d.events
            .find((e: EventDef) => e.id === ev.id)
            ?.actionGraph?.nodes.find((n: ActionGraphNodeUnion) => n.id === node.id);
          if (targetNode && targetNode.type === 'choice' && incomingCondIds.length > 0) {
            const o = targetNode.options[oIdx];
            if (!o.checks) o.checks = [];
            o.checks.push({ conditionId: incomingCondIds[0] });
          }
        },
        'structure'
      );
    });

    // 流向设置
    const targetWrap = oEl.querySelector('.opt-target-wrap') as HTMLElement;
    const targetUI = renderTargetSelectUI(
      ev,
      opt.targetId,
      opt.defaultOptionIndex,
      (targetId, defaultOptionIndex) => {
        vm.edit.mutateDocument(
          'EditChoiceOptTarget',
          (d) => {
            const targetNode = d.events
              .find((e: EventDef) => e.id === ev.id)
              ?.actionGraph?.nodes.find((n: ActionGraphNodeUnion) => n.id === node.id);
            if (targetNode && targetNode.type === 'choice') {
              const to = targetNode.options[oIdx];
              if (to) {
                to.targetId = targetId;
                to.defaultOptionIndex = defaultOptionIndex;
              }
            }
          },
          'structure'
        );
      }
    );
    targetWrap.appendChild(targetUI);

    // 上移下移删除
    oEl.querySelector('.btn-opt-up')?.addEventListener('click', () => {
      if (oIdx > 0) {
        vm.edit.mutateDocument(
          'MoveOptUp',
          (d) => {
            const targetNode = d.events
              .find((e: EventDef) => e.id === ev.id)
              ?.actionGraph?.nodes.find((n: ActionGraphNodeUnion) => n.id === node.id);
            if (targetNode && targetNode.type === 'choice') {
              const temp = targetNode.options[oIdx];
              targetNode.options[oIdx] = targetNode.options[oIdx - 1];
              targetNode.options[oIdx - 1] = temp;
            }
          },
          'structure'
        );
      }
    });
    oEl.querySelector('.btn-opt-down')?.addEventListener('click', () => {
      if (oIdx < node.options.length - 1) {
        vm.edit.mutateDocument(
          'MoveOptDown',
          (d) => {
            const targetNode = d.events
              .find((e: EventDef) => e.id === ev.id)
              ?.actionGraph?.nodes.find((n: ActionGraphNodeUnion) => n.id === node.id);
            if (targetNode && targetNode.type === 'choice') {
              const temp = targetNode.options[oIdx];
              targetNode.options[oIdx] = targetNode.options[oIdx + 1];
              targetNode.options[oIdx + 1] = temp;
            }
          },
          'structure'
        );
      }
    });
    oEl.querySelector('.btn-opt-del')?.addEventListener('click', () => {
      vm.edit.mutateDocument(
        'DeleteOpt',
        (d) => {
          const targetNode = d.events
            .find((e: EventDef) => e.id === ev.id)
            ?.actionGraph?.nodes.find((n: ActionGraphNodeUnion) => n.id === node.id);
          if (targetNode && targetNode.type === 'choice') {
            targetNode.options.splice(oIdx, 1);
          }
        },
        'structure'
      );
    });

    optContainer.appendChild(oEl);
  });
}

/** 渲染一条针对所依赖 Condition 的比较规则 (ConditionCheck) */
function renderCheckRow(
  vm: ViewModel,
  ev: EventDef,
  check: ConditionCheck,
  onUpdate: (updater: (chk: ConditionCheck) => void, coalesceKey?: string) => void,
  onDelete: () => void
): HTMLElement {
  const incomingCondIds = ev.incomingConditions ?? [];
  const row = document.createElement('div');
  row.style.cssText =
    'display:grid; grid-template-columns: 1fr 60px 70px 24px; gap:4px; align-items:center; margin-bottom:4px;';

  const curCondId = check.conditionId;
  const condOptions = incomingCondIds
    .map((cid) => {
      const t = vm.getCondition(cid);
      const title = t ? t.title.replace(/^🔍 condition: /, '') : cid;
      return `<option value="${cid}" ${cid === curCondId ? 'selected' : ''}>🔍 ${escapeHtml(title)}</option>`;
    })
    .join('');

  const opList = ['==', '!=', '>=', '<=', '>', '<'];
  const opOptions = opList
    .map((op) => `<option value="${op}" ${op === (check.op || '==') ? 'selected' : ''}>${op}</option>`)
    .join('');

  row.innerHTML = `
    <select class="chk-trig-select inspector-select" style="font-size:10px; padding:2px;">
      ${condOptions}
    </select>
    <select class="chk-op-select inspector-select" style="font-size:10px; padding:2px; font-family:monospace;">
      ${opOptions}
    </select>
    <input type="text" class="chk-val-input inspector-input" value="${escapeHtml(
      check.value !== undefined ? String(check.value) : 'true'
    )}" placeholder="值" style="font-size:10px; padding:2px 4px; box-sizing:border-box; font-family:monospace;" />
    <button class="mini-btn danger-btn btn-del-check" style="padding:2px 4px;" title="删除此规则">×</button>
  `;

  row.querySelector('.chk-trig-select')?.addEventListener('change', (e) => {
    const v = (e.target as HTMLSelectElement).value;
    onUpdate((chk) => {
      chk.conditionId = v;
    });
  });
  row.querySelector('.chk-op-select')?.addEventListener('change', (e) => {
    const v = (e.target as HTMLSelectElement).value as NonNullable<ConditionCheck['op']>;
    onUpdate((chk) => {
      chk.op = v;
    });
  });
  bindInput(row, '.chk-val-input', (v) => {
    let val: string | number | boolean = v;
    if (v === 'true') val = true;
    else if (v === 'false') val = false;
    else if (!isNaN(Number(v)) && v.trim() !== '') val = Number(v);
    onUpdate(
      (chk) => {
        chk.value = val;
      },
      `chk_val_${curCondId}`
    );
  });
  row.querySelector('.btn-del-check')?.addEventListener('click', onDelete);

  return row;
}
