# 《紫水晶骑士物语》任务与条件依赖图谱编辑器 & 试玩引擎 (TypeScript 版)

参考自项目架构：`D:\godot_exe\64px-portrait-studio`
基于 **Vite + TypeScript (ES2022 / Strict Mode)** 构建的高性能 JRPG 任务依赖图谱工作台。

---

## 🌟 核心特性

1. **二分图模型架构 (Condition-Event Bipartite Graph)**：
   - **条件节点 (Condition Nodes)**：人物 (`party`)、物品 (`items`)、地图 (`teleports`)、难度成就 (`achievements`) 独立显式建模。
   - **事件节点 (Event Nodes)**：对话 (`dialog`)、场景交互 (`interaction`)、门禁 (`gate`)、常驻服务 (`service`)，基于原版 `magic_tower_with_skill.txt` 1:1 还原。
2. **双入边门禁 (AND Gate)**：
   - 离开王城必须同时满足 `拥有冒险书` 且 `王城女神像已开启`。未满足时公主自动触发动态拦截提示。
3. **公主同行/离队可逆循环 (Reversible Party Loop)**：
   - 邀请公主入队触发噩梦成就熔断，并激活床休息回血与大钟私房钱；
   - 与国王对话可劝说公主离队回到王城大厅，入队节点重新恢复可点。
4. **实时黑板面板 (State Sidebar)**：
   - 勇者属性 (HP/Atk/Def/Gold)、队伍、背包道具、传送点、难度成就与图谱条件节点双向强绑定同步。
5. **双模式交互**：
   - **Play 模式**：点击节点触发仿 RPG 对话弹窗（支持 Godot `[color=...]` 富文本解析与分支选择）。
   - **普通/Edit 模式**：点击节点展开右侧抽屉检视器，支持查看入边依赖、出边效果、ActionSequence Cells 步骤并实时编辑台词。

---

## 🚀 启动与构建

```bash
# 安装依赖
npm install

# 启动本地开发服务器 (默认端口 8088)
npm run dev

# TypeScript 类型检查
npm run typecheck

# 生产环境打包构建
npm run build

# 预览打包产物
npm run preview
```
