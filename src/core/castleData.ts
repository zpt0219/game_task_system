import {
  WorldState,
  ConditionNode,
  EventNode,
  RegionNode,
  GraphEdge,
  PresetState
} from './types';

export const INITIAL_WORLD_STATE: WorldState = {
  hero: {
    hp: 60,         // 初始设为 60/100，便于测试“公主的床”回满血效果
    maxHp: 100,
    attack: 40,
    defence: 40,
    gold: 50        // 初始设为 50，便于测试女仆训练加点
  },
  party: {
    princess: false // 紫水晶公主是否在队伍中
  },
  items: {
    book: false,    // 怪物图鉴（冒险书）
    map: false,     // 世界地图
    hp_gem: false   // 生命宝珠（跨区域联动：女仆小绿加血翻倍）
  },
  teleports: {
    castle: false   // 王城女神像传送点是否开启
  },
  achievements: {
    no_use_princess: 'active', // 噩梦难度：不使用公主
    no_use_bed: 'active',      // 困难难度：不用床/私房钱
    no_use_money: 'active'     // 普通难度：不用私房钱
  },
  regions: {
    castle_exited: false       // 是否走出大门，解锁【郊外与海滩】
  }
};

export const PRESET_STATES: PresetState[] = [
  {
    id: 'initial',
    name: '1. 初始新游戏状态 (未见国王/未开传送/公主待招募)',
    state: JSON.parse(JSON.stringify(INITIAL_WORLD_STATE))
  },
  {
    id: 'got_book',
    name: '2. 已见国王赐物 (有冒险书+地图，未激活传送)',
    state: {
      ...JSON.parse(JSON.stringify(INITIAL_WORLD_STATE)),
      items: { book: true, map: true, hp_gem: false }
    }
  },
  {
    id: 'ready_to_leave',
    name: '3. 满足出城门禁 (有书+传送点已开，双边已全绿)',
    state: {
      ...JSON.parse(JSON.stringify(INITIAL_WORLD_STATE)),
      items: { book: true, map: true, hp_gem: false },
      teleports: { castle: true }
    }
  },
  {
    id: 'princess_in_party',
    name: '4. 公主在队伍中 (噩梦成就熔断，解锁床/私房钱/离队对话)',
    state: {
      ...JSON.parse(JSON.stringify(INITIAL_WORLD_STATE)),
      items: { book: true, map: true, hp_gem: false },
      teleports: { castle: true },
      party: { princess: true },
      achievements: {
        no_use_princess: 'failed',
        no_use_bed: 'active',
        no_use_money: 'active'
      }
    }
  },
  {
    id: 'has_hp_gem_and_gold',
    name: '5. 富豪+持有生命宝珠 (测试女仆双倍加血与连续加点)',
    state: {
      hero: { hp: 120, maxHp: 200, attack: 60, defence: 55, gold: 500 },
      party: { princess: true },
      items: { book: true, map: true, hp_gem: true },
      teleports: { castle: true },
      achievements: {
        no_use_princess: 'failed',
        no_use_bed: 'failed',
        no_use_money: 'failed'
      },
      regions: { castle_exited: true }
    }
  }
];

// 条件与触发器节点定义 (Trigger 节点落在大图上作为条件判断器，连接交互节点)
export const CONDITION_NODES: ConditionNode[] = [
  {
    id: 'cond_has_book',
    type: 'condition',
    subType: 'item',
    icon: '⚡',
    title: '⚡ trigger: 持有冒险书',
    desc: '出城大门与国王后续对话的外部依赖触发器。与国王初见对话取得冒险书后触发，二者相互影响。',
    x: 460,
    y: 100,
    stateKey: 'items.book',
    showOnMainGraph: true, // 作为外部依赖 Trigger 节点落在大图上
    evaluate: (state) => state.items.book === true,
    toggle: (state) => { state.items.book = !state.items.book; }
  },
  {
    id: 'cond_has_map',
    type: 'condition',
    subType: 'item',
    icon: '🗺️',
    title: '🗺️ 拥有：世界地图 (map)',
    desc: '国王初见赠予的大陆地图。可查看周边地形。不作为任何剧情阻断 Trigger，在大图中隐藏，点击左侧背包可单独查看围绕它的图谱。',
    x: 460,
    y: 110,
    stateKey: 'items.map',
    showOnMainGraph: false, // 纯产物，不作为后续门禁 trigger，不在大图显示
    evaluate: (state) => state.items.map === true,
    toggle: (state) => { state.items.map = !state.items.map; }
  },
  {
    id: 'cond_has_hp_gem',
    type: 'condition',
    subType: 'item',
    icon: '💎',
    title: '💎 拥有：生命宝珠 (hp_gem)',
    desc: '女仆小绿拥有的贵重生命宝珠。对话内置分支产物，点击左侧背包可单独查看围绕它的图谱。',
    x: 460,
    y: 520,
    stateKey: 'items.hp_gem',
    showOnMainGraph: false, // 对话内置分支产物，不在大图显示
    evaluate: (state) => state.items.hp_gem === true,
    toggle: (state) => { state.items.hp_gem = !state.items.hp_gem; }
  },
  {
    id: 'cond_castle_tp',
    type: 'condition',
    subType: 'map',
    icon: '⚡',
    title: '⚡ trigger: 传送点已激活',
    desc: '出城大门所需外部依赖触发器之二。与城堡女神像交互祈祷后触发。',
    x: 460,
    y: 240,
    stateKey: 'teleports.castle',
    showOnMainGraph: true, // 作为出城大门 Trigger 节点落在大图上
    evaluate: (state) => state.teleports.castle === true,
    toggle: (state) => { state.teleports.castle = !state.teleports.castle; }
  },
  {
    id: 'cond_princess_in_party',
    type: 'condition',
    subType: 'character',
    icon: '⚡',
    title: '⚡ trigger: 公主在队伍',
    desc: '城堡寝宫床休息、大钟柜拿钱以及国王离队分支的外部依赖触发器。紫水晶公主入队后触发。',
    x: 460,
    y: 380,
    stateKey: 'party.princess',
    showOnMainGraph: true, // 作为床、大钟柜与国王对话的 Trigger 节点落在大图上
    evaluate: (state) => state.party.princess === true,
    toggle: (state) => {
      state.party.princess = !state.party.princess;
      if (state.party.princess) {
        state.achievements.no_use_princess = 'failed';
      }
    }
  },
  {
    id: 'cond_ach_nightmare',
    type: 'condition',
    subType: 'achievement',
    icon: '🏆',
    title: '🏆 噩梦：不使用公主',
    desc: '最高难度挑战评价。全程不邀请公主入队通关即可达成。若公主入队则立刻熔断为 FAILED。',
    x: 960,
    y: 310,
    stateKey: 'achievements.no_use_princess',
    showOnMainGraph: false, // 成就节点不显示在大图上，点击左侧成就可单独查看围绕它的图谱
    evaluate: (state) => state.achievements.no_use_princess === 'active',
    toggle: (state) => {
      state.achievements.no_use_princess =
        state.achievements.no_use_princess === 'active' ? 'failed' : 'active';
    }
  },
  {
    id: 'cond_ach_hard',
    type: 'condition',
    subType: 'achievement',
    icon: '🏆',
    title: '🏆 困难：不用床/私房钱',
    desc: '高难度挑战评价。全程不使用公主的床回满血，且不从大钟柜领取私房钱。',
    x: 960,
    y: 380,
    stateKey: 'achievements.no_use_bed',
    showOnMainGraph: false, // 成就节点不显示在大图上，点击左侧成就可单独查看围绕它的图谱
    evaluate: (state) => state.achievements.no_use_bed === 'active',
    toggle: (state) => {
      state.achievements.no_use_bed =
        state.achievements.no_use_bed === 'active' ? 'failed' : 'active';
    }
  },
  {
    id: 'cond_ach_normal',
    type: 'condition',
    subType: 'achievement',
    icon: '🏆',
    title: '🏆 普通：不用私房钱',
    desc: '普通难度挑战评价。全程不从大钟柜领取公主的私房钱。',
    x: 960,
    y: 450,
    stateKey: 'achievements.no_use_money',
    showOnMainGraph: false, // 成就节点不显示在大图上，点击左侧成就可单独查看围绕它的图谱
    evaluate: (state) => state.achievements.no_use_money === 'active',
    toggle: (state) => {
      state.achievements.no_use_money =
        state.achievements.no_use_money === 'active' ? 'failed' : 'active';
    }
  }
];

// 事件节点定义 (合并国王为一个对话节点，只保留精简 Title)
export const EVENT_NODES: EventNode[] = [
  {
    id: 'evt_king',
    type: 'event',
    subType: 'dialog',
    title: '👑 国王 (king_conversation)',
    sourceRef: 'king_conversation',
    x: 60,
    y: 100,
    desc: '王城最高统治者，顶层起始对话节点。与【⚡ trigger: 持有冒险书】相互影响：\n1. 初见未拥有冒险书时：赐予【冒险书】与【世界地图】；\n2. 若公主在队伍中：询问是否需要劝说公主离队；\n3. 其他情况：给出前往海滩对面精灵村的指引。',
    isAvailable: () => true,
    statusLabel: (state) =>
      !state.items.book
        ? '🟢 初见赐物'
        : state.party.princess
        ? '🟢 可劝离公主'
        : '💬 日常指引',
    cells: [
      {
        type: 'conditional_branch',
        condition: '!items.book',
        title: '分支 1: 初见赐物',
        text: '国王: "请带上这本[color=#cc0000]冒险书[/color]和[color=#cc0000]地图[/color]吧，激活地图上标注的[color=#cc0000]女神像[/color]就可以传送了。请去城堡里的女神像试一试！"\n-> 获得: book, map'
      },
      {
        type: 'conditional_branch',
        condition: 'party.princess == true',
        title: '分支 2: 劝说公主离队',
        text: '国王: "公主有没有给你添麻烦？需要我来劝说她离队么？"\n-> 选 [好的]: 公主离队 (party.princess = false)\n-> 选 [算了]: 继续同行'
      },
      {
        type: 'conditional_branch',
        condition: 'default (has_book && !princess)',
        title: '分支 3: 日常指引',
        text: '国王: "海滩对面的[color=#cc0000]精灵村[/color]，可以快速训练能力。还请在清理完城堡周边后优先拜访！"'
      }
    ],
    execute: (state, showDialog, log) => {
      // 分支 1: 未拿到书 -> 初见赐物
      if (!state.items.book) {
        showDialog({
          speaker: '国王',
          speakerTitle: '王城统治者',
          avatar: '👑',
          text: '请带上这本[color=#cc0000]冒险书[/color]和[color=#cc0000]地图[/color]吧，激活地图上标注的[color=#cc0000]女神像[/color]就可以传送了。请去城堡里的女神像试一试！',
          confirmText: '收下宝物',
          onConfirm: () => {
            state.items.book = true;
            state.items.map = true;
            log('👑 国王赐予了【冒险书】与【世界地图】！');
          }
        });
        return;
      }

      // 分支 2: 公主在队 -> 劝说离队
      if (state.party.princess) {
        showDialog({
          speaker: '国王',
          speakerTitle: '王城统治者',
          avatar: '👑',
          text: '公主有没有给你添麻烦？需要我来劝说她离队么？',
          options: [
            {
              text: '好的 (劝说离队)',
              className: 'danger-btn',
              onClick: () => {
                state.party.princess = false;
                log('👑 国王劝说了公主离开队伍。公主已回到城堡大厅！');
                showDialog({
                  speaker: '紫水晶公主',
                  speakerTitle: '王城公主 (离队)',
                  avatar: '👸',
                  text: '对不起勇者大人，我会在这里为你祈祷的。\n我不在的话还请记得适量[color=#00e676]提升防御[/color]来避免不必要的伤害啊~',
                  confirmText: '保重'
                });
              }
            },
            {
              text: '算了 (继续同行)',
              className: 'secondary-btn',
              onClick: () => {
                showDialog({
                  speaker: '国王',
                  speakerTitle: '王城统治者',
                  avatar: '👑',
                  text: '那就好，愿神佑你们一切顺利！',
                  confirmText: '谢陛下'
                });
              }
            }
          ]
        });
        return;
      }

      // 分支 3: 常规指引
      showDialog({
        speaker: '国王',
        speakerTitle: '王城统治者',
        avatar: '👑',
        text: '海滩对面的[color=#cc0000]精灵村[/color]，可以快速训练能力。还请在清理完城堡周边后优先拜访！',
        confirmText: '谨遵陛下嘱托',
        onConfirm: () => {
          log('👑 国王提醒你注意海滩对面的精灵村。');
        }
      });
    }
  },
  {
    id: 'evt_statue_castle',
    type: 'event',
    subType: 'interaction',
    title: '🗽 城堡女神像',
    sourceRef: 'castle_statue / enable_teleport',
    x: 60,
    y: 240,
    desc: '王城内的远古女神雕像。初次祈祷激活王城传送锚点，开启出城门禁入边2。',
    isAvailable: () => true,
    statusLabel: (state) => (state.teleports.castle ? '🔄 常驻交互' : '🟢 待激活'),
    cells: [
      {
        type: 'conditional_action',
        condition: '!teleports.castle',
        action: "enable_teleport('castle')"
      },
      {
        type: 'show_tips',
        text: '小提示：1. 随时可在设置中保存/读取 2. 拖拽屏幕可查看地图'
      }
    ],
    execute: (state, showDialog, log) => {
      if (!state.teleports.castle) {
        showDialog({
          speaker: '女神像',
          speakerTitle: '远古神迹',
          avatar: '🗽',
          text: '[color=#00e676]城堡[/color] 传送点已激活！可以在地图上传送了。\n\n[color=#ff9100]小提示[/color]：\n1. 可以随时在设置中保存/读取游戏哦\n2. 拖拽屏幕可以查看地图哦',
          confirmText: '虔诚祈祷',
          onConfirm: () => {
            state.teleports.castle = true;
            log('🗽 激活了【王城女神像传送点】！');
          }
        });
      } else {
        showDialog({
          speaker: '女神像',
          speakerTitle: '远古神迹',
          avatar: '🗽',
          text: '这里是王城女神像。传送阵正散发着柔和的光辉。\n\n[color=#ff9100]小提示[/color]：\n1. 可以随时在设置中保存/读取游戏哦\n2. 拖拽屏幕可以查看地图哦',
          confirmText: '默默致敬',
          onConfirm: () => {
            log('🗽 在王城女神像前重新祈祷。');
          }
        });
      }
    }
  },
  {
    id: 'evt_exit_castle',
    type: 'event',
    subType: 'gate',
    title: '🚪 离开城堡大门',
    sourceRef: 'hero_leave_castle_block',
    x: 820,
    y: 170,
    desc: '城堡出口门禁。具有严格的双 trigger 外部依赖输入：必须同时满足【⚡ trigger: 持有冒险书】与【⚡ trigger: 传送点已激活】。若任一未满足，公主会在门前拦截提示；均满足后通过并解锁下一区域。',
    isAvailable: () => true,
    statusLabel: (state) =>
      state.items.book && state.teleports.castle
        ? state.regions.castle_exited
          ? '✅ 已出城 (可重温)'
          : '🟢 门禁已通过 (可通行)'
        : '🔒 门禁拦截中 (需两项trigger)',
    cells: [
      {
        type: 'check_condition',
        condition: 'has_item("book")',
        fail_dialog: '紫水晶公主: 勇者大人，陛下还在等着您呢~'
      },
      {
        type: 'check_condition',
        condition: 'teleport_enabled("castle")',
        fail_dialog: '紫水晶公主: 勇者大人，去激活一下城堡里的女神像吧，这样就可以随时传送回来了~'
      },
      {
        type: 'unlock_region',
        region: 'outskirts_and_beach'
      }
    ],
    execute: (state, showDialog, log) => {
      if (!state.items.book) {
        showDialog({
          speaker: '紫水晶公主',
          speakerTitle: '王城公主 (拦截指引)',
          avatar: '👸',
          text: '勇者大人，[color=#ff5252]陛下还在等着您[/color]呢~ 还没有带上冒险书可不能冒然出城哦！',
          confirmText: '折回王座',
          onConfirm: () => {
            log('🚪 试图出城，但被公主提醒国王还在等待。');
          }
        });
        return;
      }

      if (!state.teleports.castle) {
        showDialog({
          speaker: '紫水晶公主',
          speakerTitle: '王城公主 (拦截指引)',
          avatar: '👸',
          text: '勇者大人，去激活一下[color=#ff9100]城堡里的女神像[/color]吧，这样就可以[color=#00e676]随时传送回来[/color]了~',
          confirmText: '去激活女神像',
          onConfirm: () => {
            log('🚪 试图出城，但被公主提醒还未激活女神像。');
          }
        });
        return;
      }

      showDialog({
        speaker: '系统播报',
        speakerTitle: '区域突破',
        avatar: '🎉',
        text: '[color=#00e676]大门轰然开启！[/color]\n你佩戴着冒险书与地图，脚踏传送光阵走出城堡。\n\n画布右侧已解锁【🏖️ 下一区域群落：郊外与海滩】！',
        confirmText: '奔向郊外与海滩',
        onConfirm: () => {
          state.regions.castle_exited = true;
          log('🚪 突破城堡大门！成功解锁下一区域群落【郊外与海滩】！');
        }
      });
    }
  },
  {
    id: 'evt_princess_join',
    type: 'event',
    subType: 'dialog',
    title: '👸 紫水晶公主 (对话)',
    sourceRef: 'princess_conversation',
    x: 60,
    y: 380,
    desc: '城内闲逛的紫水晶公主。不在队时可对话邀请入队，熔断噩梦成就；入队后此节点自动置灰不可点。',
    isAvailable: (state) => !state.party.princess,
    statusLabel: (state) =>
      !state.party.princess ? '🟢 可邀请入队' : '🔒 公主已在队中',
    cells: [
      {
        type: 'ask_yes_no',
        text: '可以带我一起去旅行么？(注：公主可以战斗后回血，全程不带公主是噩梦难度，第一次游戏推荐带公主)',
        yes_action: "ADD_PARTY('princess'); FAIL_ACHIEVEMENT('no_use_princess')"
      }
    ],
    execute: (state, showDialog, log) => {
      if (state.party.princess) {
        showDialog({
          speaker: '紫水晶公主',
          speakerTitle: '队伍同伴',
          avatar: '👸',
          text: '勇者大人，我已经随您在队伍中了呀！如果需要我离队，可以去王座前请示父王~',
          confirmText: '知道了'
        });
        return;
      }

      showDialog({
        speaker: '紫水晶公主',
        speakerTitle: '王城公主',
        avatar: '👸',
        text: '可以带我一起去旅行么？\n([color=#ff5252]注：公主可以战斗后回血，全程不带公主是噩梦难度，第一次游戏推荐带公主[/color])',
        options: [
          {
            text: '好的 (邀请入队)',
            className: 'primary-btn',
            onClick: () => {
              state.party.princess = true;
              state.achievements.no_use_princess = 'failed';
              log('👸 紫水晶公主加入了队伍！【噩梦难度成就】已熔断为 FAILED。');
              showDialog({
                speaker: '紫水晶公主',
                speakerTitle: '队伍同伴',
                avatar: '👸',
                text: '谢谢，我会努力协助勇者大人的！(此后您可以使用我的床休息，也可以领取私房钱了哦~)',
                confirmText: '出发！'
              });
            }
          },
          {
            text: '算了 (独自踏上旅程)',
            className: 'secondary-btn',
            onClick: () => {
              log('👸 婉拒了公主的入队邀请，保持噩梦难度挑战。');
              showDialog({
                speaker: '紫水晶公主',
                speakerTitle: '王城公主',
                avatar: '👸',
                text: '好吧，如果改变了主意随时回来找我啊！我会一直在这里等您回心转意的。',
                confirmText: '好的'
              });
            }
          }
        ]
      });
    }
  },
  {
    id: 'evt_princess_bed',
    type: 'event',
    subType: 'interaction',
    title: '🛏️ 公主的床',
    sourceRef: 'princess_bed',
    x: 820,
    y: 320,
    desc: '公主寝宫里的床铺。默认状态下点击触发观察描述；当【⚡ trigger: 公主在队伍】触发后，输出特殊休息分支并回满全部 HP。',
    isAvailable: () => true,
    statusLabel: (state) =>
      state.party.princess ? '💖 可就寝休息 (HP全满)' : '💬 默认观察 (整洁的床)',
    cells: [
      {
        type: 'check_party',
        character: 'princess',
        success: "recover_hp(100%); fail_achievement('no_use_bed')",
        fail: "show_text('一张看起来非常整洁的床')"
      }
    ],
    execute: (state, showDialog, log) => {
      if (!state.party.princess) {
        showDialog({
          speaker: '环境观察',
          speakerTitle: '城堡寝宫',
          avatar: '🛏️',
          text: '一张看起来非常整洁的床。床单铺得一丝不苟，似乎属于公主殿下。',
          confirmText: '离开'
        });
        return;
      }

      showDialog({
        speaker: '紫水晶公主',
        speakerTitle: '队伍同伴',
        avatar: '👸',
        text: '勇者大人，需要的话请在床上休息一会儿吧！\n([color=#ff9100]注：床可以无限使用回满HP，但通关时会获得普通难度评价[/color])',
        options: [
          {
            text: '好的 (就寝休息)',
            className: 'primary-btn',
            onClick: () => {
              state.hero.hp = state.hero.maxHp;
              state.achievements.no_use_bed = 'failed';
              log('🛏️ 在公主的床上休息，HP 完全恢复！【困难难度成就】已熔断。');
              showDialog({
                speaker: '系统提示',
                speakerTitle: '体力恢复',
                avatar: '💖',
                text: `精神焕发！勇者的生命值已完全恢复为 [color=#00e676]${state.hero.hp}/${state.hero.maxHp}[/color]！`,
                confirmText: '神清气爽'
              });
            }
          },
          {
            text: '算了 (稍后再休息)',
            className: 'secondary-btn',
            onClick: () => {}
          }
        ]
      });
    }
  },
  {
    id: 'evt_clock_cabinet',
    type: 'event',
    subType: 'interaction',
    title: '🕰️ 大钟柜',
    sourceRef: 'clock_cabinet',
    x: 820,
    y: 440,
    desc: '摆放在走廊的长廊钟柜。默认状态下点击触发观察描述；当【⚡ trigger: 公主在队伍】触发后，输出特殊领私房钱分支。',
    isAvailable: () => true,
    statusLabel: (state) =>
      state.party.princess ? '💰 可领私房钱 (+100G)' : '💬 默认观察 (古董摆钟)',
    cells: [
      {
        type: 'check_party',
        character: 'princess',
        success: "add_gold(100); fail_achievement('no_use_money'); fail_achievement('no_use_bed')",
        fail: "show_text('大钟发出着哒，哒的声音。下面还有个小盒子，似乎是公主的')"
      }
    ],
    execute: (state, showDialog, log) => {
      if (!state.party.princess) {
        showDialog({
          speaker: '环境观察',
          speakerTitle: '城堡长廊',
          avatar: '🕰️',
          text: '大钟发出着哒，哒的声音。下面还有个精致的小盒子，似乎是属于公主的。',
          confirmText: '合上盒子'
        });
        return;
      }

      showDialog({
        speaker: '紫水晶公主',
        speakerTitle: '队伍同伴',
        avatar: '👸',
        text: '勇者大人，这里有我的一些私房钱，请拿去使用吧。\n([color=#ff9100]注：私房钱可以无限领取，但通关时会获得简单难度评价[/color])',
        options: [
          {
            text: '收下私房钱 (+100G)',
            className: 'primary-btn',
            onClick: () => {
              state.hero.gold += 100;
              state.achievements.no_use_money = 'failed';
              state.achievements.no_use_bed = 'failed';
              log('🕰️ 领取了公主的 100 金币私房钱！【普通/困难难度成就】已熔断。');
              showDialog({
                speaker: '系统提示',
                speakerTitle: '资金入账',
                avatar: '💰',
                text: `收下了沉甸甸的钱包！当前金币变为 [color=#ffd700]${state.hero.gold} Gold[/color]！`,
                confirmText: '多谢公主'
              });
            }
          },
          {
            text: '算了 (留给公主)',
            className: 'secondary-btn',
            onClick: () => {}
          }
        ]
      });
    }
  },
  {
    id: 'evt_maid_black',
    type: 'event',
    subType: 'service',
    title: '⚔️ 女仆·小黑 (攻击)',
    sourceRef: 'maid_black (add_attack)',
    x: 40,
    y: 560,
    desc: '王国武艺侍从。消耗金币强化攻击力：10G -> +1 攻击；100G -> +10 攻击。',
    isAvailable: () => true,
    statusLabel: () => '🔄 常驻加点',
    cells: [
      { type: 'train_stat', stat: 'attack', cost10: '+1', cost100: '+10' }
    ],
    execute: (state, showDialog, log) => {
      showDialog({
        speaker: '女仆·小黑',
        speakerTitle: '武艺侍从',
        avatar: '⚔️',
        text: `勇者大人，需要训练一下攻击能力么？\n当前攻击力：[color=#ff5252]${state.hero.attack}[/color]，当前金币：[color=#ffd700]${state.hero.gold} G[/color]`,
        options: [
          {
            text: '训练 10 次 (-100G, +10攻)',
            className: state.hero.gold >= 100 ? 'primary-btn' : 'disabled-btn',
            onClick: () => {
              if (state.hero.gold < 100) {
                alert('金币不足 100G！');
                return;
              }
              state.hero.gold -= 100;
              state.hero.attack += 10;
              log(`⚔️ 女仆小黑训练完成：消耗 100G，攻击力提升至 ${state.hero.attack}！`);
            }
          },
          {
            text: '训练 1 次 (-10G, +1攻)',
            className: state.hero.gold >= 10 ? 'primary-btn' : 'disabled-btn',
            onClick: () => {
              if (state.hero.gold < 10) {
                alert('金币不足 10G！');
                return;
              }
              state.hero.gold -= 10;
              state.hero.attack += 1;
              log(`⚔️ 女仆小黑训练完成：消耗 10G，攻击力提升至 ${state.hero.attack}！`);
            }
          },
          {
            text: '稍后再来',
            className: 'secondary-btn',
            onClick: () => {}
          }
        ]
      });
    }
  },
  {
    id: 'evt_maid_white',
    type: 'event',
    subType: 'service',
    title: '🛡️ 女仆·小白 (防御)',
    sourceRef: 'maid_white (add_defence)',
    x: 340,
    y: 560,
    desc: '王国护盾侍从。消耗金币强化防御力：每 10G 提升 1 点防御力。',
    isAvailable: () => true,
    statusLabel: () => '🔄 常驻加点',
    cells: [
      { type: 'train_stat', stat: 'defence', cost10: '+1' }
    ],
    execute: (state, showDialog, log) => {
      showDialog({
        speaker: '女仆·小白',
        speakerTitle: '护盾侍从',
        avatar: '🛡️',
        text: `勇者大人，需要训练一下防御能力么？每消耗 10 金币可以提升 1 点防御力。\n当前防御力：[color=#40c4ff]${state.hero.defence}[/color]，当前金币：[color=#ffd700]${state.hero.gold} G[/color]`,
        options: [
          {
            text: '训练 1 次 (-10G, +1防)',
            className: state.hero.gold >= 10 ? 'primary-btn' : 'disabled-btn',
            onClick: () => {
              if (state.hero.gold < 10) {
                alert('金币不足 10G！');
                return;
              }
              state.hero.gold -= 10;
              state.hero.defence += 1;
              log(`🛡️ 女仆小白训练完成：消耗 10G，防御力提升至 ${state.hero.defence}！`);
            }
          },
          {
            text: '稍后再来',
            className: 'secondary-btn',
            onClick: () => {}
          }
        ]
      });
    }
  },
  {
    id: 'evt_maid_green',
    type: 'event',
    subType: 'service',
    title: '❤️ 女仆·小绿 (生命)',
    sourceRef: 'maid_green (add_max_hp)',
    x: 640,
    y: 560,
    desc: '王国生命侍从。常规 10G -> +20 MaxHP；若持有生命宝珠则翻倍为 10G -> +40 MaxHP！',
    isAvailable: () => true,
    statusLabel: () => '🔄 常驻加点',
    cells: [
      {
        type: 'conditional_branch',
        condition: '!items.hp_gem',
        title: '常规分支: 未持有生命宝珠',
        text: '女仆·小绿: "勇者大人，需要提升生命上限么？每消耗 10 金币可以提升 20 点生命上限哦~"\n-> 消耗 10G 提升 20 MaxHP'
      },
      {
        type: 'conditional_branch',
        condition: 'items.hp_gem == true',
        title: '强化分支: 持有生命宝珠 (内置对话分支)',
        text: '女仆·小绿: "哇！勇者大人身上带着[color=#00e676]生命宝珠[/color]呢！每消耗 10 金币可以提升 40 点生命上限啦！"\n-> 效果翻倍: 消耗 10G 提升 40 MaxHP'
      }
    ],
    execute: (state, showDialog, log) => {
      const hasGem = state.items.hp_gem;
      const boost = hasGem ? 40 : 20;
      const introText = hasGem
        ? '哇！勇者大人身上带着[color=#00e676]生命宝珠[/color]呢！\n有宝珠加护，现在每消耗 [color=#ffd700]10 金币[/color] 就可以提升 [color=#ff5252]40 点生命上限[/color]啦！'
        : '勇者大人，需要提升生命上限么？\n每消耗 [color=#ffd700]10 金币[/color] 就可以提升 [color=#ff5252]20 点生命上限[/color]哦~ (若找到传说中的生命宝珠效果会翻倍呢)';

      showDialog({
        speaker: '女仆·小绿',
        speakerTitle: '生命侍从',
        avatar: '❤️',
        text: `${introText}\n\n当前生命：[color=#ff5252]${state.hero.hp}/${state.hero.maxHp}[/color]，当前金币：[color=#ffd700]${state.hero.gold} G[/color]`,
        options: [
          {
            text: `强化生命 (-10G, +${boost} MaxHP)`,
            className: state.hero.gold >= 10 ? 'primary-btn' : 'disabled-btn',
            onClick: () => {
              if (state.hero.gold < 10) {
                alert('金币不足 10G！');
                return;
              }
              state.hero.gold -= 10;
              state.hero.maxHp += boost;
              state.hero.hp += boost;
              log(`❤️ 女仆小绿强化完成：消耗 10G，生命上限提升至 ${state.hero.maxHp}（增幅 +${boost}）！`);
            }
          },
          {
            text: '稍后再来',
            className: 'secondary-btn',
            onClick: () => {}
          }
        ]
      });
    }
  },
  {
    id: 'evt_board_castle',
    type: 'event',
    subType: 'info',
    title: '🪧 战斗告示牌',
    sourceRef: 'board_castle',
    x: 940,
    y: 560,
    desc: '王国骑士团战术手册。公布经典回合制战损与伤害计算公式。',
    isAvailable: () => true,
    statusLabel: () => 'ℹ️ 战斗公式',
    cells: [
      {
        type: 'show_board',
        topic: '战斗机制详解'
      }
    ],
    execute: (_state, showDialog, log) => {
      showDialog({
        speaker: '王城战斗告示牌',
        speakerTitle: '王国骑士团战术手册',
        avatar: '🪧',
        text: `[color=#ffd700]【紫水晶骑士物语 · 经典回合制换血公式】[/color]\n\n1. [color=#ff5252]单回合真实伤害[/color]：\n   自身伤害 = 勇者攻击力 - 敌方防御力 (若 ≤0 则保底为 1 点)\n   受到伤害 = 敌方攻击力 - 勇者防御力 (若 ≤0 则保底为 0 点)\n\n2. [color=#00e676]回合数计算[/color]：\n   击杀所需回合 = ceil( 敌方生命值 / 自身单回合伤害 )\n\n3. [color=#ff9100]全战斗总损血[/color]：\n   总损血 = (击杀所需回合 - 1) × 受到伤害\n   (注：先手行动机制，若一击必杀则完全不受反击！)`,
        confirmText: '牢记在心',
        onConfirm: () => {
          log('🪧 研读了王城告示牌上的战斗结算公式。');
        }
      });
    }
  }
];

export const REGION_NODES: RegionNode[] = [
  {
    id: 'reg_mainland_beach',
    type: 'region',
    subType: 'region',
    icon: '🏖️',
    title: '🏖️ 郊外与海滩 (下个区域)',
    desc: '走出王城大门后解锁的全新宏大区域！包含：哥布林林地、阳光海滩、海滨码头以及精灵村落。',
    x: 1220,
    y: 170,
    isAvailable: (state) => state.regions.castle_exited,
    statusLabel: (state) =>
      state.regions.castle_exited ? '🟢 已解锁' : '🔒 待出城',
    execute: (state, showDialog) => {
      if (!state.regions.castle_exited) {
        showDialog({
          speaker: '远方地平线',
          speakerTitle: '未知区域',
          avatar: '🌫️',
          text: '前方是通往王城郊外与海滩的宽阔平原，但大门守卫森严，必须先满足出城许可。',
          confirmText: '返回'
        });
        return;
      }
      showDialog({
        speaker: '郊外与海滩群落',
        speakerTitle: '大世界探索',
        avatar: '🏖️',
        text: '[color=#00e676]恭喜你完成了【初始城堡】区域的全部探索！[/color]\n\n接下来的任务链条将展开更复杂的拓扑图：\n• 🌳 [color=#ff9100]哥布林密林[/color]（钥匙门禁与宝箱探索）\n• ⛵ [color=#40c4ff]海滩木筏[/color]（搜集木材渡海前往精灵村）\n• 🧝‍♀️ [color=#e040fb]精灵村神殿[/color]（高阶攻防训练与魔法技能学习）',
        confirmText: '继续前行'
      });
    }
  }
];

// 图谱连线：
// 架构原则（两大节点模型）：
// 1. Event 节点：玩家可主动触发/交互的节点。状态改变（如赐书、激活传送、招募入队）在 Event 内部发生，改变的是道具/世界数据，不是 Trigger！
// 2. Trigger 节点：顶层大图上的状态判断器，唯一职责是用来【改变 Event 的行为】（指向受它控制的 Event 节点）。
// 3. 顶层大图规则：绝不绘制 Event ➔ Trigger 连线！所有顶层大图连线均由【Trigger ➔ Event】（改变行为），以及突破性的【Gate ➔ Region】。
// 4. 道具专属图（Focal Graph）规则：只有在道具/实体专属图谱中，才完整展示【哪些 Event 改变了道具（入边）】以及【该道具影响了哪些 Event（出边）】！
export const EDGES: GraphEdge[] = [
  // 0.1 【Trigger 改变 Event 行为 1】持有冒险书 ➔ 国王对话 (改变国王行为：由初见赐书转为日常指引)
  {
    id: 'edge_trig_book_to_king',
    from: 'cond_has_book',
    to: 'evt_king',
    type: 'precondition',
    gateIndex: 1,
    label: '改变行为: 日常指引 ➔',
    showOnMainGraph: true,
    checkActive: (state) => state.items.book
  },

  // 0.2 【Trigger 改变 Event 行为 2】公主在队伍 ➔ 国王对话 (改变国王行为：开启劝说公主离队分支)
  {
    id: 'edge_trig_party_to_king',
    from: 'cond_princess_in_party',
    to: 'evt_king',
    type: 'precondition',
    gateIndex: 2,
    label: '改变行为: 劝离公主 ➔',
    showOnMainGraph: true,
    checkActive: (state) => state.party.princess
  },

  // 1. 【道具专属图入边】国王对话 ➔ 赐予冒险书 (改变的是道具，只在道具专属图显示入边，顶层大图不显示！)
  {
    id: 'edge_king_to_trig_book',
    from: 'evt_king',
    to: 'cond_has_book',
    type: 'effect',
    label: '赐予冒险书',
    showOnMainGraph: false, // 顶层大图不显示！仅在道具专属图作为入边展示
    checkActive: (state) => state.items.book
  },
  // 【Trigger 改变 Event 行为 3】持有冒险书 ➔ 离开城堡大门 (改变大门行为：双门禁之一)
  {
    id: 'edge_trig_book_to_exit',
    from: 'cond_has_book',
    to: 'evt_exit_castle',
    type: 'precondition',
    gateIndex: 1,
    label: '改变行为: 出城门禁1 ➔',
    showOnMainGraph: true,
    checkActive: (state) => state.items.book
  },

  // 2. 【传送点专属图入边】女神像 ➔ 激活传送 (改变的是传送数据，只在传送点专属图显示入边，顶层大图不显示！)
  {
    id: 'edge_statue_to_trig_tp',
    from: 'evt_statue_castle',
    to: 'cond_castle_tp',
    type: 'effect',
    label: '激活传送',
    showOnMainGraph: false, // 顶层大图不显示！仅在传送点专属图作为入边展示
    checkActive: (state) => state.teleports.castle
  },
  // 【Trigger 改变 Event 行为 4】传送点已激活 ➔ 离开城堡大门 (改变大门行为：双门禁之二)
  {
    id: 'edge_trig_tp_to_exit',
    from: 'cond_castle_tp',
    to: 'evt_exit_castle',
    type: 'precondition',
    gateIndex: 2,
    label: '改变行为: 出城门禁2 ➔',
    showOnMainGraph: true,
    checkActive: (state) => state.teleports.castle
  },

  // 3. 【大图核心任务线】出城大门通行 ➔ 解锁下个区域郊外海滩
  {
    id: 'edge_exit_to_region',
    from: 'evt_exit_castle',
    to: 'reg_mainland_beach',
    type: 'effect',
    label: '区域解锁 ➔ 郊外海滩',
    showOnMainGraph: true,
    checkActive: (state) => state.regions.castle_exited
  },

  // 4. 【同伴专属图入边】公主对话 ➔ 招募入队 (改变的是队伍数据，只在公主专属图显示入边，顶层大图不显示！)
  {
    id: 'edge_princess_to_trig_party',
    from: 'evt_princess_join',
    to: 'cond_princess_in_party',
    type: 'effect',
    label: '招募入队',
    showOnMainGraph: false, // 顶层大图不显示！仅在公主专属图作为入边展示
    checkActive: (state) => state.party.princess
  },
  // 【Trigger 改变 Event 行为 5】公主在队伍 ➔ 公主的床 (改变床的行为：原本观察 ➔ 可就寝回满HP)
  {
    id: 'edge_trig_party_to_bed',
    from: 'cond_princess_in_party',
    to: 'evt_princess_bed',
    type: 'soft_gate',
    label: '改变行为: 就寝回血 ➔',
    showOnMainGraph: true,
    checkActive: (state) => state.party.princess
  },

  // 5. 【Trigger 改变 Event 行为 6】公主在队伍 ➔ 大钟柜 (改变大钟行为：原本观察 ➔ 可领私房钱)
  {
    id: 'edge_trig_party_to_clock',
    from: 'cond_princess_in_party',
    to: 'evt_clock_cabinet',
    type: 'soft_gate',
    label: '改变行为: 领私房钱 ➔',
    showOnMainGraph: true,
    checkActive: (state) => state.party.princess
  },

  {
    id: 'edge_king_to_princess',
    from: 'evt_king',
    to: 'evt_princess_join',
    type: 'effect',
    label: '离队恢复招募',
    showOnMainGraph: false, // 状态变更发生在国王节点内部，大图不显示此边
    checkActive: (state) => !state.party.princess && state.items.book
  },

  // -------------------------------------------------------------
  // 以下为实体专属分析图谱保留的连线 (点击左侧道具/成就时在独立图谱中展示)
  // -------------------------------------------------------------
  {
    id: 'edge_king_to_map',
    from: 'evt_king',
    to: 'cond_has_map',
    type: 'effect',
    label: '+ 赐予世界地图',
    showOnMainGraph: false,
    checkActive: (state) => state.items.map
  },
  {
    id: 'edge_maid_to_gem',
    from: 'evt_maid_green',
    to: 'cond_has_hp_gem',
    type: 'effect',
    label: '内置分支: 赠予生命宝珠',
    showOnMainGraph: false,
    checkActive: (state) => state.items.hp_gem
  },
  {
    id: 'edge_join_to_ach_nightmare',
    from: 'evt_princess_join',
    to: 'cond_ach_nightmare',
    type: 'effect',
    label: '熔断: 邀请公主即失败',
    showOnMainGraph: false,
    checkActive: (state) => state.achievements.no_use_princess === 'failed'
  },
  {
    id: 'edge_bed_to_ach_hard',
    from: 'evt_princess_bed',
    to: 'cond_ach_hard',
    type: 'effect',
    label: '熔断: 休息即失败',
    showOnMainGraph: false,
    checkActive: (state) => state.achievements.no_use_bed === 'failed'
  },
  {
    id: 'edge_clock_to_ach_normal',
    from: 'evt_clock_cabinet',
    to: 'cond_ach_normal',
    type: 'effect',
    label: '熔断: 拿私房钱即失败',
    showOnMainGraph: false,
    checkActive: (state) => state.achievements.no_use_money === 'failed'
  },
  {
    id: 'edge_clock_to_ach_hard',
    from: 'evt_clock_cabinet',
    to: 'cond_ach_hard',
    type: 'effect',
    label: '熔断: 困难失败',
    showOnMainGraph: false,
    checkActive: (state) => state.achievements.no_use_bed === 'failed'
  }
];
