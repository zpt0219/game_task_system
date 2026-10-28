import { ViewModel } from '../app/viewModel';
import { DocumentChangeSource, LogEntry } from '../command/events';
import { StateChangeMeta } from '../core/session';
import { WorldState } from '../core/types';
import { Panel } from './Panel';

export class StateSidebar extends Panel {
  private container: HTMLElement;
  private controlsRoot: HTMLElement;
  private logBox: HTMLElement;
  private pendingFlashKeys = new Set<string>();

  constructor(vm: ViewModel) {
    super(vm);
    this.container = document.getElementById('leftSidebar') as HTMLElement;

    // 将状态控制区与实时日志容器彻底解耦，避免重绘时清空日志（修复 Bug #1）
    this.container.innerHTML = `
      <div id="sidebarControlsRoot"></div>
      <section class="panel-section" style="flex: 1; display: flex; flex-direction: column;">
        <div class="panel-title">
          <span>📜 实时事件与状态流转日志</span>
        </div>
        <div id="logBox" class="log-box"></div>
      </section>
    `;
    this.controlsRoot = this.container.querySelector('#sidebarControlsRoot') as HTMLElement;
    this.logBox = this.container.querySelector('#logBox') as HTMLElement;

    // 同步已有日志
    for (let i = this.vm.context.logs.length - 1; i >= 0; i--) {
      this.renderLogEntry(this.vm.context.logs[i]);
    }

    this.render();
  }

  onProjectLoaded(): void {
    this.markDirty();
  }

  onSessionChanged(): void {
    this.markDirty();
  }

  onWorldStateChanged(_state: WorldState, meta?: StateChangeMeta): void {
    if (meta && meta.changedVars && meta.changedVars.length > 0) {
      meta.changedVars.forEach((k) => this.pendingFlashKeys.add(k));
    }
    this.markDirty();
  }

  onDocumentChanged(source: DocumentChangeSource): void {
    if (source !== 'drag' && source !== 'field') {
      this.markDirty();
    }
  }

  onLogAdded(entry: LogEntry): void {
    this.renderLogEntry(entry);
  }

  override render(): void {
    const doc = this.vm.doc;
    const state = this.vm.session.worldState;
    const isEdit = this.vm.session.mode === 'edit';

    // 提取主要属性
    const hp = Number(state['hero.hp'] ?? 60);
    const maxHp = Number(state['hero.maxHp'] ?? 100);
    const atk = Number(state['hero.attack'] ?? 40);
    const def = Number(state['hero.defence'] ?? 40);
    const gold = Number(state['hero.gold'] ?? 50);

    const hpPct = Math.min(100, Math.max(0, Math.round((hp / maxHp) * 100)));

    // 分类变量
    const partyVars = doc.vars.filter((v) => v.category === 'party');
    const itemVars = doc.vars.filter((v) => v.category === 'item');
    const tpVars = doc.vars.filter((v) => v.category === 'teleport');
    const achVars = doc.vars.filter((v) => v.category === 'achievement');
    const flagVars = doc.vars.filter((v) => v.category === 'flag');

    this.controlsRoot.innerHTML = `
      <!-- 勇者基础属性 -->
      <section class="panel-section">
        <div class="panel-title">
          <span>👑 勇者当前属性</span>
        </div>
        <div class="hero-stats-grid">
          <div class="stat-item" style="grid-column: span 2;">
            <div class="stat-label">生命值 HP</div>
            <div class="stat-val-row">
              <span id="statHp" class="stat-value" style="color: #34d399;">${hp} / ${maxHp}</span>
              <div class="stat-btn-group">
                <button id="btnHpMinus" class="mini-btn" title="-10 HP">-</button>
                <button id="btnHpPlus" class="mini-btn" title="+10 HP">+</button>
              </div>
            </div>
            <div class="hp-bar-wrap">
              <div id="hpBarFill" class="hp-bar-fill" style="width: ${hpPct}%;"></div>
            </div>
          </div>
          <div class="stat-item">
            <div class="stat-label">攻击力 ATK</div>
            <div class="stat-val-row">
              <span class="stat-value" style="color: #f87171;">${atk}</span>
            </div>
          </div>
          <div class="stat-item">
            <div class="stat-label">防御力 DEF</div>
            <div class="stat-val-row">
              <span class="stat-value" style="color: #60a5fa;">${def}</span>
            </div>
          </div>
          <div class="stat-item" style="grid-column: span 2;">
            <div class="stat-label">金币 GOLD</div>
            <div class="stat-val-row">
              <span id="statGold" class="stat-value" style="color: #fbbf24;">${gold} G</span>
              <button id="btnGoldPlus" class="mini-btn" style="width: auto; padding: 2px 8px;" title="+100 金币">+100G</button>
            </div>
          </div>
        </div>
      </section>

      <!-- 队伍同行同伴 -->
      <section class="panel-section">
        <div class="panel-title">
          <span>👥 当前队伍同伴 (Party)</span>
        </div>
        <div class="party-list">
          <div class="party-item active">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span>👑</span>
              <span style="font-weight: 600; font-size: 13px;">紫水晶勇者</span>
            </div>
            <span style="font-size: 11px; color: #94a3b8;">领队</span>
          </div>
          ${partyVars
            .map((v) => {
              const inParty = state[v.key] === true;
              return `
              <div class="party-item var-clickable ${inParty ? 'active' : ''}" data-key="${v.key}" title="点击打开此实体的专属因果图谱">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span>${v.icon}</span>
                  <div>
                    <div style="font-weight: 600; font-size: 13px;">${v.label}</div>
                    <div style="font-size: 10px; color: #9ca3af;">${v.desc || ''}</div>
                  </div>
                </div>
                <span class="item-status ${inParty ? 'status-green' : 'status-grey'}">
                  ${inParty ? '✓ 已在队' : '未入队'}
                </span>
              </div>
            `;
            })
            .join('')}
        </div>
      </section>

      <!-- 拥有道具 -->
      <section class="panel-section">
        <div class="panel-title">
          <span>🎒 关键道具 (Items)</span>
        </div>
        <div class="items-grid">
          ${itemVars
            .map((v) => {
              const owned = state[v.key] === true;
              return `
              <div class="item-badge var-clickable ${owned ? 'owned' : ''}" data-key="${v.key}" title="点击打开此实体的专属因果图谱">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span>${v.icon}</span>
                  <span style="font-size: 13px; font-weight: 600;">${v.label}</span>
                </div>
                <span class="item-status ${owned ? 'status-green' : 'status-grey'}" style="font-size: 11px;">
                  ${owned ? '✓ 已持有' : '未拥有'}
                </span>
              </div>
            `;
            })
            .join('')}
        </div>
      </section>

      <!-- 传送点网络 -->
      <section class="panel-section">
        <div class="panel-title">
          <span>🗽 地图传送点 (Teleport)</span>
        </div>
        ${tpVars
          .map((v) => {
            const active = state[v.key] === true;
            return `
            <div class="party-item var-clickable ${active ? 'active' : ''}" data-key="${v.key}" title="点击打开此实体的专属因果图谱">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span>${v.icon}</span>
                <span style="font-weight: 600; font-size: 13px;">${v.label}</span>
              </div>
              <span class="item-status ${active ? 'status-green' : 'status-grey'}">
                ${active ? '✓ 已激活' : '未激活'}
              </span>
            </div>
          `;
          })
          .join('')}
      </section>

      <!-- 难度成就监控 -->
      <section class="panel-section">
        <div class="panel-title">
          <span>🏆 难度成就监控 (Achievements)</span>
        </div>
        ${achVars
          .map((v) => {
            const achStatus = (state[v.key] as string) || 'active';
            const isFailed = achStatus === 'failed';
            return `
            <div class="achievement-item var-clickable" data-key="${v.key}" title="点击打开此实体的专属因果图谱">
              <div>
                <div style="font-size: 12px; font-weight: 600;">${v.label}</div>
                <div style="font-size: 10px; color: #9ca3af;">${v.desc || ''}</div>
              </div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <span class="ach-badge ${isFailed ? 'failed' : 'active'}">
                  ${isFailed ? '已熔断 (FAILED)' : '进行中 (ACTIVE)'}
                </span>
                <button class="mini-btn ach-reset-btn" data-key="${v.key}" title="重置此成就">↺</button>
              </div>
            </div>
          `;
          })
          .join('')}
      </section>

      ${
        flagVars.length > 0
          ? `
        <!-- 剧情推进标记 -->
        <section class="panel-section">
          <div class="panel-title"><span>🚩 区域/剧情标记 (Flags)</span></div>
          ${flagVars
            .map((v) => {
              const active = state[v.key] === true;
              return `
              <div class="party-item var-clickable" data-key="${v.key}" title="点击打开专属图谱">
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span>${v.icon}</span>
                  <span style="font-size: 12px;">${v.label}</span>
                </div>
                <span class="item-status ${active ? 'status-green' : 'status-grey'}">${active ? '已达成' : '未达成'}</span>
              </div>
            `;
            })
            .join('')}
        </section>
      `
          : ''
      }

      ${
        isEdit
          ? `
        <!-- 编辑模式：添加新变量 -->
        <section class="panel-section" style="border: 1px dashed #38bdf8;">
          <button id="btnAddVar" class="mini-btn-action" style="width: 100%; padding: 6px; font-size: 11px;">
            + 注册新变量 (人物 / 道具 / 传送点 / 成就)
          </button>
        </section>
      `
          : ''
      }
    `;

    // 绑定基础微调按钮
    this.controlsRoot.querySelector('#btnHpMinus')?.addEventListener('click', () => {
      this.vm.mutateWorldState((s) => {
        s['hero.hp'] = Math.max(1, Number(s['hero.hp'] ?? 60) - 10);
      });
    });

    this.controlsRoot.querySelector('#btnHpPlus')?.addEventListener('click', () => {
      this.vm.mutateWorldState((s) => {
        const curMax = Number(s['hero.maxHp'] ?? 100);
        s['hero.hp'] = Math.min(curMax, Number(s['hero.hp'] ?? 60) + 10);
      });
    });

    this.controlsRoot.querySelector('#btnGoldPlus')?.addEventListener('click', () => {
      this.vm.mutateWorldState((s) => {
        s['hero.gold'] = Number(s['hero.gold'] ?? 50) + 100;
      });
      this.vm.log('💰 调试辅助：+100 金币入账！');
    });

    // 成就单项重置
    this.controlsRoot.querySelectorAll('.ach-reset-btn').forEach((btn) => {
      (btn as HTMLElement).onclick = (e) => {
        e.stopPropagation();
        const key = (btn as HTMLElement).dataset.key;
        if (key) {
          this.vm.mutateWorldState((s) => {
            s[key] = 'active';
          });
          this.vm.log(`🏆 成就状态已重置为进行中：[${key}]`);
        }
      };
    });

    // 点击变量项：聚焦并打开该变量的专属因果图谱！
    this.controlsRoot.querySelectorAll('.var-clickable').forEach((el) => {
      (el as HTMLElement).onclick = () => {
        const key = (el as HTMLElement).dataset.key;
        if (key) {
          this.vm.select({ kind: 'var', id: key });
          this.vm.setFocalVar(key);
          this.vm.log(`🎯 打开变量 [${key}] 专属图谱，展现所有读写关联。`, true);
        }
      };
    });

    // 编辑模式添加变量
    this.controlsRoot.querySelector('#btnAddVar')?.addEventListener('click', () => {
      this.vm.openRegisterVarModal();
    });

    if (this.pendingFlashKeys.size > 0) {
      const keys = [...this.pendingFlashKeys];
      this.pendingFlashKeys.clear();
      keys.forEach((k) => this.flashVarItem(k));
    }
  }

  private flashVarItem(key: string): void {
    const el = this.controlsRoot.querySelector(`[data-key="${key}"]`) as HTMLElement | null;
    if (el) {
      el.classList.add('var-item-glow');
      setTimeout(() => el.classList.remove('var-item-glow'), 1400);
    }
    if (key === 'hero.hp') {
      const hpEl = document.getElementById('statHp');
      if (hpEl) {
        hpEl.classList.add('var-item-glow');
        setTimeout(() => hpEl.classList.remove('var-item-glow'), 1400);
      }
    } else if (key === 'hero.gold') {
      const goldSpan = this.controlsRoot.querySelector(
        '#statGold, .stat-item:has(#btnGoldPlus)'
      ) as HTMLElement | null;
      if (goldSpan) {
        goldSpan.classList.add('var-item-glow');
        setTimeout(() => goldSpan.classList.remove('var-item-glow'), 1400);
      }
    }
  }

  private renderLogEntry(entry: LogEntry): void {
    if (!this.logBox) return;
    const div = document.createElement('div');
    div.className = `log-entry ${entry.isHighlight ? 'highlight' : ''}`;
    div.innerHTML = `[${entry.time}] ${entry.message}`;
    this.logBox.prepend(div);
  }
}
