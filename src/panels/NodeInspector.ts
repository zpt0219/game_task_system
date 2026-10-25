import {
  Branch,
  ChoiceOption,
  ChoiceStep,
  CmpCond,
  EventDef,
  SayStep,
  SetStep,
  AddStep,
  Step,
  TriggerDef,
  VarDef
} from '../core/types';
import { project, uid } from '../core/project';
import { appState } from '../core/state';
import { evalCond, evalTrigger, matchBranch, runEvent } from '../core/engine';
import { varWriters, varReaders, eventsControlledBy, varsWrittenBy } from '../core/graph';
import { RpgDialog } from './RpgDialog';

export class NodeInspector {
  private container: HTMLElement;

  constructor(private dialog: RpgDialog) {
    this.container = document.getElementById('inspectorContent') as HTMLElement;

    appState.onSelectionChange(() => this.render());
    appState.onStateChange(() => this.render());
    appState.onModeChange(() => this.render());
    project.onChange((source) => {
      // 避免输入框敲字时整个面板被重置破坏焦点
      if (source !== 'field' && source !== 'drag') {
        this.render();
      }
    });

    this.render();
  }

  public render(): void {
    const sel = appState.getSelection();
    this.container.innerHTML = '';

    if (!sel) {
      this.renderEmpty();
      return;
    }

    if (sel.kind === 'event') {
      const ev = project.getEvent(sel.id);
      if (ev) this.renderEventInspector(ev);
      else this.renderEmpty();
    } else if (sel.kind === 'trigger') {
      const tr = project.getTrigger(sel.id);
      if (tr) this.renderTriggerInspector(tr);
      else this.renderEmpty();
    } else if (sel.kind === 'var') {
      const v = project.getVar(sel.id);
      if (v) this.renderVarInspector(v);
      else this.renderEmpty();
    }
  }

  // ------------------------------------------------------------------ 空白提示

  private renderEmpty(): void {
    const p = project.get();
    this.container.innerHTML = `
      <div class="empty-inspector">
        <div style="font-size: 38px; margin-bottom: 10px; opacity: 0.7;">🔮</div>
        <div style="font-size: 14px; font-weight: 700; color: #f3f4f6; margin-bottom: 6px;">
          任务图谱总览态
        </div>
        <div style="font-size: 12px; color: #9ca3af; line-height: 1.6; text-align: center; margin-bottom: 16px;">
          点击画布上的 <b>Event</b> 或 <b>Trigger</b> 节点可检视与编辑；<br/>
          也可点击左侧栏的 <b>人物/道具/传送点</b> 查看其专属因果图谱。
        </div>

        <div style="width: 100%; background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 12px; font-size: 12px; color: #cbd5e1;">
          <div style="font-weight: 700; color: #38bdf8; margin-bottom: 8px;">📊 项目当前统计</div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span>💬 Event 可触发交互节点：</span>
            <b>${p.events.length} 个</b>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span>⚡ Trigger 条件判断器：</span>
            <b>${p.triggers.length} 个</b>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span>🎒 注册变量 / 道具 / 状态：</span>
            <b>${p.vars.length} 个</b>
          </div>
        </div>

        <div style="margin-top: 16px; font-size: 11px; color: #64748b; line-height: 1.5; text-align: center;">
          💡 快捷技巧：在画布空白区域<b>单击右键</b>即可在光标位置新建 Event 或 Trigger。
        </div>
      </div>
    `;
  }

  // ------------------------------------------------------------------ Event 节点编辑

  private renderEventInspector(ev: EventDef): void {
    const p = project.get();
    const state = appState.getState();
    const activeBranch = matchBranch(p, state, ev);

    // 1. 基础信息卡片
    const metaCard = document.createElement('div');
    metaCard.className = 'inspector-section';
    metaCard.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span class="event-type-badge">EVENT 节点</span>
        <button id="btnDeleteEvent" class="danger-btn mini-btn" title="删除此 Event 节点" style="padding: 2px 8px; font-size: 11px;">
          🗑️ 删除
        </button>
      </div>

      <div class="inspector-label">节点标题 (Title)</div>
      <input type="text" id="evTitle" class="inspector-input" value="${this.escape(ev.title)}" style="margin-bottom: 8px;" />

      <div class="inspector-label">代码绑定标识 (sourceRef，对应 Godot 脚本)</div>
      <input type="text" id="evSourceRef" class="inspector-input" value="${this.escape(ev.sourceRef || '')}" placeholder="例: king_conversation" style="margin-bottom: 8px; font-family: monospace; font-size: 11px;" />

      <div class="inspector-label">功能描述 (Desc)</div>
      <textarea id="evDesc" class="inspector-textarea" style="height: 52px;">${this.escape(ev.desc || '')}</textarea>
    `;
    this.container.appendChild(metaCard);

    this.bindInput(metaCard, '#evTitle', (v) => {
      ev.title = v;
      project.change(() => {}, 'field', `ev_title_${ev.id}`);
    });
    this.bindInput(metaCard, '#evSourceRef', (v) => {
      ev.sourceRef = v;
      project.change(() => {}, 'field');
    });
    this.bindInput(metaCard, '#evDesc', (v) => {
      ev.desc = v;
      project.change(() => {}, 'field');
    });

    const btnDel = metaCard.querySelector('#btnDeleteEvent') as HTMLElement;
    btnDel.onclick = () => {
      if (confirm(`确定要删除 Event 节点「${ev.title}」吗？`)) {
        project.deleteEvent(ev.id);
        appState.select(null);
        appState.log(`🗑️ 已删除 Event 节点：[${ev.title}]`);
      }
    };

    // 2. 试玩快速执行按钮
    const playCard = document.createElement('div');
    playCard.className = 'inspector-section';
    playCard.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
        <span style="font-size: 11px; color: #94a3b8;">当前匹配分支：</span>
        <span class="event-status-pill ${activeBranch ? 'status-green' : 'status-red'}" style="font-size: 11px;">
          ${activeBranch ? activeBranch.title : '无匹配分支'}
        </span>
      </div>
      <button id="btnPlayEvent" class="dialog-btn primary-btn" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 8px;">
        <span>▶</span> 触发执行 (Play ActionSequence)
      </button>
    `;
    this.container.appendChild(playCard);

    playCard.querySelector('#btnPlayEvent')?.addEventListener('click', () => {
      runEvent(
        {
          project: project.get(),
          getState: () => appState.getState(),
          mutate: (fn) => appState.mutate(fn),
          showDialog: (cfg) => this.dialog.show(cfg),
          log: (msg, hl) => appState.log(msg, hl)
        },
        ev
      );
    });

    // 3. 连入的 Trigger 管理 (输入信号)
    const incomingTrigIds = ev.incomingTriggers ?? Array.from(new Set(ev.branches.flatMap((b) => b.when)));
    const trigCard = document.createElement('div');
    trigCard.className = 'inspector-section';
    trigCard.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <div class="inspector-label" style="margin-bottom: 0;">
          ⚡ 连入的 Trigger (输入信号：${incomingTrigIds.length})
        </div>
        <button id="btnConnectTrig" class="mini-btn-action" style="padding: 2px 8px; font-size: 11px;">
          + 连入 Trigger
        </button>
      </div>
      <div id="incomingTrigsContainer" style="display: flex; flex-wrap: wrap; gap: 6px;">
        ${
          incomingTrigIds.length === 0
            ? '<div style="font-size: 11px; color: #64748b; padding: 2px 0;">💡 暂无连入 Trigger (此 Event 仅执行默认行为)</div>'
            : incomingTrigIds
                .map((tid) => {
                  const trig = p.triggers.find((t) => t.id === tid);
                  const title = trig ? trig.title.replace('⚡ trigger: ', '') : tid;
                  return `
              <span style="display: inline-flex; align-items: center; gap: 4px; font-size: 11px; background: #1e293b; border: 1px solid #38bdf8; color: #38bdf8; border-radius: 4px; padding: 2px 6px;">
                <span>⚡ ${this.escape(title)}</span>
                <button class="btn-disconnect-trig" data-tid="${tid}" style="background: none; border: none; color: #f87171; cursor: pointer; font-size: 13px; font-weight: bold; padding: 0 2px; line-height: 1;" title="断开连线">×</button>
              </span>
            `;
                })
                .join('')
        }
      </div>
    `;
    this.container.appendChild(trigCard);

    // 绑定连入 Trigger
    trigCard.querySelector('#btnConnectTrig')?.addEventListener('click', () => {
      const available = p.triggers.filter((t) => !incomingTrigIds.includes(t.id));
      if (available.length === 0) {
        alert('项目中暂无更多可连入的 Trigger！');
        return;
      }
      const names = available.map((t, idx) => `${idx + 1}. ${t.title.replace('⚡ trigger: ', '')}`).join('\n');
      const input = prompt(`请选择要连入此 Event 的 Trigger (输入序号 1~${available.length})：\n\n${names}`);
      if (!input) return;
      const idx = parseInt(input.trim(), 10) - 1;
      if (idx >= 0 && idx < available.length) {
        const chosen = available[idx];
        project.change((d) => {
          const targetEv = d.events.find((x) => x.id === ev.id);
          if (targetEv) {
            if (!targetEv.incomingTriggers) targetEv.incomingTriggers = [...incomingTrigIds];
            if (!targetEv.incomingTriggers.includes(chosen.id)) {
              targetEv.incomingTriggers.push(chosen.id);
            }
          }
        }, 'structure');
      }
    });

    // 绑定断开 Trigger
    trigCard.querySelectorAll('.btn-disconnect-trig').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tid = (btn as HTMLElement).dataset.tid;
        if (!tid) return;
        project.change((d) => {
          const targetEv = d.events.find((x) => x.id === ev.id);
          if (targetEv) {
            targetEv.incomingTriggers = (targetEv.incomingTriggers ?? incomingTrigIds).filter((t) => t !== tid);
            targetEv.branches.forEach((b) => {
              b.when = b.when.filter((w) => w !== tid);
            });
          }
        }, 'structure');
      });
    });

    // 4. ActionSequence 分支列表
    const branchesCard = document.createElement('div');
    branchesCard.className = 'inspector-section';
    branchesCard.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 10px;">
        <div class="inspector-label" style="margin-bottom: 0; white-space: nowrap; font-size: 12px; font-weight: 700;">
          ActionSequence 分支 (${ev.branches.length} 项)
        </div>
        <div style="display: flex; gap: 6px; flex-shrink: 0;">
          ${
            incomingTrigIds.length > 0
              ? `<button id="btnAddCondBranch" class="mini-btn-action">+ 条件行为</button>`
              : ''
          }
          <button id="btnAddDefaultBranch" class="mini-btn">+ 默认行为</button>
        </div>
      </div>
      <div id="branchesContainer"></div>
    `;
    this.container.appendChild(branchesCard);

    branchesCard.querySelector('#btnAddCondBranch')?.addEventListener('click', () => {
      project.change((d) => {
        const targetEv = d.events.find((x) => x.id === ev.id);
        if (targetEv) {
          targetEv.branches.unshift({
            id: uid('b'),
            title: `条件行为 ${targetEv.branches.length + 1}`,
            when: incomingTrigIds.length > 0 ? [incomingTrigIds[0]] : [],
            steps: [{ type: 'say', speaker: '旁白', avatar: '💬', text: '在此编写条件触发台词...', button: '继续' }]
          });
        }
      }, 'structure');
    });

    branchesCard.querySelector('#btnAddDefaultBranch')?.addEventListener('click', () => {
      project.change((d) => {
        const targetEv = d.events.find((x) => x.id === ev.id);
        if (targetEv) {
          targetEv.branches.push({
            id: uid('b'),
            title: `默认行为`,
            when: [],
            steps: [{ type: 'say', speaker: '旁白', avatar: '💬', text: '在此编写默认台词...', button: '继续' }]
          });
        }
      }, 'structure');
    });

    const bContainer = branchesCard.querySelector('#branchesContainer') as HTMLElement;
    ev.branches.forEach((b, bIdx) => {
      const bEl = this.renderBranchCard(ev, b, bIdx, activeBranch?.id === b.id, incomingTrigIds);
      bContainer.appendChild(bEl);
    });

    // 5. 关联影响摘要
    const relCard = document.createElement('div');
    relCard.className = 'inspector-section';
    const writtenKeys = varsWrittenBy(p, ev);
    relCard.innerHTML = `
      <div class="inspector-label">关联改写状态 (写入数据)</div>
      ${
        writtenKeys.length === 0
          ? '<div style="color: #64748b; font-size: 11px;">此 Event 未直接修改任何全局数据/道具</div>'
          : writtenKeys
              .map((k) => {
                const v = p.vars.find((x) => x.key === k);
                return `
              <div style="display: flex; justify-content: space-between; align-items: center; background: #0b0d17; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 6px; padding: 7px 10px; margin-bottom: 6px; gap: 8px;">
                <div style="display: flex; align-items: center; gap: 6px; min-width: 0; overflow: hidden;">
                  <span style="font-size: 14px; flex-shrink: 0;">${v ? v.icon : '📝'}</span>
                  <span style="font-weight: 600; font-size: 12px; color: #f8fafc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${v ? v.label : k}</span>
                  <span style="color: #64748b; font-size: 10px; font-family: var(--font-mono); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">(${k})</span>
                </div>
                <button class="mini-btn btn-view-var" data-key="${k}" style="font-size: 11px; padding: 3px 8px; background: rgba(56, 189, 248, 0.1); border-color: rgba(56, 189, 248, 0.3); color: #38bdf8; white-space: nowrap; flex-shrink: 0;">专属图谱 ▶</button>
              </div>
            `;
              })
              .join('')
      }
    `;
    this.container.appendChild(relCard);

    relCard.querySelectorAll('.btn-view-var').forEach((btn) => {
      (btn as HTMLElement).onclick = () => {
        const key = (btn as HTMLElement).dataset.key;
        if (key) appState.setFocalVar(key);
      };
    });
  }

  private renderBranchCard(
    ev: EventDef,
    b: Branch,
    bIdx: number,
    isActive: boolean,
    incomingTrigIds: string[]
  ): HTMLElement {
    const p = project.get();
    const isDefaultBranch = b.when.length === 0;
    const card = document.createElement('div');
    card.className = `branch-card ${isActive ? 'active-branch' : ''}`;
    card.style.cssText = `
      background: #0f172a;
      border: 1px solid ${isActive ? '#10b981' : '#334155'};
      border-radius: 8px;
      padding: 10px;
      margin-bottom: 10px;
      box-shadow: ${isActive ? '0 0 10px rgba(16, 185, 129, 0.25)' : 'none'};
    `;

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 8px;">
        <div style="display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0;">
          <span style="font-size: 11px; color: ${isActive ? '#10b981' : '#64748b'}; font-weight: 700; flex-shrink: 0;">#${bIdx + 1}</span>
          <input type="text" class="branch-title-input" value="${this.escape(b.title)}" placeholder="分支标题" style="flex: 1; min-width: 0; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; padding: 4px 8px; color: #f8fafc; font-size: 13px; font-weight: 700; outline: none;" />
        </div>
        <div style="display: flex; gap: 4px; flex-shrink: 0;">
          <button class="mini-btn btn-move-up" title="上移" ${bIdx === 0 ? 'disabled' : ''}>↑</button>
          <button class="mini-btn btn-move-down" title="下移" ${bIdx === ev.branches.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="mini-btn danger-btn btn-del-branch" title="删除分支">×</button>
        </div>
      </div>

      <!-- 触发条件 / 默认行为展示 -->
      ${
        isDefaultBranch
          ? `
        <div style="font-size: 11px; color: #10b981; background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 6px; padding: 6px 8px; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between; gap: 6px;">
          <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
            <span style="flex-shrink: 0;">🛡️</span>
            <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"><b>默认行为</b> (无前置条件 / 保底执行)</span>
          </div>
          ${
            incomingTrigIds.length > 0
              ? `<button class="mini-btn btn-turn-into-cond" style="font-size: 10px; padding: 1px 6px; white-space: nowrap; flex-shrink: 0;">转为条件行为</button>`
              : ''
          }
        </div>
      `
          : `
        <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(56, 189, 248, 0.2); border-radius: 6px; padding: 6px 8px; margin-bottom: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; gap: 6px;">
            <div style="font-size: 10px; font-weight: 700; color: #38bdf8; text-transform: uppercase; white-space: nowrap;">
              ⚡ 触发条件 (需满足勾选的连入 Trigger)
            </div>
            <button class="mini-btn btn-turn-into-default" style="font-size: 10px; padding: 1px 6px; white-space: nowrap; flex-shrink: 0;">转为默认行为</button>
          </div>
          <div class="branch-triggers-wrap" style="display: flex; flex-wrap: wrap; gap: 6px;">
            ${
              incomingTrigIds.length === 0
                ? '<span style="font-size: 10px; color: #64748b;">当前无连入 Trigger，请在上方为该 Event 添加连入 Trigger</span>'
                : incomingTrigIds
                    .map((tid) => {
                      const t = p.triggers.find((x) => x.id === tid);
                      const checked = b.when.includes(tid);
                      const title = t ? t.title.replace('⚡ trigger: ', '') : tid;
                      return `
                  <label style="display: inline-flex; align-items: center; gap: 4px; font-size: 11px; background: ${checked ? '#1e293b' : 'transparent'}; border: 1px solid ${checked ? '#38bdf8' : '#334155'}; border-radius: 4px; padding: 2px 6px; cursor: pointer; color: ${checked ? '#38bdf8' : '#94a3b8'};">
                    <input type="checkbox" class="chk-trigger" data-tid="${tid}" ${checked ? 'checked' : ''} style="margin: 0; cursor: pointer;" />
                    <span>${this.escape(title)}</span>
                  </label>
                `;
                    })
                    .join('')
            }
          </div>
        </div>
      `
      }

      <!-- 步骤列表 -->
      <div class="steps-container"></div>

      <!-- 添加步骤工具条 (网格 4 列排列，绝不折行成单字) -->
      <div class="step-add-toolbar">
        <button class="step-add-pill btn-add-step" data-type="say">💬 对话</button>
        <button class="step-add-pill btn-add-step" data-type="choice">🔀 选项</button>
        <button class="step-add-pill btn-add-step" data-type="set">📝 赋值</button>
        <button class="step-add-pill btn-add-step" data-type="add">➕ 增减</button>
      </div>
    `;

    // 绑定分支类型转换
    card.querySelector('.btn-turn-into-default')?.addEventListener('click', () => {
      project.change((d) => {
        const targetEv = d.events.find((x) => x.id === ev.id);
        const targetB = targetEv?.branches.find((x) => x.id === b.id);
        if (targetB) {
          targetB.when = [];
        }
      }, 'structure');
    });

    card.querySelector('.btn-turn-into-cond')?.addEventListener('click', () => {
      if (incomingTrigIds.length > 0) {
        project.change((d) => {
          const targetEv = d.events.find((x) => x.id === ev.id);
          const targetB = targetEv?.branches.find((x) => x.id === b.id);
          if (targetB) {
            targetB.when = [incomingTrigIds[0]];
          }
        }, 'structure');
      }
    });

    // 绑定分支标题修改
    const titleInp = card.querySelector('.branch-title-input') as HTMLInputElement;
    titleInp.oninput = () => {
      b.title = titleInp.value;
      project.change(() => {}, 'field', `b_title_${b.id}`);
    };

    // 分支上下移动与删除
    card.querySelector('.btn-move-up')?.addEventListener('click', () => {
      if (bIdx > 0) {
        project.change((d) => {
          const targetEv = d.events.find((x) => x.id === ev.id);
          if (targetEv) {
            const temp = targetEv.branches[bIdx];
            targetEv.branches[bIdx] = targetEv.branches[bIdx - 1];
            targetEv.branches[bIdx - 1] = temp;
          }
        }, 'structure');
      }
    });

    card.querySelector('.btn-move-down')?.addEventListener('click', () => {
      if (bIdx < ev.branches.length - 1) {
        project.change((d) => {
          const targetEv = d.events.find((x) => x.id === ev.id);
          if (targetEv) {
            const temp = targetEv.branches[bIdx];
            targetEv.branches[bIdx] = targetEv.branches[bIdx + 1];
            targetEv.branches[bIdx + 1] = temp;
          }
        }, 'structure');
      }
    });

    card.querySelector('.btn-del-branch')?.addEventListener('click', () => {
      if (confirm(`确定删除分支「${b.title}」吗？`)) {
        project.change((d) => {
          const targetEv = d.events.find((x) => x.id === ev.id);
          if (targetEv) {
            targetEv.branches = targetEv.branches.filter((x) => x.id !== b.id);
          }
        }, 'structure');
      }
    });

    // 勾选 Trigger 依赖
    card.querySelectorAll('.chk-trigger').forEach((chk) => {
      chk.addEventListener('change', () => {
        const tid = (chk as HTMLElement).dataset.tid;
        if (!tid) return;
        project.change((d) => {
          const targetEv = d.events.find((x) => x.id === ev.id);
          const targetB = targetEv?.branches.find((x) => x.id === b.id);
          if (targetB) {
            const isChecked = (chk as HTMLInputElement).checked;
            if (isChecked && !targetB.when.includes(tid)) {
              targetB.when.push(tid);
            } else if (!isChecked) {
              targetB.when = targetB.when.filter((w) => w !== tid);
            }
          }
        }, 'structure');
      });
    });

    // 渲染步骤
    const stepsCont = card.querySelector('.steps-container') as HTMLElement;
    b.steps.forEach((st, stIdx) => {
      const stEl = this.renderStepCard(ev, b, st, stIdx);
      stepsCont.appendChild(stEl);
    });

    // 添加步骤
    card.querySelectorAll('.btn-add-step').forEach((btn) => {
      btn.addEventListener('click', () => {
        const type = (btn as HTMLElement).dataset.type;
        project.change((d) => {
          const targetEv = d.events.find((x) => x.id === ev.id);
          const targetB = targetEv?.branches.find((x) => x.id === b.id);
          if (!targetB) return;
          if (type === 'say') {
            targetB.steps.push({ type: 'say', speaker: '旁白', avatar: '💬', text: '新台词...', button: '继续' });
          } else if (type === 'choice') {
            targetB.steps.push({
              type: 'choice',
              speaker: 'NPC',
              avatar: '💬',
              text: '请做出选择：',
              options: [
                { text: '选项 A', style: 'primary', steps: [] },
                { text: '选项 B', style: 'secondary', steps: [] }
              ]
            });
          } else if (type === 'set') {
            const first = d.vars[0];
            targetB.steps.push({ type: 'set', var: first ? first.key : 'items.book', value: true });
          } else if (type === 'add') {
            const gold = d.vars.find((v) => v.kind === 'number') || d.vars[0];
            targetB.steps.push({ type: 'add', var: gold ? gold.key : 'hero.gold', amount: 10 });
          }
        }, 'structure');
      });
    });

    return card;
  }

  // ------------------------------------------------------------------ 步骤编辑组件

  private renderStepCard(ev: EventDef, b: Branch, s: Step, sIdx: number): HTMLElement {
    const card = document.createElement('div');
    card.className = 'step-card';

    const typeIcons: Record<string, string> = {
      say: '💬 对话',
      choice: '🔀 选项',
      set: '📝 赋值',
      add: '➕ 增减'
    };

    let innerForm = '';
    const p = project.get();

    if (s.type === 'say') {
      const say = s as SayStep;
      innerForm = `
        <div style="display: grid; grid-template-columns: 42px 1fr 1fr; gap: 6px; margin-bottom: 6px;">
          <input type="text" class="say-avatar" value="${this.escape(say.avatar || '💬')}" title="头像 Emoji" style="text-align: center; font-size: 15px;" />
          <input type="text" class="say-speaker" value="${this.escape(say.speaker)}" placeholder="说话人姓名" />
          <input type="text" class="say-title" value="${this.escape(say.speakerTitle || '')}" placeholder="身份/头衔 (可选)" />
        </div>
        <textarea class="say-text" placeholder="输入对话台词内容..." style="width: 100%; height: 56px; resize: vertical; margin-bottom: 6px; line-height: 1.4; padding: 6px 8px; font-size: 12px;">${this.escape(say.text)}</textarea>
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
          <span style="font-size: 11px; color: #94a3b8; flex-shrink: 0;">确认按钮文案：</span>
          <input type="text" class="say-btn" value="${this.escape(say.button || '继续')}" placeholder="确认/继续" style="flex: 1; max-width: 140px; padding: 4px 8px; font-size: 11px;" />
        </div>
      `;
    } else if (s.type === 'set') {
      const set = s as SetStep;
      innerForm = `
        <div style="display: grid; grid-template-columns: 1fr 20px 100px; gap: 6px; align-items: center; margin-bottom: 4px;">
          <select class="set-var" style="width: 100%; min-width: 0; padding: 5px 6px; font-size: 11px;">
            ${p.vars
              .map((v) => `<option value="${v.key}" ${v.key === set.var ? 'selected' : ''}>${v.icon} ${v.label}</option>`)
              .join('')}
          </select>
          <span style="text-align: center; color: #38bdf8; font-weight: 700; font-size: 13px;">=</span>
          <input type="text" class="set-val" value="${this.escape(set.from ? `from:${set.from}` : String(set.value ?? ''))}" placeholder="true / 数值" style="width: 100%; min-width: 0; padding: 5px 6px; font-size: 11px; font-family: var(--font-mono);" />
        </div>
        <div style="font-size: 10px; color: #64748b; margin-top: 2px;">💡 可直接填 true/数值，或 from:hero.maxHp 动态读取</div>
      `;
    } else if (s.type === 'add') {
      const add = s as AddStep;
      innerForm = `
        <div style="display: grid; grid-template-columns: 1fr 20px 90px; gap: 6px; align-items: center; margin-bottom: 4px;">
          <select class="add-var" style="width: 100%; min-width: 0; padding: 5px 6px; font-size: 11px;">
            ${p.vars
              .filter((v) => v.kind === 'number')
              .map((v) => `<option value="${v.key}" ${v.key === add.var ? 'selected' : ''}>${v.icon} ${v.label}</option>`)
              .join('')}
          </select>
          <span style="text-align: center; color: #10b981; font-weight: 700; font-size: 13px;">+=</span>
          <input type="number" class="add-amount" value="${add.amount}" placeholder="数值" style="width: 100%; min-width: 0; padding: 5px 6px; font-size: 11px; font-family: var(--font-mono);" />
        </div>
      `;
    } else if (s.type === 'choice') {
      const ch = s as ChoiceStep;
      innerForm = `
        <div style="display: grid; grid-template-columns: 42px 1fr; gap: 6px; margin-bottom: 6px;">
          <input type="text" class="choice-avatar" value="${this.escape(ch.avatar || '💬')}" title="头像 Emoji" style="text-align: center; font-size: 15px;" />
          <input type="text" class="choice-speaker" value="${this.escape(ch.speaker)}" placeholder="说话人姓名" />
        </div>
        <textarea class="choice-text" placeholder="选项提示文案..." style="width: 100%; height: 44px; resize: vertical; margin-bottom: 6px; line-height: 1.4; padding: 6px 8px; font-size: 12px;">${this.escape(ch.text)}</textarea>
        <div style="font-size: 10px; font-weight: 700; color: #c4b5fd; margin-bottom: 4px;">选项列表 (${ch.options.length})</div>
        <div class="choice-options-list">
          ${ch.options
            .map(
              (opt, oIdx) => `
            <div style="display: flex; gap: 6px; align-items: center; margin-bottom: 6px; font-size: 11px;">
              <span style="color: #64748b; font-weight: 700; flex-shrink: 0;">${oIdx + 1}.</span>
              <input type="text" class="opt-text" data-oidx="${oIdx}" value="${this.escape(opt.text)}" placeholder="选项文案" style="flex: 1; min-width: 0; padding: 4px 6px; font-size: 11px;" />
              <select class="opt-style" data-oidx="${oIdx}" style="width: 75px; flex-shrink: 0; font-size: 10px; padding: 3px;">
                <option value="primary" ${opt.style === 'primary' ? 'selected' : ''}>主要(蓝)</option>
                <option value="secondary" ${opt.style === 'secondary' ? 'selected' : ''}>次要(灰)</option>
                <option value="danger" ${opt.style === 'danger' ? 'selected' : ''}>危险(红)</option>
              </select>
            </div>
          `
            )
            .join('')}
        </div>
      `;
    }

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; border-bottom: 1px solid rgba(255, 255, 255, 0.06); padding-bottom: 4px;">
        <span style="font-size: 11px; font-weight: 700; color: #f59e0b; display: flex; align-items: center; gap: 4px;">${typeIcons[s.type] || s.type}</span>
        <div style="display: flex; gap: 3px; flex-shrink: 0;">
          <button class="mini-btn btn-step-up" ${sIdx === 0 ? 'disabled' : ''}>↑</button>
          <button class="mini-btn btn-step-down" ${sIdx === b.steps.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="mini-btn danger-btn btn-del-step">×</button>
        </div>
      </div>
      ${innerForm}
    `;

    // 绑定字段变化
    if (s.type === 'say') {
      const say = s as SayStep;
      this.bindInput(card, '.say-avatar', (v) => {
        say.avatar = v;
        project.change(() => {}, 'field');
      });
      this.bindInput(card, '.say-speaker', (v) => {
        say.speaker = v;
        project.change(() => {}, 'field');
      });
      this.bindInput(card, '.say-title', (v) => {
        say.speakerTitle = v;
        project.change(() => {}, 'field');
      });
      this.bindInput(card, '.say-text', (v) => {
        say.text = v;
        project.change(() => {}, 'field');
      });
      this.bindInput(card, '.say-btn', (v) => {
        say.button = v;
        project.change(() => {}, 'field');
      });
    } else if (s.type === 'set') {
      const set = s as SetStep;
      const selVar = card.querySelector('.set-var') as HTMLSelectElement;
      selVar.onchange = () => {
        set.var = selVar.value;
        project.change(() => {}, 'field');
      };
      const inpVal = card.querySelector('.set-val') as HTMLInputElement;
      inpVal.oninput = () => {
        const txt = inpVal.value.trim();
        if (txt.startsWith('from:')) {
          set.from = txt.slice(5).trim();
          delete set.value;
        } else if (txt === 'true') {
          set.value = true;
          delete set.from;
        } else if (txt === 'false') {
          set.value = false;
          delete set.from;
        } else if (!isNaN(Number(txt)) && txt !== '') {
          set.value = Number(txt);
          delete set.from;
        } else {
          set.value = txt;
          delete set.from;
        }
        project.change(() => {}, 'field');
      };
    } else if (s.type === 'add') {
      const add = s as AddStep;
      const selVar = card.querySelector('.add-var') as HTMLSelectElement;
      selVar.onchange = () => {
        add.var = selVar.value;
        project.change(() => {}, 'field');
      };
      const inpAmt = card.querySelector('.add-amount') as HTMLInputElement;
      inpAmt.oninput = () => {
        add.amount = Number(inpAmt.value) || 0;
        project.change(() => {}, 'field');
      };
    } else if (s.type === 'choice') {
      const ch = s as ChoiceStep;
      this.bindInput(card, '.choice-avatar', (v) => {
        ch.avatar = v;
        project.change(() => {}, 'field');
      });
      this.bindInput(card, '.choice-speaker', (v) => {
        ch.speaker = v;
        project.change(() => {}, 'field');
      });
      this.bindInput(card, '.choice-text', (v) => {
        ch.text = v;
        project.change(() => {}, 'field');
      });
      card.querySelectorAll('.opt-text').forEach((inp) => {
        inp.addEventListener('input', () => {
          const idx = Number((inp as HTMLElement).dataset.oidx);
          if (ch.options[idx]) {
            ch.options[idx].text = (inp as HTMLInputElement).value;
            project.change(() => {}, 'field');
          }
        });
      });
      card.querySelectorAll('.opt-style').forEach((sel) => {
        sel.addEventListener('change', () => {
          const idx = Number((sel as HTMLElement).dataset.oidx);
          if (ch.options[idx]) {
            ch.options[idx].style = (sel as HTMLSelectElement).value as ChoiceOption['style'];
            project.change(() => {}, 'field');
          }
        });
      });
    }

    // 步骤排序与删除
    card.querySelector('.btn-step-up')?.addEventListener('click', () => {
      if (sIdx > 0) {
        project.change((d) => {
          const targetEv = d.events.find((x) => x.id === ev.id);
          const targetB = targetEv?.branches.find((x) => x.id === b.id);
          if (targetB) {
            const temp = targetB.steps[sIdx];
            targetB.steps[sIdx] = targetB.steps[sIdx - 1];
            targetB.steps[sIdx - 1] = temp;
          }
        }, 'structure');
      }
    });

    card.querySelector('.btn-step-down')?.addEventListener('click', () => {
      if (sIdx < b.steps.length - 1) {
        project.change((d) => {
          const targetEv = d.events.find((x) => x.id === ev.id);
          const targetB = targetEv?.branches.find((x) => x.id === b.id);
          if (targetB) {
            const temp = targetB.steps[sIdx];
            targetB.steps[sIdx] = targetB.steps[sIdx + 1];
            targetB.steps[sIdx + 1] = temp;
          }
        }, 'structure');
      }
    });

    card.querySelector('.btn-del-step')?.addEventListener('click', () => {
      project.change((d) => {
        const targetEv = d.events.find((x) => x.id === ev.id);
        const targetB = targetEv?.branches.find((x) => x.id === b.id);
        if (targetB) {
          targetB.steps.splice(sIdx, 1);
        }
      }, 'structure');
    });

    return card;
  }

  // ------------------------------------------------------------------ Trigger 节点编辑

  private renderTriggerInspector(tr: TriggerDef): void {
    const p = project.get();
    const state = appState.getState();
    const isSatisfied = evalTrigger(p, state, tr);
    const controlledEvents = eventsControlledBy(p, tr.id);

    // 1. 基础信息卡片
    const metaCard = document.createElement('div');
    metaCard.className = 'inspector-section';
    metaCard.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span class="event-type-badge" style="background:#312e81; color:#c7d2fe;">TRIGGER 判断器</span>
        <button id="btnDeleteTrigger" class="danger-btn mini-btn" title="删除此 Trigger 节点" style="padding: 2px 8px; font-size: 11px;">
          🗑️ 删除
        </button>
      </div>

      <div class="inspector-label">标题 (Title)</div>
      <input type="text" id="trTitle" class="inspector-input" value="${this.escape(tr.title)}" style="margin-bottom: 8px;" />

      <div class="inspector-label">描述 (Desc)</div>
      <textarea id="trDesc" class="inspector-textarea" style="height: 48px; margin-bottom: 8px;">${this.escape(tr.desc || '')}</textarea>

      <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; background: #0f172a; border: 1px solid #334155; border-radius: 6px;">
        <span style="font-size: 11px; color: #94a3b8;">当前实时求值状态：</span>
        <span class="event-status-pill ${isSatisfied ? 'status-green' : 'status-grey'}" style="font-size: 11px;">
          ${isSatisfied ? '● 满足 (TRUE)' : '○ 未满足 (FALSE)'}
        </span>
      </div>
    `;
    this.container.appendChild(metaCard);

    this.bindInput(metaCard, '#trTitle', (v) => {
      tr.title = v;
      project.change(() => {}, 'field', `tr_title_${tr.id}`);
    });
    this.bindInput(metaCard, '#trDesc', (v) => {
      tr.desc = v;
      project.change(() => {}, 'field');
    });

    const btnDel = metaCard.querySelector('#btnDeleteTrigger') as HTMLElement;
    btnDel.onclick = () => {
      const refs = project.findTriggerRefs(tr.id);
      if (refs.length > 0) {
        const names = refs.map((r) => `「${r.event.title} - ${r.branch.title}」`).join('\n');
        if (!confirm(`该 Trigger 正在被以下 ${refs.length} 个 Event 分支引用：\n${names}\n\n确认删除吗？（删除后将一并从这些分支中移除该前置条件）`)) {
          return;
        }
      } else if (!confirm(`确定要删除 Trigger 节点「${tr.title}」吗？`)) {
        return;
      }
      project.deleteTrigger(tr.id);
      appState.select(null);
      appState.log(`🗑️ 已删除 Trigger 节点：[${tr.title}]`);
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
    this.container.appendChild(condCard);

    condCard.querySelector('#trMatch')?.addEventListener('change', (e) => {
      tr.match = (e.target as HTMLSelectElement).value as 'all' | 'any';
      project.change(() => {}, 'field');
    });

    condCard.querySelector('#btnAddCond')?.addEventListener('click', () => {
      const first = p.vars[0];
      if (!first) return;
      project.change((d) => {
        const targetTr = d.triggers.find((x) => x.id === tr.id);
        if (targetTr) {
          targetTr.conds.push({
            var: first.key,
            op: '==',
            value: first.kind === 'bool' ? true : first.initial
          });
        }
      }, 'structure');
    });

    const cList = condCard.querySelector('#condsList') as HTMLElement;
    tr.conds.forEach((c, cIdx) => {
      const cEl = this.renderCondItem(tr, c, cIdx);
      cList.appendChild(cEl);
    });

    // 3. 受控 Event 列表
    const controlledCard = document.createElement('div');
    controlledCard.className = 'inspector-section';
    controlledCard.innerHTML = `
      <div class="inspector-label" style="color: #38bdf8;">
        📤 改变行为的 Event 列表 (${controlledEvents.length} 个)
      </div>
      <div style="font-size: 11px; color: #94a3b8; margin-bottom: 6px;">
        顶层大图中，此 Trigger 将以流光箭头指向以下 Event 改变其执行行为：
      </div>
      ${
        controlledEvents.length === 0
          ? '<div style="color: #64748b; font-size: 11px;">暂无 Event 分支引用此 Trigger</div>'
          : controlledEvents
              .map(
                (ev) => `
            <div style="display: flex; justify-content: space-between; align-items: center; background: #0f172a; border: 1px solid #334155; border-radius: 6px; padding: 6px 8px; margin-bottom: 4px; font-size: 12px;">
              <span style="font-weight: 600; color: #f8fafc;">${ev.title}</span>
              <button class="mini-btn btn-goto-ev" data-id="${ev.id}" style="font-size: 10px; padding: 2px 6px;">前往查看 ▶</button>
            </div>
          `
              )
              .join('')
      }
    `;
    this.container.appendChild(controlledCard);

    controlledCard.querySelectorAll('.btn-goto-ev').forEach((btn) => {
      (btn as HTMLElement).onclick = () => {
        const id = (btn as HTMLElement).dataset.id;
        if (id) appState.select({ kind: 'event', id });
      };
    });
  }

  private renderCondItem(tr: TriggerDef, c: CmpCond, cIdx: number): HTMLElement {
    const p = project.get();
    const state = appState.getState();
    const isMet = evalCond(p, state, c);

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
        ${p.vars
          .map((v) => `<option value="${v.key}" ${v.key === c.var ? 'selected' : ''}>${v.icon} ${v.label}</option>`)
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

      <input type="text" class="cond-val" value="${this.escape(String(c.value))}" style="padding: 3px; font-size: 11px;" />

      <button class="mini-btn danger-btn btn-del-cond" style="padding: 2px 4px;">×</button>
    `;

    const selVar = row.querySelector('.cond-var') as HTMLSelectElement;
    selVar.onchange = () => {
      c.var = selVar.value;
      project.change(() => {}, 'field');
    };

    const selOp = row.querySelector('.cond-op') as HTMLSelectElement;
    selOp.onchange = () => {
      c.op = selOp.value as CmpCond['op'];
      project.change(() => {}, 'field');
    };

    const inpVal = row.querySelector('.cond-val') as HTMLInputElement;
    inpVal.oninput = () => {
      const txt = inpVal.value.trim();
      if (txt === 'true') c.value = true;
      else if (txt === 'false') c.value = false;
      else if (!isNaN(Number(txt)) && txt !== '') c.value = Number(txt);
      else c.value = txt;
      project.change(() => {}, 'field');
    };

    row.querySelector('.btn-del-cond')?.addEventListener('click', () => {
      project.change((d) => {
        const targetTr = d.triggers.find((x) => x.id === tr.id);
        if (targetTr) {
          targetTr.conds.splice(cIdx, 1);
        }
      }, 'structure');
    });

    return row;
  }

  // ------------------------------------------------------------------ Var / 道具实体详情

  private renderVarInspector(v: VarDef): void {
    const p = project.get();
    const state = appState.getState();
    const val = state[v.key];
    const writers = varWriters(p, v.key);
    const readers = varReaders(p, v.key);

    const card = document.createElement('div');
    card.className = 'inspector-section';
    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span class="event-type-badge" style="background:#065f46; color:#a7f3d0;">道具 / 状态变量</span>
        <span class="event-status-pill status-blue">当前值: ${val === undefined ? '∅' : String(val)}</span>
      </div>

      <div style="font-size: 16px; font-weight: 700; color: #fff; margin-bottom: 4px;">
        ${v.icon} ${this.escape(v.label)}
      </div>
      <div style="font-size: 11px; color: #64748b; font-family: monospace; margin-bottom: 8px;">
        key: ${v.key} · 类型: ${v.kind}
      </div>
      <div style="font-size: 12px; color: #94a3b8; line-height: 1.5; margin-bottom: 12px;">
        ${this.escape(v.desc || '该变量由游戏内 Event 执行改变，并在 Trigger 中被读取。')}
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
                .map((ev) => `<div style="background:#0f172a; padding:4px 8px; border-radius:4px; font-size:11px; margin-bottom:3px; color:#6ee7b7;">• ${ev.title}</div>`)
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
                .map((ev) => `<div style="background:#0f172a; padding:4px 8px; border-radius:4px; font-size:11px; margin-bottom:3px; color:#7dd3fc;">• ${ev.title}</div>`)
                .join('')
        }
      </div>
    `;
    this.container.appendChild(card);

    card.querySelector('#btnOpenFocal')?.addEventListener('click', () => {
      appState.setFocalVar(v.key);
    });
  }

  // ------------------------------------------------------------------ 工具方法

  private bindInput(parent: HTMLElement, selector: string, fn: (val: string) => void): void {
    const el = parent.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement | null;
    if (el) {
      el.oninput = () => fn(el.value);
    }
  }

  private escape(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
  }
}
