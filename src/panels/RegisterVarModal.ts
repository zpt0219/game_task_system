import { project } from '../core/project';
import { appState } from '../core/state';
import { VarCategory, VarDef } from '../core/types';

interface CategoryConfig {
  id: VarCategory;
  title: string;
  badge: string;
  desc: string;
  defaultIcon: string;
  prefix: string;
  placeholderName: string;
  placeholderDesc: string;
  emojis: string[];
}

const CATEGORIES: CategoryConfig[] = [
  {
    id: 'party',
    title: '人物 (Party)',
    badge: 'party.*',
    desc: '同伴角色、队伍成员或关键 NPC',
    defaultIcon: '👸',
    prefix: 'party.',
    placeholderName: '例如：紫水晶公主 / 见习圣骑士',
    placeholderDesc: '例如：在城堡大厅与国王对话后加入队伍，是离开城堡大门的前置依赖',
    emojis: ['👸', '🧙', '🧝', '⚔️', '👑', '🛡️', '🦊', '🐱']
  },
  {
    id: 'item',
    title: '道具 (Item)',
    badge: 'items.*',
    desc: '任务关键道具、消耗品、钥匙或宝物',
    defaultIcon: '🎒',
    prefix: 'items.',
    placeholderName: '例如：王室冒险书 / 地牢钥匙 / 生命宝珠',
    placeholderDesc: '例如：由国王赠送，用于记录冒险历程，是开启后续任务的凭据',
    emojis: ['🎒', '📘', '🗺️', '💎', '🗡️', '🛡️', '🔑', '📦', '🧪', '📜']
  },
  {
    id: 'teleport',
    title: '传送点 (Teleport)',
    badge: 'teleports.*',
    desc: '地图传送阵、路标或快捷通道',
    defaultIcon: '🗽',
    prefix: 'teleports.',
    placeholderName: '例如：王城女神像 / 海滩传送阵',
    placeholderDesc: '例如：玩家探索至城堡正门时激活，可随时传送回初始区域',
    emojis: ['🗽', '🌀', '📍', '⛩️', '🏰', '🚪', '✨']
  },
  {
    id: 'achievement',
    title: '成就 (Achievement)',
    badge: 'achievements.*',
    desc: '难度限制、挑战目标与剧情里程碑',
    defaultIcon: '🏆',
    prefix: 'achievements.',
    placeholderName: '例如：噩梦：不使用公主 / 困难：不用私房钱',
    placeholderDesc: '例如：如果在试玩中触发了公主入队，此成就状态将熔断为 failed',
    emojis: ['🏆', '⭐', '🎖️', '🥇', '👑', '🔥', '💀', '🎯']
  }
];

export class RegisterVarModal {
  private static instance: RegisterVarModal | null = null;
  private overlay: HTMLElement;
  private selectedCategory: VarCategory = 'item';
  private selectedIcon = '🎒';
  private keyManuallyEdited = false;
  private onCreatedCallback?: (v: VarDef) => void;

  private constructor() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'var-modal-overlay';
    document.body.appendChild(this.overlay);

    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.close();
      }
    });

    window.addEventListener('keydown', (e) => {
      if (!this.overlay.classList.contains('show')) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.submit();
      }
    });
  }

  public static getInstance(): RegisterVarModal {
    if (!RegisterVarModal.instance) {
      RegisterVarModal.instance = new RegisterVarModal();
    }
    return RegisterVarModal.instance;
  }

  public static open(defaultCategory: VarCategory = 'item', onCreated?: (v: VarDef) => void): void {
    const modal = RegisterVarModal.getInstance();
    modal.onCreatedCallback = onCreated;
    modal.selectedCategory = defaultCategory;
    const cat = CATEGORIES.find((c) => c.id === defaultCategory) || CATEGORIES[1];
    modal.selectedIcon = cat.defaultIcon;
    modal.keyManuallyEdited = false;
    modal.render();
    modal.overlay.classList.add('show');
  }

  public static close(): void {
    RegisterVarModal.getInstance().close();
  }

  private close(): void {
    this.overlay.classList.remove('show');
  }

  private render(): void {
    const currentCat = CATEGORIES.find((c) => c.id === this.selectedCategory) || CATEGORIES[1];

    this.overlay.innerHTML = `
      <div class="var-modal-box">
        <div class="var-modal-header">
          <div class="var-modal-title">
            <span>✨</span>
            <span>注册新状态变量 (Register Variable)</span>
          </div>
          <button id="btnModalClose" class="var-modal-close-btn" title="关闭 (ESC)">✕</button>
        </div>

        <div class="var-modal-body">
          <!-- 1. 选择分类 -->
          <div class="var-form-group">
            <label class="var-form-label">
              <span>🏷️ 变量类型 (请选择实体类型)</span>
            </label>
            <div class="var-category-grid">
              ${CATEGORIES.map(
                (cat) => `
                <div class="var-cat-card ${cat.id === this.selectedCategory ? 'active' : ''}" data-cat="${cat.id}">
                  <div class="var-cat-icon">${cat.defaultIcon}</div>
                  <div class="var-cat-info">
                    <div class="var-cat-name">
                      <span>${cat.title}</span>
                      <span class="var-cat-badge">${cat.badge}</span>
                    </div>
                    <div class="var-cat-desc">${cat.desc}</div>
                  </div>
                </div>
              `
              ).join('')}
            </div>
          </div>

          <!-- 2. 实体名称与图标 -->
          <div style="display: grid; grid-template-columns: 80px 1fr; gap: 12px; align-items: flex-start;">
            <div class="var-form-group">
              <label class="var-form-label"><span>图标</span></label>
              <input id="inputVarIcon" class="var-form-input" style="text-align: center; font-size: 20px; padding: 5px;" value="${this.selectedIcon}" maxlength="4" />
            </div>
            <div class="var-form-group">
              <label class="var-form-label"><span>名称 (Label)</span> <span style="color:#f87171;">*</span></label>
              <input id="inputVarLabel" class="var-form-input" placeholder="${currentCat.placeholderName}" autofocus />
            </div>
          </div>

          <!-- 图标快捷推荐 -->
          <div class="var-emoji-presets">
            ${currentCat.emojis
              .map(
                (em) => `
              <button type="button" class="var-emoji-btn ${em === this.selectedIcon ? 'active' : ''}" data-emoji="${em}">${em}</button>
            `
              )
              .join('')}
          </div>

          <!-- 3. 变量标识符 Key -->
          <div class="var-form-group">
            <label class="var-form-label">
              <span>🔑 唯一标识键名 (Key)</span>
              <span style="font-size: 10px; color: #94a3b8; font-weight: normal;">(供代码、Condition、Action 引用)</span>
            </label>
            <div class="var-key-input-wrap">
              <div id="keyPrefixBadge" class="var-key-prefix">${currentCat.prefix}</div>
              <input id="inputVarKeySuffix" class="var-form-input" placeholder="例如：holy_sword" />
            </div>
            <div id="keyValidationMsg" style="font-size: 11px; margin-top: 3px; display: none;"></div>
          </div>

          <!-- 4. 描述 -->
          <div class="var-form-group">
            <label class="var-form-label">
              <span>📝 描述说明 (Description)</span>
              <span style="font-size: 10px; color: #94a3b8; font-weight: normal;">(交代获取途径、前置条件或剧情作用)</span>
            </label>
            <textarea id="inputVarDesc" class="var-form-textarea" rows="3" placeholder="${currentCat.placeholderDesc}"></textarea>
          </div>

          <!-- 5. 初始值设置 -->
          <div class="var-form-group">
            <label class="var-form-label"><span>⚙️ 游戏开局初始状态</span></label>
            <div id="initialValueWrap" style="display: flex; gap: 10px;">
              ${this.renderInitialControl(currentCat.id)}
            </div>
          </div>
        </div>

        <div class="var-modal-footer">
          <button id="btnModalCancel" class="dialog-btn" style="background:#334155; color:#cbd5e1;">取消 (ESC)</button>
          <button id="btnModalSubmit" class="dialog-btn primary-btn" style="padding: 7px 20px; display: flex; align-items: center; gap: 6px;">
            <span>✨</span> 确认注册并创建
          </button>
        </div>
      </div>
    `;

    this.bindEvents();
    // 聚焦名称输入框
    setTimeout(() => {
      const labelInput = this.overlay.querySelector('#inputVarLabel') as HTMLInputElement | null;
      labelInput?.focus();
    }, 50);
  }

  private renderInitialControl(category: VarCategory): string {
    if (category === 'achievement') {
      return `
        <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: #10b981; cursor: pointer;">
          <input type="radio" name="varInitialVal" value="active" checked />
          <span>● 初始进行中 (active)</span>
        </label>
        <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: #f87171; cursor: pointer;">
          <input type="radio" name="varInitialVal" value="failed" />
          <span>● 初始已熔断 (failed)</span>
        </label>
      `;
    }
    return `
      <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: #94a3b8; cursor: pointer;">
        <input type="radio" name="varInitialVal" value="false" checked />
        <span>○ 初始未拥有 / 未入队 / 未激活 (false)</span>
      </label>
      <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: #10b981; cursor: pointer;">
        <input type="radio" name="varInitialVal" value="true" />
        <span>● 初始已持有 / 已入队 / 已激活 (true)</span>
      </label>
    `;
  }

  private bindEvents(): void {
    // 关闭按钮
    this.overlay.querySelector('#btnModalClose')?.addEventListener('click', () => this.close());
    this.overlay.querySelector('#btnModalCancel')?.addEventListener('click', () => this.close());
    this.overlay.querySelector('#btnModalSubmit')?.addEventListener('click', () => this.submit());

    // 分类卡片切换
    this.overlay.querySelectorAll('.var-cat-card').forEach((cardEl) => {
      cardEl.addEventListener('click', () => {
        const catId = (cardEl as HTMLElement).dataset.cat as VarCategory;
        if (catId && catId !== this.selectedCategory) {
          this.selectedCategory = catId;
          const cat = CATEGORIES.find((c) => c.id === catId);
          if (cat) {
            this.selectedIcon = cat.defaultIcon;
            this.render();
          }
        }
      });
    });

    // 表单元素
    const labelInput = this.overlay.querySelector('#inputVarLabel') as HTMLInputElement | null;
    const suffixInput = this.overlay.querySelector('#inputVarKeySuffix') as HTMLInputElement | null;
    const iconInput = this.overlay.querySelector('#inputVarIcon') as HTMLInputElement | null;

    iconInput?.addEventListener('input', () => {
      this.selectedIcon = iconInput.value.trim() || '🔹';
    });

    // 点击 Emoji 快捷按钮
    this.overlay.querySelectorAll('.var-emoji-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const em = (btn as HTMLElement).dataset.emoji;
        if (em) {
          this.selectedIcon = em;
          if (iconInput) iconInput.value = em;
          this.overlay.querySelectorAll('.var-emoji-btn').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
        }
      });
    });

    // 当用户手动修改 key 后，停止自动派生
    suffixInput?.addEventListener('input', () => {
      this.keyManuallyEdited = true;
      this.validateKey();
    });

    // 名称输入联动 Key 建议
    labelInput?.addEventListener('input', () => {
      if (!this.keyManuallyEdited && suffixInput) {
        const suggested = this.generateKeySuffix(labelInput.value);
        suffixInput.value = suggested;
      }
      this.validateKey();
    });

    labelInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        suffixInput?.focus();
      }
    });

    suffixInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.submit();
      }
    });
  }

  private generateKeySuffix(label: string): string {
    const raw = label.trim().toLowerCase();
    if (!raw) return '';

    // 常用中文词汇自动转纯英文 key
    const dictionary: Record<string, string> = {
      公主: 'princess',
      勇者: 'hero',
      国王: 'king',
      骑士: 'knight',
      女仆: 'maid',
      书: 'book',
      冒险书: 'book',
      地图: 'map',
      世界地图: 'map',
      钥匙: 'key',
      圣剑: 'holy_sword',
      剑: 'sword',
      宝珠: 'hp_gem',
      私房钱: 'money',
      金币: 'gold',
      金: 'gold',
      传送: 'portal',
      传送阵: 'portal',
      神像: 'statue',
      海滩: 'beach',
      城堡: 'castle',
      大门: 'gate',
      床: 'bed'
    };

    for (const [cn, en] of Object.entries(dictionary)) {
      if (raw.includes(cn)) {
        return en;
      }
    }

    // 纯英文/数字提取
    const sanitized = raw.replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    if (sanitized) return sanitized;

    return `var_${Date.now().toString(36).slice(-4)}`;
  }

  private getFullKey(): string {
    const currentCat = CATEGORIES.find((c) => c.id === this.selectedCategory) || CATEGORIES[1];
    const suffixInput = this.overlay.querySelector('#inputVarKeySuffix') as HTMLInputElement | null;
    const suffix = (suffixInput?.value || '').trim();
    return `${currentCat.prefix}${suffix}`;
  }

  private validateKey(): boolean {
    const msgEl = this.overlay.querySelector('#keyValidationMsg') as HTMLElement | null;
    const suffixInput = this.overlay.querySelector('#inputVarKeySuffix') as HTMLInputElement | null;
    if (!msgEl || !suffixInput) return true;

    const suffix = suffixInput.value.trim();
    if (!suffix) {
      msgEl.style.display = 'block';
      msgEl.style.color = '#f87171';
      msgEl.textContent = '⚠️ 键名后缀不可为空';
      return false;
    }

    const fullKey = this.getFullKey();
    const existing = project.getVar(fullKey);
    if (existing) {
      msgEl.style.display = 'block';
      msgEl.style.color = '#f87171';
      msgEl.textContent = `⚠️ 该变量键名已存在：[${existing.label}]，请更换后缀`;
      return false;
    }

    msgEl.style.display = 'block';
    msgEl.style.color = '#34d399';
    msgEl.textContent = `✓ 完整键名可用：${fullKey}`;
    return true;
  }

  private submit(): void {
    const labelInput = this.overlay.querySelector('#inputVarLabel') as HTMLInputElement | null;
    const suffixInput = this.overlay.querySelector('#inputVarKeySuffix') as HTMLInputElement | null;
    const descInput = this.overlay.querySelector('#inputVarDesc') as HTMLTextAreaElement | null;
    const iconInput = this.overlay.querySelector('#inputVarIcon') as HTMLInputElement | null;

    const label = (labelInput?.value || '').trim();
    const suffix = (suffixInput?.value || '').trim();
    const desc = (descInput?.value || '').trim();
    const icon = (iconInput?.value || this.selectedIcon || '🔹').trim();

    if (!label) {
      labelInput?.focus();
      appState.log('⚠️ 请输入实体变量名称！', true);
      return;
    }

    if (!suffix) {
      suffixInput?.focus();
      appState.log('⚠️ 请输入唯一的键名标识后缀！', true);
      return;
    }

    const fullKey = this.getFullKey();
    if (project.getVar(fullKey)) {
      suffixInput?.focus();
      appState.log(`⚠️ 变量 [${fullKey}] 已经存在，不能重复注册！`, true);
      return;
    }

    // 提取选中的初始值
    let initialVal: boolean | string = false;
    const checkedRadio = this.overlay.querySelector('input[name="varInitialVal"]:checked') as HTMLInputElement | null;
    if (checkedRadio) {
      if (checkedRadio.value === 'true') initialVal = true;
      else if (checkedRadio.value === 'false') initialVal = false;
      else initialVal = checkedRadio.value;
    }

    const kind = this.selectedCategory === 'achievement' ? 'enum' : 'bool';
    const options = this.selectedCategory === 'achievement' ? ['active', 'failed'] : undefined;

    // 1. 调用 project.addVar 注册新变量
    const newVar = project.addVar({
      key: fullKey,
      label,
      icon,
      category: this.selectedCategory,
      kind,
      initial: initialVal,
      desc,
      options
    });

    // 2. 将初始状态注入当前世界状态中
    appState.mutate((draft) => {
      draft[fullKey] = initialVal;
    });

    // 3. 关闭弹窗
    this.close();

    // 4. 选中并打开新实体的专属因果关系图谱
    appState.select({ kind: 'var', id: fullKey });
    appState.setFocalVar(fullKey);

    const catObj = CATEGORIES.find((c) => c.id === this.selectedCategory);
    appState.log(
      `✨ 成功注册【${catObj?.title || this.selectedCategory}】实体：${icon} [${label}] (${fullKey})，描述：${desc || '(无)'}`,
      true
    );

    if (this.onCreatedCallback) {
      this.onCreatedCallback(newVar);
    }
  }
}
