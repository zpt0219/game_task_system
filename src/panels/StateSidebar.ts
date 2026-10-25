import { WorldState } from '../core/types';
import { appState } from '../core/state';
import { CONDITION_NODES } from '../core/castleData';

export class StateSidebar {
  private statHp: HTMLElement;
  private hpBarFill: HTMLElement;
  private statAtk: HTMLElement;
  private statDef: HTMLElement;
  private statGold: HTMLElement;
  private btnHpMinus: HTMLButtonElement;
  private btnHpPlus: HTMLButtonElement;
  private btnGoldPlus: HTMLButtonElement;

  private partyPrincessItem: HTMLElement;
  private partyPrincessStatusPill: HTMLElement;

  private itemBookBadge: HTMLElement;
  private itemMapBadge: HTMLElement;
  private itemHpGemBadge: HTMLElement;

  private tpCastleItem: HTMLElement;
  private tpCastleStatusPill: HTMLElement;

  private achNightmareItem: HTMLElement;
  private achHardItem: HTMLElement;
  private achNormalItem: HTMLElement;
  private achNightmareBadge: HTMLElement;
  private achHardBadge: HTMLElement;
  private achNormalBadge: HTMLElement;

  private logBox: HTMLElement;

  constructor() {
    this.statHp = document.getElementById('statHp') as HTMLElement;
    this.hpBarFill = document.getElementById('hpBarFill') as HTMLElement;
    this.statAtk = document.getElementById('statAtk') as HTMLElement;
    this.statDef = document.getElementById('statDef') as HTMLElement;
    this.statGold = document.getElementById('statGold') as HTMLElement;
    this.btnHpMinus = document.getElementById('btnHpMinus') as HTMLButtonElement;
    this.btnHpPlus = document.getElementById('btnHpPlus') as HTMLButtonElement;
    this.btnGoldPlus = document.getElementById('btnGoldPlus') as HTMLButtonElement;

    this.partyPrincessItem = document.getElementById('partyPrincessItem') as HTMLElement;
    this.partyPrincessStatusPill = document.getElementById('partyPrincessStatusPill') as HTMLElement;

    this.itemBookBadge = document.getElementById('itemBookBadge') as HTMLElement;
    this.itemMapBadge = document.getElementById('itemMapBadge') as HTMLElement;
    this.itemHpGemBadge = document.getElementById('itemHpGemBadge') as HTMLElement;

    this.tpCastleItem = document.getElementById('tpCastleItem') as HTMLElement;
    this.tpCastleStatusPill = document.getElementById('tpCastleStatusPill') as HTMLElement;

    this.achNightmareItem = document.getElementById('achNightmareItem') as HTMLElement;
    this.achHardItem = document.getElementById('achHardItem') as HTMLElement;
    this.achNormalItem = document.getElementById('achNormalItem') as HTMLElement;
    this.achNightmareBadge = document.getElementById('achNightmareBadge') as HTMLElement;
    this.achHardBadge = document.getElementById('achHardBadge') as HTMLElement;
    this.achNormalBadge = document.getElementById('achNormalBadge') as HTMLElement;

    this.logBox = document.getElementById('logBox') as HTMLElement;

    this.bindEvents();

    appState.onStateChange((state) => this.render(state));
    appState.onLog((msg, isHighlight) => this.appendLog(msg, isHighlight));

    this.render(appState.getState());
  }

  private focusConditionNode(conditionId: string, label: string): void {
    const node = CONDITION_NODES.find((n) => n.id === conditionId);
    if (node) {
      appState.setSelectedNode(node);
      appState.setFocalEntity(conditionId);
      appState.log(`🎯 打开 [${label}] 独立图谱，展示围绕它的所有对话与依赖节点。`, true);
    }
  }

  private bindEvents(): void {
    // 基础属性微调 (辅助调试用)
    this.btnHpMinus.onclick = () => {
      appState.mutate((s) => {
        s.hero.hp = Math.max(1, s.hero.hp - 10);
      });
    };

    this.btnHpPlus.onclick = () => {
      appState.mutate((s) => {
        s.hero.hp = Math.min(s.hero.maxHp, s.hero.hp + 10);
      });
    };

    this.btnGoldPlus.onclick = () => {
      appState.mutate((s) => {
        s.hero.gold += 100;
      });
      appState.log('💰 调试辅助：+100 金币入账！');
    };

    // 点击人物/道具/传送点/成就，不再直接改变状态！
    // 而是以该实体为中心，在画布和右侧栏展开与其关联的所有对话节点
    this.partyPrincessItem.onclick = () => {
      this.focusConditionNode('cond_princess_in_party', '紫水晶公主');
    };

    this.itemBookBadge.onclick = () => {
      this.focusConditionNode('cond_has_book', '冒险书 (book)');
    };

    this.itemMapBadge.onclick = () => {
      this.focusConditionNode('cond_has_map', '世界地图 (map)');
    };

    this.itemHpGemBadge.onclick = () => {
      this.focusConditionNode('cond_has_hp_gem', '生命宝珠 (hp_gem)');
    };

    this.tpCastleItem.onclick = () => {
      this.focusConditionNode('cond_castle_tp', '王城传送点 (castle)');
    };

    this.achNightmareItem.onclick = () => {
      this.focusConditionNode('cond_ach_nightmare', '噩梦难度成就');
    };

    this.achHardItem.onclick = () => {
      this.focusConditionNode('cond_ach_hard', '困难难度成就');
    };

    this.achNormalItem.onclick = () => {
      this.focusConditionNode('cond_ach_normal', '普通难度成就');
    };

    // 成就重置辅助按钮
    document.querySelectorAll('.ach-reset-btn').forEach((btn) => {
      (btn as HTMLElement).onclick = (e) => {
        e.stopPropagation();
        const achKey = (btn as HTMLElement).dataset.key as
          | 'no_use_princess'
          | 'no_use_bed'
          | 'no_use_money';
        appState.mutate((s) => {
          s.achievements[achKey] = 'active';
        });
        appState.log(`🏆 成就状态已重置为进行中：[${achKey}]`);
      };
    });
  }

  public render(state: WorldState): void {
    // 属性
    this.statHp.textContent = `${state.hero.hp} / ${state.hero.maxHp}`;
    const pct = Math.min(100, Math.round((state.hero.hp / state.hero.maxHp) * 100));
    this.hpBarFill.style.width = `${pct}%`;
    this.statAtk.textContent = String(state.hero.attack);
    this.statDef.textContent = String(state.hero.defence);
    this.statGold.textContent = `${state.hero.gold} G`;

    // 队伍 (只读反映游戏实际状态)
    if (state.party.princess) {
      this.partyPrincessItem.classList.add('active');
      this.partyPrincessStatusPill.textContent = '✓ 已在队中';
      this.partyPrincessStatusPill.className = 'item-status status-green';
    } else {
      this.partyPrincessItem.classList.remove('active');
      this.partyPrincessStatusPill.textContent = '未在队';
      this.partyPrincessStatusPill.className = 'item-status status-grey';
    }

    // 道具 (只读反映游戏实际状态)
    this.updateItemPill(this.itemBookBadge, state.items.book);
    this.updateItemPill(this.itemMapBadge, state.items.map);
    this.updateItemPill(this.itemHpGemBadge, state.items.hp_gem);

    // 传送点 (只读反映游戏实际状态)
    if (state.teleports.castle) {
      this.tpCastleItem.classList.add('active');
      this.tpCastleStatusPill.textContent = '✓ 已激活';
      this.tpCastleStatusPill.className = 'item-status status-green';
    } else {
      this.tpCastleItem.classList.remove('active');
      this.tpCastleStatusPill.textContent = '未激活';
      this.tpCastleStatusPill.className = 'item-status status-grey';
    }

    // 成就
    this.updateAchBadge(this.achNightmareBadge, state.achievements.no_use_princess);
    this.updateAchBadge(this.achHardBadge, state.achievements.no_use_bed);
    this.updateAchBadge(this.achNormalBadge, state.achievements.no_use_money);
  }

  private updateItemPill(badgeEl: HTMLElement, isOwned: boolean): void {
    const statusText = badgeEl.querySelector('.item-status') as HTMLElement;
    if (isOwned) {
      badgeEl.classList.add('owned');
      if (statusText) {
        statusText.textContent = '✓ 已持有';
        statusText.className = 'item-status status-green';
      }
    } else {
      badgeEl.classList.remove('owned');
      if (statusText) {
        statusText.textContent = '未拥有';
        statusText.className = 'item-status status-grey';
      }
    }
  }

  private updateAchBadge(badgeEl: HTMLElement, status: string): void {
    badgeEl.className = `ach-badge ${status}`;
    badgeEl.textContent = status === 'active' ? '进行中 (ACTIVE)' : '已熔断 (FAILED)';
  }

  public appendLog(message: string, isHighlight = false): void {
    const time = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = `log-entry ${isHighlight ? 'highlight' : ''}`;
    entry.innerHTML = `[${time}] ${message}`;
    this.logBox.prepend(entry);
  }
}
