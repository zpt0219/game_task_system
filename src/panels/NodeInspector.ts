import {
  CmpCond,
  EventDef,
  ConditionDef,
  VarDef,
  VarCategory,
  ActionGraphNodeUnion,
  StartGraphNode,
  SelectorGraphNode,
  ChoiceGraphNode,
  ActionGraphNode,
  AtomicStep,
  ConditionCheck
} from '../core/types';
import { project, uid } from '../core/project';
import { appState } from '../core/state';
import { evalCond, evalCondition, getEventStatus, runEvent } from '../core/engine';
import { varWriters, varReaders, eventsDependingOn, varsWrittenBy } from '../core/graph';
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

    if (sel.kind === 'subnode') {
      const ev = project.getEvent(sel.eventId);
      const node = project.getGraphNode(sel.eventId, sel.id);
      if (ev && node) this.renderSubNodeInspector(ev, node);
      else this.renderEmpty();
    } else if (sel.kind === 'event') {
      const ev = project.getEvent(sel.id);
      if (ev) this.renderEventInspector(ev);
      else this.renderEmpty();
    } else if (sel.kind === 'condition') {
      const cond = project.getCondition(sel.id);
      if (cond) this.renderConditionInspector(cond);
      else this.renderEmpty();
    } else if (sel.kind === 'var') {
      const v = project.getVar(sel.id);
      if (v) this.renderVarInspector(v);
      else this.renderEmpty();
    } else if (sel.kind === 'multi') {
      this.renderMultiInspector(sel.items);
    }
  }

  // ------------------------------------------------------------------ 多选检查器

  private renderMultiInspector(
    items: Array<{ kind: 'event' | 'condition' | 'subnode'; id: string; eventId?: string }>
  ): void {
    const evCount = items.filter((i) => i.kind === 'event').length;
    const condCount = items.filter((i) => i.kind === 'condition').length;
    const subCount = items.filter((i) => i.kind === 'subnode').length;

    let summaryBadges = '';
    if (evCount > 0) summaryBadges += `<span class="status-pill status-blue">👑 ${evCount} 个事件</span> `;
    if (condCount > 0) summaryBadges += `<span class="status-pill status-cyan">🔍 ${condCount} 个条件</span> `;
    if (subCount > 0) summaryBadges += `<span class="status-pill status-purple">🎬 ${subCount} 个动作节点</span>`;

    const itemListHtml = items
      .map((item) => {
        let title = item.id;
        let icon = '📦';
        if (item.kind === 'event') {
          const ev = project.getEvent(item.id);
          if (ev) title = ev.title;
          icon = '👑';
        } else if (item.kind === 'condition') {
          const cond = project.getCondition(item.id);
          if (cond) title = cond.title;
          icon = '🔍';
        } else if (item.kind === 'subnode' && item.eventId) {
          const node = project.getGraphNode(item.eventId, item.id);
          if (node) {
            title = 'title' in node ? node.title : node.id;
            icon = node.type === 'action' ? '🎬' : node.type === 'selector' ? '🔀' : '💬';
          }
        }
        return `
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; background: #1e293b; border-radius: 6px; font-size: 12px; margin-bottom: 4px;">
            <div style="display: flex; align-items: center; gap: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              <span>${icon}</span>
              <span style="font-weight: 500; color: #f8fafc;">${this.escape(title)}</span>
            </div>
            <span style="font-size: 10px; color: #94a3b8; font-family: monospace;">${item.id}</span>
          </div>
        `;
      })
      .join('');

    this.container.innerHTML = `
      <div class="inspector-section" style="border-bottom: 1px solid #1e293b; padding-bottom: 12px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
          <div style="font-size: 14px; font-weight: 700; color: #f8fafc;">📦 批量多选 (${items.length})</div>
          <button id="btnDeselectAll" class="mini-btn" style="width: auto; padding: 2px 8px;">取消多选</button>
        </div>
        <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px;">
          ${summaryBadges}
        </div>
        <div style="font-size: 11px; color: #94a3b8; line-height: 1.5;">
          💡 提示：在画布中按住<b>任意一个选中节点拖动</b>，可整体移动；按 <b>Delete</b> 键可一键批量删除。
        </div>
      </div>

      <div class="inspector-section">
        <div class="inspector-label">选中节点清单</div>
        <div style="max-height: 260px; overflow-y: auto; padding-right: 4px;">
          ${itemListHtml}
        </div>
      </div>

      <div class="inspector-section">
        <button id="btnBatchDelete" class="dialog-btn danger-btn" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 8px;">
          <span>🗑️</span> 批量删除这 ${items.length} 个节点
        </button>
      </div>
    `;

    this.container.querySelector('#btnDeselectAll')?.addEventListener('click', () => {
      appState.select(null);
    });

    this.container.querySelector('#btnBatchDelete')?.addEventListener('click', () => {
      if (confirm(`确定要批量删除选中的 ${items.length} 个节点吗？`)) {
        project.change((d) => {
          items.forEach((item) => {
            if (item.kind === 'event') {
              d.events = d.events.filter((x) => x.id !== item.id);
            } else if (item.kind === 'condition') {
              d.conditions = d.conditions.filter((x) => x.id !== item.id);
              d.events.forEach((ev) => {
                if (ev.incomingConditions) {
                  ev.incomingConditions = ev.incomingConditions.filter((c) => c !== item.id);
                }
              });
            } else if (item.kind === 'subnode' && item.eventId) {
              const ev = d.events.find((x) => x.id === item.eventId);
              if (ev?.actionGraph) {
                ev.actionGraph.nodes = ev.actionGraph.nodes.filter((n) => n.id !== item.id && n.type !== 'start');
              }
            }
          });
        }, 'structure');
        appState.select(null);
        appState.log(`🗑️ 已批量删除 ${items.length} 个节点（Ctrl+Z 可撤销）`, true);
      }
    });
  }

  // ------------------------------------------------------------------ 空白提示

  private renderEmpty(): void {
    const p = project.get();
    const conds = project.getConditions();
    this.container.innerHTML = `
      <div class="empty-inspector">
        <div style="font-size: 38px; margin-bottom: 10px; opacity: 0.7;">🔮</div>
        <div style="font-size: 14px; font-weight: 700; color: #f3f4f6; margin-bottom: 6px;">
          任务图谱总览态
        </div>
        <div style="font-size: 12px; color: #9ca3af; line-height: 1.6; text-align: center; margin-bottom: 16px;">
          点击画布上的 <b>Event</b> 或 <b>Condition</b> 节点可检视与编辑；<br/>
          也可点击左侧栏的 <b>人物/道具/传送点</b> 查看其专属因果图谱。
        </div>

        <div style="width: 100%; background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 12px; font-size: 12px; color: #cbd5e1;">
          <div style="font-weight: 700; color: #38bdf8; margin-bottom: 8px;">📊 项目当前统计</div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span>💬 Event 可触发交互节点：</span>
            <b>${p.events.length} 个</b>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span>🔍 Condition 条件节点：</span>
            <b>${conds.length} 个</b>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span>🎒 注册变量 / 道具 / 状态：</span>
            <b>${p.vars.length} 个</b>
          </div>
        </div>

        <div style="margin-top: 16px; font-size: 11px; color: #64748b; line-height: 1.5; text-align: center;">
          💡 快捷技巧：在画布空白区域<b>单击右键</b>即可在光标位置新建 Event 或 Condition。
        </div>
      </div>
    `;
  }

  // ------------------------------------------------------------------ Event 节点编辑

  private renderEventInspector(ev: EventDef): void {
    const p = project.get();
    const state = appState.getState();
    const evStatus = getEventStatus(p, state, ev);

    // 0. Action Tree 内部图谱入口卡片
    const subNodeCount = ev.actionGraph?.nodes?.length || 0;
    const isInsideSubGraph = appState.getSubGraphEventId() === ev.id;
    const treeCard = document.createElement('div');
    treeCard.className = 'inspector-section';
    treeCard.style.border = '1px solid #8b5cf6';
    treeCard.style.background = 'linear-gradient(135deg, rgba(139, 92, 246, 0.12) 0%, rgba(30, 27, 75, 0.4) 100%)';
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
    this.container.appendChild(treeCard);

    treeCard.querySelector('#btnEnterSubGraph')?.addEventListener('click', () => {
      appState.setSubGraphEventId(ev.id);
      appState.log(`🕸️ 已进入「${ev.title}」内部 Action Tree 图谱`, true);
    });
    treeCard.querySelector('#btnExitSubGraph')?.addEventListener('click', () => {
      appState.setSubGraphEventId(null);
    });

    // 1. 基础信息卡片
    const metaCard = document.createElement('div');
    metaCard.className = 'inspector-section';
    metaCard.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span class="event-type-badge">EVENT 节点</span>
        <button id="btnDeleteEvent" class="btn-node-delete" title="删除此 Event 节点 (快捷键: Delete)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
          <span>删除节点</span>
        </button>
      </div>

      <div class="inspector-label">节点标题 (Title)</div>
      <input type="text" id="evTitle" class="inspector-input" value="${this.escape(ev.title)}" style="width: 100%; margin-bottom: 8px; box-sizing: border-box;" />

      <div class="inspector-label">代码绑定标识 (sourceRef，对应 Godot 脚本)</div>
      <input type="text" id="evSourceRef" class="inspector-input" value="${this.escape(ev.sourceRef || '')}" placeholder="例: king_conversation" style="width: 100%; margin-bottom: 8px; font-family: monospace; font-size: 11px; box-sizing: border-box;" />

      <div class="inspector-label">功能描述 (Desc)</div>
      <textarea id="evDesc" class="inspector-textarea" style="width: 100%; height: 56px; resize: vertical; box-sizing: border-box;">${this.escape(ev.desc || '')}</textarea>
    `;
    this.container.appendChild(metaCard);

    this.bindInput(metaCard, '#evTitle', (v) => {
      project.change((d) => {
        const target = d.events.find((e) => e.id === ev.id);
        if (target) target.title = v;
      }, 'field', `ev_title_${ev.id}`);
    });
    this.bindInput(metaCard, '#evSourceRef', (v) => {
      project.change((d) => {
        const target = d.events.find((e) => e.id === ev.id);
        if (target) target.sourceRef = v;
      }, 'field');
    });
    this.bindInput(metaCard, '#evDesc', (v) => {
      project.change((d) => {
        const target = d.events.find((e) => e.id === ev.id);
        if (target) target.desc = v;
      }, 'field');
    });

    const btnDel = metaCard.querySelector('#btnDeleteEvent') as HTMLElement;
    btnDel.onclick = () => {
      project.deleteEvent(ev.id);
      appState.select(null);
      appState.log(`🗑️ 已删除 Event 节点：[${ev.title}]（Ctrl+Z 可撤销）`);
    };

    // 2. 试玩快速执行按钮
    const playCard = document.createElement('div');
    playCard.className = 'inspector-section';
    playCard.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
        <span style="font-size: 11px; color: #94a3b8;">预计执行逻辑：</span>
        <span class="event-status-pill ${evStatus.colorClass}" style="font-size: 11px;">
          ${evStatus.title}
        </span>
      </div>
      <button id="btnPlayEvent" class="dialog-btn primary-btn" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 8px;">
        <span>▶</span> 触发执行 (Play Action Tree)
      </button>
    `;
    this.container.appendChild(playCard);

    playCard.querySelector('#btnPlayEvent')?.addEventListener('click', () => {
      appState.setRunningEventId(ev.id);
      runEvent(
        {
          project: project.get(),
          getState: () => appState.getState(),
          mutate: (fn) => {
            appState.setRunningEventId(ev.id);
            appState.mutate(fn);
          },
          showDialog: (cfg) => {
            const origConfirm = cfg.onConfirm;
            cfg.onConfirm = () => {
              appState.setRunningEventId(ev.id);
              if (origConfirm) origConfirm();
            };
            this.dialog.show(cfg);
          },
          log: (msg, hl) => appState.log(msg, hl)
        },
        ev
      );
    });

    // 3. 依赖的前置条件 (Conditions) 管理
    const incomingCondIds = ev.incomingConditions ?? [];
    const trigCard = document.createElement('div');
    trigCard.className = 'inspector-section';
    trigCard.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <div class="inspector-label" style="margin-bottom: 0;">
          🔍 依赖的前置条件 (Conditions：${incomingCondIds.length})
        </div>
        <button id="btnConnectTrig" class="mini-btn-action" style="padding: 2px 8px; font-size: 11px;">
          + 关联 Condition
        </button>
      </div>
      <div id="incomingTrigsContainer" style="display: flex; flex-wrap: wrap; gap: 6px;">
        ${
          incomingCondIds.length === 0
            ? '<div style="font-size: 11px; color: #64748b; padding: 2px 0;">💡 暂无依赖 Condition (此 Event 仅执行默认行为)</div>'
            : incomingCondIds
                .map((cid) => {
                  const cond = project.getCondition(cid);
                  const title = cond ? cond.title.replace(/^🔍 condition: /, '') : cid;
                  return `
              <span style="display: inline-flex; align-items: center; gap: 4px; font-size: 11px; background: #1e293b; border: 1px solid #38bdf8; color: #38bdf8; border-radius: 4px; padding: 2px 6px;">
                <span>🔍 ${this.escape(title)}</span>
                <button class="btn-disconnect-trig" data-tid="${cid}" style="background: none; border: none; color: #f87171; cursor: pointer; font-size: 13px; font-weight: bold; padding: 0 2px; line-height: 1;" title="断开依赖">×</button>
              </span>
            `;
                })
                .join('')
        }
      </div>
    `;
    this.container.appendChild(trigCard);

    // 绑定关联 Condition
    trigCard.querySelector('#btnConnectTrig')?.addEventListener('click', () => {
      const allConds = project.getConditions();
      const available = allConds.filter((t) => !incomingCondIds.includes(t.id));
      if (available.length === 0) {
        alert('项目中暂无更多可依赖的 Condition！');
        return;
      }
      const names = available.map((t, idx) => `${idx + 1}. ${t.title.replace(/^🔍 condition: /, '')}`).join('\n');
      const input = prompt(`请选择要让此 Event 依赖的 Condition (输入序号 1~${available.length})：\n\n${names}`);
      if (!input) return;
      const idx = parseInt(input.trim(), 10) - 1;
      if (idx >= 0 && idx < available.length) {
        const chosen = available[idx];
        project.change((d) => {
          const targetEv = d.events.find((x) => x.id === ev.id);
          if (targetEv) {
            if (!targetEv.incomingConditions) targetEv.incomingConditions = [];
            if (!targetEv.incomingConditions.includes(chosen.id)) {
              targetEv.incomingConditions.push(chosen.id);
            }
          }
        }, 'structure');
      }
    });

    // 绑定断开 Condition
    trigCard.querySelectorAll('.btn-disconnect-trig').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cid = (btn as HTMLElement).dataset.tid;
        if (!cid) return;
        project.disconnectCondition(ev.id, cid);
      });
    });

    // 4. Action Tree 内部节点概览
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
        ${nodes.map((n) => {
          const icon = n.type === 'start' ? '▶' : n.type === 'action' ? '🎬' : n.type === 'selector' ? '🔀' : '💬';
          const title = 'title' in n ? (n as any).title : 'Start 入口';
          return `
            <div class="subnode-overview-item" data-nid="${n.id}" style="display: flex; justify-content: space-between; align-items: center; background: #0f172a; border: 1px solid #334155; border-radius: 4px; padding: 5px 8px; cursor: pointer; font-size: 11px;">
              <span style="color: #f1f5f9; display: flex; align-items: center; gap: 6px;">
                <span>${icon}</span>
                <span style="font-weight: 600;">${this.escape(title)}</span>
              </span>
              <span style="color: #64748b; font-family: monospace; font-size: 10px;">${n.id}</span>
            </div>
          `;
        }).join('')}
      </div>
    `;
    this.container.appendChild(overviewCard);

    overviewCard.querySelectorAll('.subnode-overview-item').forEach((item) => {
      (item as HTMLElement).onclick = () => {
        const nid = (item as HTMLElement).dataset.nid;
        if (nid) {
          appState.setSubGraphEventId(ev.id);
          appState.select({ kind: 'subnode', id: nid, eventId: ev.id });
        }
      };
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

  // ------------------------------------------------------------------ Action Tree 子图节点编辑

  private renderSubNodeInspector(ev: EventDef, node: ActionGraphNodeUnion): void {
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
        <span>所属事件：<b>${this.escape(ev.title)}</b></span>
        <button id="btnBackToEventMeta" class="mini-btn" style="font-size: 10px; padding: 2px 6px;">检视事件主体</button>
      </div>
    `;
    this.container.appendChild(topCard);

    topCard.querySelector('#btnBackToEventMeta')?.addEventListener('click', () => {
      appState.select({ kind: 'event', id: ev.id });
    });

    if (node.type !== 'start') {
      topCard.querySelector('#btnDeleteSubNode')?.addEventListener('click', () => {
        project.deleteGraphNode(ev.id, node.id);
        appState.select({ kind: 'event', id: ev.id });
        appState.log(`🗑️ 已删除 Action Tree 节点：${node.id}`);
      });
    }

    // 根据 4 类节点分别渲染
    switch (node.type) {
      case 'start':
        this.renderStartNodeInspector(ev, node);
        break;
      case 'action':
        this.renderActionNodeInspector(ev, node);
        break;
      case 'selector':
        this.renderSelectorNodeInspector(ev, node);
        break;
      case 'choice':
        this.renderChoiceNodeInspector(ev, node);
        break;
    }
  }

  /** 通用流向目标选择控件 (连向 Choice 节点时支持配置默认选中选项) */
  private renderTargetSelectUI(
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
          return `<option value="${n.id}" ${n.id === currentNextId ? 'selected' : ''}>${typePrefix} ${this.escape(
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
            `<option value="${idx}" ${idx === curIdx ? 'selected' : ''}>[${idx}] ${this.escape(o.text)}</option>`
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
  private renderStartNodeInspector(ev: EventDef, node: StartGraphNode): void {
    const card = document.createElement('div');
    card.className = 'inspector-section';
    card.innerHTML = `
      <div class="inspector-label">入口流程说明</div>
      <div style="font-size: 11px; color: #94a3b8; line-height: 1.5; margin-bottom: 10px;">
        Start 节点固定为事件触发时的唯一起点，负责引导控制流走向第一个执行的节点。
      </div>
      <div class="inspector-label">起点流向 (Next)</div>
    `;

    const targetUI = this.renderTargetSelectUI(
      ev,
      node.nextId,
      node.defaultOptionIndex,
      (targetId, defaultOptionIndex) => {
        project.change((d) => {
          const targetNode = d.events.find((e) => e.id === ev.id)?.actionGraph?.nodes.find((n) => n.id === node.id);
          if (targetNode && targetNode.type === 'start') {
            targetNode.nextId = targetId;
            targetNode.defaultOptionIndex = defaultOptionIndex;
          }
        }, 'structure');
      }
    );
    card.appendChild(targetUI);
    this.container.appendChild(card);
  }

  // 2. Action 复合动作节点编辑
  private renderActionNodeInspector(ev: EventDef, node: ActionGraphNode): void {
    const p = project.get();

    // 标题卡片
    const titleCard = document.createElement('div');
    titleCard.className = 'inspector-section';
    titleCard.innerHTML = `
      <div class="inspector-label">节点名称 (Title)</div>
      <input type="text" id="actionTitle" class="inspector-input" value="${this.escape(
        node.title || ''
      )}" placeholder="例: 强化攻击" style="width: 100%; box-sizing: border-box;" />
    `;
    this.container.appendChild(titleCard);

    this.bindInput(titleCard, '#actionTitle', (v) => {
      project.change((d) => {
        const targetNode = d.events.find((e) => e.id === ev.id)?.actionGraph?.nodes.find((n) => n.id === node.id);
        if (targetNode && targetNode.type === 'action') {
          targetNode.title = v;
        }
      }, 'field', `sub_title_${node.id}`);
    });

    // 后续流向卡片 (Out 连线，可连向后续或回跳形成循环)
    const outCard = document.createElement('div');
    outCard.className = 'inspector-section';
    outCard.innerHTML = `
      <div class="inspector-label">后续控制流 (Out 连线，可连向后续节点或回跳循环)</div>
    `;
    const targetUI = this.renderTargetSelectUI(
      ev,
      node.nextId,
      node.defaultOptionIndex,
      (targetId, defaultOptionIndex) => {
        project.change((d) => {
          const targetNode = d.events.find((e) => e.id === ev.id)?.actionGraph?.nodes.find((n) => n.id === node.id);
          if (targetNode && targetNode.type === 'action') {
            targetNode.nextId = targetId;
            targetNode.defaultOptionIndex = defaultOptionIndex;
          }
        }, 'structure');
      }
    );
    outCard.appendChild(targetUI);
    this.container.appendChild(outCard);

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
    this.container.appendChild(stepsCard);

    const stepsContainer = stepsCard.querySelector('#subStepsContainer') as HTMLElement;
    node.steps.forEach((step, sIdx) => {
      const stepEl = this.renderAtomicStepCard(ev, node, step, sIdx);
      stepsContainer.appendChild(stepEl);
    });

    stepsCard.querySelectorAll('.btn-add-substep').forEach((btn) => {
      btn.addEventListener('click', () => {
        const type = (btn as HTMLElement).dataset.type;
        project.change((d) => {
          const targetNode = d.events.find((e) => e.id === ev.id)?.actionGraph?.nodes.find((n) => n.id === node.id);
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
            const first = p.vars[0];
            targetNode.steps.push({
              type: 'set',
              var: first ? first.key : 'hero.gold',
              value: first ? first.initial : 0
            });
          } else if (type === 'add') {
            const firstNum = p.vars.find((v) => v.kind === 'number');
            targetNode.steps.push({
              type: 'add',
              var: firstNum ? firstNum.key : 'hero.gold',
              amount: 10
            });
          }
        }, 'structure');
      });
    });
  }

  /** 渲染 Action 内部的原子步骤项 (Say / Set / Add) */
  private renderAtomicStepCard(
    ev: EventDef,
    node: ActionGraphNode,
    step: AtomicStep,
    sIdx: number
  ): HTMLElement {
    const p = project.get();
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
          <input type="text" class="say-avatar inspector-input" value="${this.escape(
            step.avatar || '💬'
          )}" placeholder="头像" style="text-align:center; font-size:16px;" />
          <input type="text" class="say-speaker inspector-input" value="${this.escape(
            step.speaker
          )}" placeholder="说话人" />
        </div>
        <textarea class="say-text inspector-textarea" style="width:100%; height:50px; resize:vertical; margin-bottom:6px; box-sizing:border-box;">${this.escape(
          step.text
        )}</textarea>
        <input type="text" class="say-button inspector-input" value="${this.escape(
          step.button || '继续'
        )}" placeholder="确认按钮文案 (如: 继续)" style="width:100%; box-sizing:border-box;" />
      `;
      this.bindInput(body, '.say-avatar', (v) => {
        project.change((d) => {
          const targetNode = d.events.find((e) => e.id === ev.id)?.actionGraph?.nodes.find((n) => n.id === node.id);
          if (targetNode && targetNode.type === 'action') {
            const s = targetNode.steps[sIdx];
            if (s && s.type === 'say') s.avatar = v;
          }
        }, 'field', `say_avatar_${node.id}_${sIdx}`);
      });
      this.bindInput(body, '.say-speaker', (v) => {
        project.change((d) => {
          const targetNode = d.events.find((e) => e.id === ev.id)?.actionGraph?.nodes.find((n) => n.id === node.id);
          if (targetNode && targetNode.type === 'action') {
            const s = targetNode.steps[sIdx];
            if (s && s.type === 'say') s.speaker = v;
          }
        }, 'field', `say_speaker_${node.id}_${sIdx}`);
      });
      this.bindInput(body, '.say-text', (v) => {
        project.change((d) => {
          const targetNode = d.events.find((e) => e.id === ev.id)?.actionGraph?.nodes.find((n) => n.id === node.id);
          if (targetNode && targetNode.type === 'action') {
            const s = targetNode.steps[sIdx];
            if (s && s.type === 'say') s.text = v;
          }
        }, 'field', `say_text_${node.id}_${sIdx}`);
      });
      this.bindInput(body, '.say-button', (v) => {
        project.change((d) => {
          const targetNode = d.events.find((e) => e.id === ev.id)?.actionGraph?.nodes.find((n) => n.id === node.id);
          if (targetNode && targetNode.type === 'action') {
            const s = targetNode.steps[sIdx];
            if (s && s.type === 'say') s.button = v;
          }
        }, 'field', `say_btn_${node.id}_${sIdx}`);
      });
    } else if (step.type === 'set') {
      const varOptions = p.vars
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
          <input type="text" class="set-val inspector-input" value="${this.escape(
            step.value !== undefined ? String(step.value) : step.from ? `from:${step.from}` : ''
          )}" placeholder="例: true / 100 / from:hero.maxHp" style="width:100%; font-family:monospace; box-sizing:border-box;" />
        </div>
      `;
      body.querySelector('.set-var')?.addEventListener('change', (e) => {
        const val = (e.target as HTMLSelectElement).value;
        project.change((d) => {
          const targetNode = d.events.find((evItem) => evItem.id === ev.id)?.actionGraph?.nodes.find((n) => n.id === node.id);
          if (targetNode && targetNode.type === 'action') {
            const s = targetNode.steps[sIdx];
            if (s && s.type === 'set') s.var = val;
          }
        }, 'field');
      });
      this.bindInput(body, '.set-val', (v) => {
        project.change((d) => {
          const targetNode = d.events.find((evItem) => evItem.id === ev.id)?.actionGraph?.nodes.find((n) => n.id === node.id);
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
        }, 'field', `set_val_${node.id}_${sIdx}`);
      });
    } else if (step.type === 'add') {
      const numVars = p.vars.filter((v) => v.kind === 'number');
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
        project.change((d) => {
          const targetNode = d.events.find((evItem) => evItem.id === ev.id)?.actionGraph?.nodes.find((n) => n.id === node.id);
          if (targetNode && targetNode.type === 'action') {
            const s = targetNode.steps[sIdx];
            if (s && s.type === 'add') s.var = val;
          }
        }, 'field');
      });
      body.querySelector('.add-amount')?.addEventListener('input', (e) => {
        const amt = Number((e.target as HTMLInputElement).value) || 0;
        project.change((d) => {
          const targetNode = d.events.find((evItem) => evItem.id === ev.id)?.actionGraph?.nodes.find((n) => n.id === node.id);
          if (targetNode && targetNode.type === 'action') {
            const s = targetNode.steps[sIdx];
            if (s && s.type === 'add') s.amount = amt;
          }
        }, 'field', `add_amt_${node.id}_${sIdx}`);
      });
    }

    // 步骤排序与删除
    card.querySelector('.btn-substep-up')?.addEventListener('click', () => {
      if (sIdx > 0) {
        project.change((d) => {
          const targetNode = d.events.find((e) => e.id === ev.id)?.actionGraph?.nodes.find((n) => n.id === node.id);
          if (targetNode && targetNode.type === 'action') {
            const temp = targetNode.steps[sIdx];
            targetNode.steps[sIdx] = targetNode.steps[sIdx - 1];
            targetNode.steps[sIdx - 1] = temp;
          }
        }, 'structure');
      }
    });

    card.querySelector('.btn-substep-down')?.addEventListener('click', () => {
      if (sIdx < node.steps.length - 1) {
        project.change((d) => {
          const targetNode = d.events.find((e) => e.id === ev.id)?.actionGraph?.nodes.find((n) => n.id === node.id);
          if (targetNode && targetNode.type === 'action') {
            const temp = targetNode.steps[sIdx];
            targetNode.steps[sIdx] = targetNode.steps[sIdx + 1];
            targetNode.steps[sIdx + 1] = temp;
          }
        }, 'structure');
      }
    });

    card.querySelector('.btn-substep-del')?.addEventListener('click', () => {
      project.change((d) => {
        const targetNode = d.events.find((e) => e.id === ev.id)?.actionGraph?.nodes.find((n) => n.id === node.id);
        if (targetNode && targetNode.type === 'action') {
          targetNode.steps.splice(sIdx, 1);
        }
      }, 'structure');
    });

    return card;
  }

  // 3. Selector 多路条件分支节点编辑
  private renderSelectorNodeInspector(ev: EventDef, node: SelectorGraphNode): void {
    const incomingCondIds = ev.incomingConditions ?? [];

    // 标题卡片
    const titleCard = document.createElement('div');
    titleCard.className = 'inspector-section';
    titleCard.innerHTML = `
      <div class="inspector-label">节点名称 (Title)</div>
      <input type="text" id="selTitle" class="inspector-input" value="${this.escape(
        node.title || ''
      )}" placeholder="例: 阶段判断" style="width: 100%; box-sizing: border-box;" />
    `;
    this.container.appendChild(titleCard);

    this.bindInput(titleCard, '#selTitle', (v) => {
      project.change((d) => {
        const targetNode = d.events.find((e) => e.id === ev.id)?.actionGraph?.nodes.find((n) => n.id === node.id);
        if (targetNode && targetNode.type === 'selector') {
          targetNode.title = v;
        }
      }, 'field', `sub_title_${node.id}`);
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
    this.container.appendChild(casesCard);

    casesCard.querySelector('#btnAddCase')?.addEventListener('click', () => {
      project.change((d) => {
        const targetNode = d.events.find((e) => e.id === ev.id)?.actionGraph?.nodes.find((n) => n.id === node.id);
        if (targetNode && targetNode.type === 'selector') {
          targetNode.cases.push({
            id: uid('case'),
            title: `分支 ${targetNode.cases.length + 1}`,
            checks: incomingCondIds.length > 0 ? [{ conditionId: incomingCondIds[0] }] : []
          });
        }
      }, 'structure');
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
          <input type="text" class="case-title inspector-input" value="${this.escape(
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

      this.bindInput(caseEl, '.case-title', (v) => {
        project.change((d) => {
          const targetNode = d.events.find((e) => e.id === ev.id)?.actionGraph?.nodes.find((n) => n.id === node.id);
          if (targetNode && targetNode.type === 'selector' && targetNode.cases[cIdx]) {
            targetNode.cases[cIdx].title = v;
          }
        }, 'field', `case_title_${node.id}_${cIdx}`);
      });

      // 规则列表
      const checksList = caseEl.querySelector('.checks-list') as HTMLElement;
      if (c.checks.length === 0) {
        checksList.innerHTML = `<div style="font-size:10px; color:#64748b;">(暂无判断规则)</div>`;
      } else {
        c.checks.forEach((chk, chkIdx) => {
          const chkRow = this.renderCheckRow(ev, chk, () => {
            project.change((d) => {
              const targetNode = d.events.find((e) => e.id === ev.id)?.actionGraph?.nodes.find((n) => n.id === node.id);
              if (targetNode && targetNode.type === 'selector') {
                targetNode.cases[cIdx]?.checks.splice(chkIdx, 1);
              }
            }, 'structure');
          });
          checksList.appendChild(chkRow);
        });
      }

      caseEl.querySelector('.btn-add-check')?.addEventListener('click', () => {
        project.change((d) => {
          const targetNode = d.events.find((e) => e.id === ev.id)?.actionGraph?.nodes.find((n) => n.id === node.id);
          if (targetNode && targetNode.type === 'selector' && incomingCondIds.length > 0) {
            targetNode.cases[cIdx]?.checks.push({ conditionId: incomingCondIds[0] });
          }
        }, 'structure');
      });

      // 流向设置
      const targetWrap = caseEl.querySelector('.case-target-wrap') as HTMLElement;
      const targetUI = this.renderTargetSelectUI(
        ev,
        c.targetId,
        c.defaultOptionIndex,
        (targetId, defaultOptionIndex) => {
          project.change((d) => {
            const targetNode = d.events.find((e) => e.id === ev.id)?.actionGraph?.nodes.find((n) => n.id === node.id);
            if (targetNode && targetNode.type === 'selector') {
              const tc = targetNode.cases[cIdx];
              if (tc) {
                tc.targetId = targetId;
                tc.defaultOptionIndex = defaultOptionIndex;
              }
            }
          }, 'structure');
        }
      );
      targetWrap.appendChild(targetUI);

      // 上移下移删除
      caseEl.querySelector('.btn-case-up')?.addEventListener('click', () => {
        if (cIdx > 0) {
          project.change((d) => {
            const targetNode = d.events.find((e) => e.id === ev.id)?.actionGraph?.nodes.find((n) => n.id === node.id);
            if (targetNode && targetNode.type === 'selector') {
              const temp = targetNode.cases[cIdx];
              targetNode.cases[cIdx] = targetNode.cases[cIdx - 1];
              targetNode.cases[cIdx - 1] = temp;
            }
          }, 'structure');
        }
      });
      caseEl.querySelector('.btn-case-down')?.addEventListener('click', () => {
        if (cIdx < node.cases.length - 1) {
          project.change((d) => {
            const targetNode = d.events.find((e) => e.id === ev.id)?.actionGraph?.nodes.find((n) => n.id === node.id);
            if (targetNode && targetNode.type === 'selector') {
              const temp = targetNode.cases[cIdx];
              targetNode.cases[cIdx] = targetNode.cases[cIdx + 1];
              targetNode.cases[cIdx + 1] = temp;
            }
          }, 'structure');
        }
      });
      caseEl.querySelector('.btn-case-del')?.addEventListener('click', () => {
        project.change((d) => {
          const targetNode = d.events.find((e) => e.id === ev.id)?.actionGraph?.nodes.find((n) => n.id === node.id);
          if (targetNode && targetNode.type === 'selector') {
            targetNode.cases.splice(cIdx, 1);
          }
        }, 'structure');
      });

      casesContainer.appendChild(caseEl);
    });

    // Default 保底目标卡片
    const defCard = document.createElement('div');
    defCard.className = 'inspector-section';
    defCard.innerHTML = `
      <div class="inspector-label">Default 保底流向 (所有条件均不满足时流向)：</div>
    `;
    const defTargetUI = this.renderTargetSelectUI(
      ev,
      node.defaultTargetId,
      node.defaultOptionIndex,
      (targetId, defaultOptionIndex) => {
        project.change((d) => {
          const targetNode = d.events.find((e) => e.id === ev.id)?.actionGraph?.nodes.find((n) => n.id === node.id);
          if (targetNode && targetNode.type === 'selector') {
            targetNode.defaultTargetId = targetId;
            targetNode.defaultOptionIndex = defaultOptionIndex;
          }
        }, 'structure');
      }
    );
    defCard.appendChild(defTargetUI);
    this.container.appendChild(defCard);
  }

  // 4. Choice 玩家选项分流节点编辑
  private renderChoiceNodeInspector(ev: EventDef, node: ChoiceGraphNode): void {
    const incomingCondIds = ev.incomingConditions ?? [];

    // 提问信息卡片
    const askCard = document.createElement('div');
    askCard.className = 'inspector-section';
    askCard.innerHTML = `
      <div class="inspector-label">选项卡片标题</div>
      <input type="text" id="choiceTitle" class="inspector-input" value="${this.escape(
        node.title || ''
      )}" placeholder="例: 玩家选项提问" style="width: 100%; margin-bottom: 8px; box-sizing: border-box;" />

      <div style="display:grid; grid-template-columns: 50px 1fr 1fr; gap:6px; margin-bottom:8px;">
        <div>
          <div class="inspector-label">头像</div>
          <input type="text" id="choiceAvatar" class="inspector-input" value="${this.escape(
            node.avatar || '💬'
          )}" style="width:100%; text-align:center; font-size:16px; box-sizing:border-box;" />
        </div>
        <div>
          <div class="inspector-label">说话人</div>
          <input type="text" id="choiceSpeaker" class="inspector-input" value="${this.escape(
            node.speaker || ''
          )}" style="width:100%; box-sizing:border-box;" />
        </div>
        <div>
          <div class="inspector-label">头衔</div>
          <input type="text" id="choiceSpeakerTitle" class="inspector-input" value="${this.escape(
            node.speakerTitle || ''
          )}" placeholder="例: 侍从" style="width:100%; box-sizing:border-box;" />
        </div>
      </div>

      <div class="inspector-label">提问台词正文 (支持 {hero.gold} 变量插值)</div>
      <textarea id="choiceText" class="inspector-textarea" style="width: 100%; height: 56px; resize: vertical; box-sizing: border-box;">${this.escape(
        node.text || ''
      )}</textarea>
    `;
    this.container.appendChild(askCard);

    this.bindInput(askCard, '#choiceTitle', (v) => {
      project.change((d) => {
        const targetNode = d.events.find((e) => e.id === ev.id)?.actionGraph?.nodes.find((n) => n.id === node.id);
        if (targetNode && targetNode.type === 'choice') {
          targetNode.title = v;
        }
      }, 'field', `sub_title_${node.id}`);
    });
    this.bindInput(askCard, '#choiceAvatar', (v) => {
      project.change((d) => {
        const targetNode = d.events.find((e) => e.id === ev.id)?.actionGraph?.nodes.find((n) => n.id === node.id);
        if (targetNode && targetNode.type === 'choice') {
          targetNode.avatar = v;
        }
      }, 'field');
    });
    this.bindInput(askCard, '#choiceSpeaker', (v) => {
      project.change((d) => {
        const targetNode = d.events.find((e) => e.id === ev.id)?.actionGraph?.nodes.find((n) => n.id === node.id);
        if (targetNode && targetNode.type === 'choice') {
          targetNode.speaker = v;
        }
      }, 'field');
    });
    this.bindInput(askCard, '#choiceSpeakerTitle', (v) => {
      project.change((d) => {
        const targetNode = d.events.find((e) => e.id === ev.id)?.actionGraph?.nodes.find((n) => n.id === node.id);
        if (targetNode && targetNode.type === 'choice') {
          targetNode.speakerTitle = v;
        }
      }, 'field');
    });
    this.bindInput(askCard, '#choiceText', (v) => {
      project.change((d) => {
        const targetNode = d.events.find((e) => e.id === ev.id)?.actionGraph?.nodes.find((n) => n.id === node.id);
        if (targetNode && targetNode.type === 'choice') {
          targetNode.text = v;
        }
      }, 'field');
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
    this.container.appendChild(optCard);

    optCard.querySelector('#btnAddOpt')?.addEventListener('click', () => {
      project.change((d) => {
        const targetNode = d.events.find((e) => e.id === ev.id)?.actionGraph?.nodes.find((n) => n.id === node.id);
        if (targetNode && targetNode.type === 'choice') {
          targetNode.options.push({
            id: uid('opt'),
            text: `选项 ${targetNode.options.length + 1}`,
            style: 'primary'
          });
        }
      }, 'structure');
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
          <input type="text" class="opt-text inspector-input" value="${this.escape(
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

      this.bindInput(oEl, '.opt-text', (v) => {
        project.change((d) => {
          const targetNode = d.events.find((e) => e.id === ev.id)?.actionGraph?.nodes.find((n) => n.id === node.id);
          if (targetNode && targetNode.type === 'choice' && targetNode.options[oIdx]) {
            targetNode.options[oIdx].text = v;
          }
        }, 'field', `opt_text_${node.id}_${oIdx}`);
      });

      oEl.querySelector('.opt-style')?.addEventListener('change', (e) => {
        const val = (e.target as HTMLSelectElement).value as any;
        project.change((d) => {
          const targetNode = d.events.find((e) => e.id === ev.id)?.actionGraph?.nodes.find((n) => n.id === node.id);
          if (targetNode && targetNode.type === 'choice' && targetNode.options[oIdx]) {
            targetNode.options[oIdx].style = val;
          }
        }, 'field');
      });

      // 选项可用前置条件
      const checksList = oEl.querySelector('.opt-checks-list') as HTMLElement;
      const chks = opt.checks || [];
      if (chks.length === 0) {
        checksList.innerHTML = `<div style="font-size:10px; color:#64748b;">(无条件限制，始终可选)</div>`;
      } else {
        chks.forEach((chk, chkIdx) => {
          const chkRow = this.renderCheckRow(ev, chk, () => {
            project.change((d) => {
              const targetNode = d.events.find((e) => e.id === ev.id)?.actionGraph?.nodes.find((n) => n.id === node.id);
              if (targetNode && targetNode.type === 'choice') {
                targetNode.options[oIdx]?.checks?.splice(chkIdx, 1);
              }
            }, 'structure');
          });
          checksList.appendChild(chkRow);
        });
      }

      oEl.querySelector('.btn-add-opt-check')?.addEventListener('click', () => {
        project.change((d) => {
          const targetNode = d.events.find((e) => e.id === ev.id)?.actionGraph?.nodes.find((n) => n.id === node.id);
          if (targetNode && targetNode.type === 'choice' && incomingCondIds.length > 0) {
            const o = targetNode.options[oIdx];
            if (!o.checks) o.checks = [];
            o.checks.push({ conditionId: incomingCondIds[0] });
          }
        }, 'structure');
      });

      // 流向设置
      const targetWrap = oEl.querySelector('.opt-target-wrap') as HTMLElement;
      const targetUI = this.renderTargetSelectUI(
        ev,
        opt.targetId,
        opt.defaultOptionIndex,
        (targetId, defaultOptionIndex) => {
          project.change((d) => {
            const targetNode = d.events.find((e) => e.id === ev.id)?.actionGraph?.nodes.find((n) => n.id === node.id);
            if (targetNode && targetNode.type === 'choice') {
              const to = targetNode.options[oIdx];
              if (to) {
                to.targetId = targetId;
                to.defaultOptionIndex = defaultOptionIndex;
              }
            }
          }, 'structure');
        }
      );
      targetWrap.appendChild(targetUI);

      // 上移下移删除
      oEl.querySelector('.btn-opt-up')?.addEventListener('click', () => {
        if (oIdx > 0) {
          project.change((d) => {
            const targetNode = d.events.find((e) => e.id === ev.id)?.actionGraph?.nodes.find((n) => n.id === node.id);
            if (targetNode && targetNode.type === 'choice') {
              const temp = targetNode.options[oIdx];
              targetNode.options[oIdx] = targetNode.options[oIdx - 1];
              targetNode.options[oIdx - 1] = temp;
            }
          }, 'structure');
        }
      });
      oEl.querySelector('.btn-opt-down')?.addEventListener('click', () => {
        if (oIdx < node.options.length - 1) {
          project.change((d) => {
            const targetNode = d.events.find((e) => e.id === ev.id)?.actionGraph?.nodes.find((n) => n.id === node.id);
            if (targetNode && targetNode.type === 'choice') {
              const temp = targetNode.options[oIdx];
              targetNode.options[oIdx] = targetNode.options[oIdx + 1];
              targetNode.options[oIdx + 1] = temp;
            }
          }, 'structure');
        }
      });
      oEl.querySelector('.btn-opt-del')?.addEventListener('click', () => {
        project.change((d) => {
          const targetNode = d.events.find((e) => e.id === ev.id)?.actionGraph?.nodes.find((n) => n.id === node.id);
          if (targetNode && targetNode.type === 'choice') {
            targetNode.options.splice(oIdx, 1);
          }
        }, 'structure');
      });

      optContainer.appendChild(oEl);
    });
  }

  /** 渲染一条针对所依赖 Condition 的比较规则 (ConditionCheck) */
  private renderCheckRow(ev: EventDef, check: ConditionCheck, onDelete: () => void): HTMLElement {
    const incomingCondIds = ev.incomingConditions ?? [];
    const row = document.createElement('div');
    row.style.cssText =
      'display:grid; grid-template-columns: 1fr 60px 70px 24px; gap:4px; align-items:center; margin-bottom:4px;';

    const curCondId = check.conditionId;
    const condOptions = incomingCondIds
      .map((cid) => {
        const t = project.getCondition(cid);
        const title = t ? t.title.replace(/^🔍 condition: /, '') : cid;
        return `<option value="${cid}" ${cid === curCondId ? 'selected' : ''}>🔍 ${this.escape(title)}</option>`;
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
      <input type="text" class="chk-val-input inspector-input" value="${this.escape(
        check.value !== undefined ? String(check.value) : 'true'
      )}" placeholder="值" style="font-size:10px; padding:2px 4px; box-sizing:border-box; font-family:monospace;" />
      <button class="mini-btn danger-btn btn-del-check" style="padding:2px 4px;" title="删除此规则">×</button>
    `;

    row.querySelector('.chk-trig-select')?.addEventListener('change', (e) => {
      const v = (e.target as HTMLSelectElement).value;
      project.change((d) => {
        const targetEv = d.events.find((x) => x.id === ev.id);
        targetEv?.actionGraph?.nodes?.forEach((n) => {
          if (n.type === 'selector') {
            n.cases.forEach((c) => c.checks.forEach((chk) => {
              if (chk === check) {
                chk.conditionId = v;
              }
            }));
          } else if (n.type === 'choice') {
            n.options.forEach((o) => o.checks?.forEach((chk) => {
              if (chk === check) {
                chk.conditionId = v;
              }
            }));
          }
        });
      }, 'field');
    });
    row.querySelector('.chk-op-select')?.addEventListener('change', (e) => {
      const v = (e.target as HTMLSelectElement).value as any;
      project.change((d) => {
        const targetEv = d.events.find((x) => x.id === ev.id);
        targetEv?.actionGraph?.nodes?.forEach((n) => {
          if (n.type === 'selector') {
            n.cases.forEach((c) => c.checks.forEach((chk) => { if (chk === check) chk.op = v; }));
          } else if (n.type === 'choice') {
            n.options.forEach((o) => o.checks?.forEach((chk) => { if (chk === check) chk.op = v; }));
          }
        });
      }, 'field');
    });
    this.bindInput(row, '.chk-val-input', (v) => {
      let val: any = v;
      if (v === 'true') val = true;
      else if (v === 'false') val = false;
      else if (!isNaN(Number(v)) && v.trim() !== '') val = Number(v);
      project.change((d) => {
        const targetEv = d.events.find((x) => x.id === ev.id);
        targetEv?.actionGraph?.nodes?.forEach((n) => {
          if (n.type === 'selector') {
            n.cases.forEach((c) => c.checks.forEach((chk) => { if (chk === check) chk.value = val; }));
          } else if (n.type === 'choice') {
            n.options.forEach((o) => o.checks?.forEach((chk) => { if (chk === check) chk.value = val; }));
          }
        });
      }, 'field', `chk_val_${curCondId}`);
    });
    row.querySelector('.btn-del-check')?.addEventListener('click', onDelete);

    return row;
  }

  // ------------------------------------------------------------------ Condition 节点编辑

  private renderConditionInspector(tr: ConditionDef): void {
    const p = project.get();
    const state = appState.getState();
    const isSatisfied = evalCondition(p, state, tr);
    const dependentEvents = eventsDependingOn(p, tr.id);

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
      <input type="text" id="trTitle" class="inspector-input" value="${this.escape(tr.title)}" style="width: 100%; margin-bottom: 8px; box-sizing: border-box;" />

      <div class="inspector-label">描述 (Desc)</div>
      <textarea id="trDesc" class="inspector-textarea" style="width: 100%; height: 52px; margin-bottom: 8px; resize: vertical; box-sizing: border-box;">${this.escape(tr.desc || '')}</textarea>

      <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; background: #0f172a; border: 1px solid #334155; border-radius: 6px;">
        <span style="font-size: 11px; color: #94a3b8;">当前实时求值状态：</span>
        <span class="event-status-pill ${isSatisfied ? 'status-green' : 'status-grey'}" style="font-size: 11px;">
          ${isSatisfied ? '● 满足 (TRUE)' : '○ 未满足 (FALSE)'}
        </span>
      </div>
    `;
    this.container.appendChild(metaCard);

    this.bindInput(metaCard, '#trTitle', (v) => {
      project.change((d) => {
        const targetTr = d.conditions.find((x: ConditionDef) => x.id === tr.id);
        if (targetTr) targetTr.title = v;
      }, 'field', `tr_title_${tr.id}`);
    });
    this.bindInput(metaCard, '#trDesc', (v) => {
      project.change((d) => {
        const targetTr = d.conditions.find((x: ConditionDef) => x.id === tr.id);
        if (targetTr) targetTr.desc = v;
      }, 'field');
    });

    const btnDel = metaCard.querySelector('#btnDeleteCondition') as HTMLElement;
    btnDel.onclick = () => {
      project.deleteCondition(tr.id);
      appState.select(null);
      appState.log(`🗑️ 已删除 Condition 节点：[${tr.title}]（Ctrl+Z 可撤销）`);
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
      const m = (e.target as HTMLSelectElement).value as 'all' | 'any';
      project.change((d) => {
        const targetTr = d.conditions.find((x: ConditionDef) => x.id === tr.id);
        if (targetTr) targetTr.match = m;
      }, 'field');
    });

    condCard.querySelector('#btnAddCond')?.addEventListener('click', () => {
      const first = p.vars[0];
      if (!first) return;
      project.change((d) => {
        const targetTr = d.conditions.find((x: ConditionDef) => x.id === tr.id);
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

  private renderCondItem(tr: ConditionDef, c: CmpCond, cIdx: number): HTMLElement {
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
      const v = selVar.value;
      project.change((d) => {
        const targetTr = d.conditions.find((x: ConditionDef) => x.id === tr.id);
        if (targetTr && targetTr.conds[cIdx]) {
          targetTr.conds[cIdx].var = v;
        }
      }, 'field');
    };

    const selOp = row.querySelector('.cond-op') as HTMLSelectElement;
    selOp.onchange = () => {
      const op = selOp.value as CmpCond['op'];
      project.change((d) => {
        const targetTr = d.conditions.find((x: ConditionDef) => x.id === tr.id);
        if (targetTr && targetTr.conds[cIdx]) {
          targetTr.conds[cIdx].op = op;
        }
      }, 'field');
    };

    const inpVal = row.querySelector('.cond-val') as HTMLInputElement;
    inpVal.oninput = () => {
      const txt = inpVal.value.trim();
      let val: any = txt;
      if (txt === 'true') val = true;
      else if (txt === 'false') val = false;
      else if (!isNaN(Number(txt)) && txt !== '') val = Number(txt);
      project.change((d) => {
        const targetTr = d.conditions.find((x: ConditionDef) => x.id === tr.id);
        if (targetTr && targetTr.conds[cIdx]) {
          targetTr.conds[cIdx].value = val;
        }
      }, 'field', `tr_cond_val_${tr.id}_${cIdx}`);
    };

    row.querySelector('.btn-del-cond')?.addEventListener('click', () => {
      project.change((d) => {
        const targetTr = d.conditions.find((x: ConditionDef) => x.id === tr.id);
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
    const isEdit = appState.getMode() === 'edit';

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
          <span class="event-type-badge" style="background:#065f46; color:#a7f3d0;">${catTitle}</span>
          <span class="event-status-pill status-blue">当前值: ${val === undefined ? '∅' : String(val)}</span>
        </div>

        <div class="inspector-field">
          <label class="inspector-label">实体名称与图标</label>
          <div style="display: flex; gap: 8px;">
            <input id="editVarIcon" class="inspector-input" style="width: 48px; text-align: center; font-size: 18px; padding: 4px;" value="${v.icon}" />
            <input id="editVarLabel" class="inspector-input" style="flex: 1; font-weight: 600;" value="${this.escape(v.label)}" />
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
            <input class="inspector-input" style="font-family: monospace; font-size: 11px; background:#1e293b; color:#94a3b8;" value="${v.key}" readonly />
          </div>
        </div>

        <div class="inspector-field">
          <label class="inspector-label">描述说明 (Description)</label>
          <textarea id="editVarDesc" class="inspector-textarea" rows="3" placeholder="描述此实体的用途、获取途径与前置依赖...">${this.escape(v.desc || '')}</textarea>
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

      this.bindInput(card, '#editVarLabel', (val) => {
        project.change((d) => {
          const target = d.vars.find((x) => x.key === v.key);
          if (target) target.label = val.trim() || '未命名实体';
        }, 'field', `var_label_${v.key}`);
      });
      this.bindInput(card, '#editVarIcon', (val) => {
        project.change((d) => {
          const target = d.vars.find((x) => x.key === v.key);
          if (target) target.icon = val.trim() || '🔹';
        }, 'field', `var_icon_${v.key}`);
      });
      this.bindInput(card, '#editVarDesc', (val) => {
        project.change((d) => {
          const target = d.vars.find((x) => x.key === v.key);
          if (target) target.desc = val.trim();
        }, 'field', `var_desc_${v.key}`);
      });
      card.querySelector('#editVarCategory')?.addEventListener('change', (e) => {
        const newCat = (e.target as HTMLSelectElement).value as VarCategory;
        project.change((d) => {
          const target = d.vars.find((x) => x.key === v.key);
          if (target) target.category = newCat;
        }, 'structure');
      });
    } else {
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span class="event-type-badge" style="background:#065f46; color:#a7f3d0;">${catTitle}</span>
          <span class="event-status-pill status-blue">当前值: ${val === undefined ? '∅' : String(val)}</span>
        </div>

        <div style="font-size: 16px; font-weight: 700; color: #fff; margin-bottom: 4px;">
          ${v.icon} ${this.escape(v.label)}
        </div>
        <div style="font-size: 11px; color: #64748b; font-family: monospace; margin-bottom: 8px;">
          key: ${v.key} · 类型: ${v.kind}
        </div>
        <div style="font-size: 12px; color: #94a3b8; line-height: 1.5; margin-bottom: 12px;">
          ${this.escape(v.desc || '该变量由游戏内 Event 执行改变，并在 Condition 条件中被读取。')}
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
    }
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
