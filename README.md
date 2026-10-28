# 《紫水晶骑士物语》任务与条件依赖图谱编辑器 & 试玩引擎 (TypeScript 版)

参考自项目架构：`D:\godot_exe\64px-portrait-studio`
基于 **Vite + TypeScript (ES2022 / Strict Mode)** 构建的高性能 JRPG 任务依赖图谱工作台。

---

## 🌟 核心特性

1. **二分图模型架构 (Condition-Event Bipartite Graph)**：
   - **条件节点 (Condition Nodes)**：人物 (`party`)、物品 (`items`)、地图 (`teleports`)、难度成就 (`achievements`) 独立显式建模。
   - **事件节点 (Event Nodes)**：包含完整 Action Tree 流程图子图（`Start`、`Action`、`Selector`、`Choice` 节点），支持循环对话、多路条件分支与默认选项高亮。
2. **双入边门禁 (AND Gate)**：
   - 离开王城必须同时满足 `拥有冒险书` 且 `王城女神像已开启`。未满足时公主自动触发动态拦截提示。
3. **公主同行/离队可逆循环 (Reversible Party Loop)**：
   - 邀请公主入队触发噩梦成就熔断，并激活床休息回血与大钟私房钱；
   - 与国王对话可劝说公主离队回到王城大厅，入队节点重新恢复可点。
4. **实时黑板面板 (State Sidebar)**：
   - 勇者属性 (HP/Atk/Def/Gold)、队伍、背包道具、传送点、难度成就与图谱条件节点双向强绑定同步；实时事件流转日志与状态重绘完全解耦。
5. **双模式交互**：
   - **Play 模式**：点击节点触发仿 RPG 对话弹窗（支持 Godot `[color=...]` 富文本解析与分支选择），触发状态变更时展示多米诺因果脉冲动效。
   - **Edit 模式**：支持拖拽生成节点、磁吸橡皮筋连线、框选多选、子图 DAG 自动布局、级联引用清理与完整 Undo/Redo 命令历史。

---

## 🏛 四层解耦架构（参考 `64px-portrait-studio`）

```text
panels/ ──调用方法──▶ app/ViewModel ──execute(Command)──▶ command/CommandHandler ──读写──▶ core/ (Document + Session)
  ▲                       │                                     │
  └─── dirty + rAF ───────┴──────── TaskStudioEvents ───────────┘
```

- **`src/core/`（纯领域层，零 DOM / 零浏览器依赖）**：
  - `types.ts`、`document.ts`、`session.ts`、`projectData.ts`、`editOps.ts`、`engine.ts`、`graph.ts`、`layout.ts`
- **`src/command/`（命令与撤销栈层，零 DOM 依赖）**：
  - `events.ts`（`TaskStudioEvents` 强类型事件接口）、`command.ts`（`SnapshotCommand` + `DocumentMemento`）、`commandHandler.ts`、`nodeCommands.ts`、`subGraphCommands.ts`、`varCommands.ts`
- **`src/app/`（应用协调层，端口-适配器解耦）**：
  - `viewModel.ts`、`graphEditViewModel.ts`、`playRuntimeViewModel.ts`、`editorContext.ts`、`ports.ts`、`services/AutosaveService.ts`、`adapters/HttpProjectAdapter.ts`、`adapters/BrowserStorage.ts`、`app.ts`
- **`src/panels/`（视图面板层，`Panel` 基类脏标记 + `requestAnimationFrame` 合并渲染）**：
  - `Panel.ts`、`Header.ts`、`StateSidebar.ts`、`Splitter.ts`、`canvas/*`、`inspector/*`、`modals/*`
- **`tests/`（架构边界与领域回归测试）**：
  - `adapterBoundary.test.ts`（AST 静态扫描守护零 DOM 边界 + Headless `ViewModel` 测试）
  - `coreAndCommand.test.ts`（级联引用清理、拖拽手势单步 Undo、DAG 布局、日志持久化与弹窗端口测试）

---

## 🚀 启动、测试与构建

```bash
# 安装依赖
npm install

# 启动本地开发服务器 (默认端口 8088)
npm run dev

# 运行单元测试与零 DOM 架构边界检查
npm test

# TypeScript 类型检查（源码 + 测试）
npm run typecheck
npm run typecheck:tests

# 生产环境打包构建
npm run build

# 预览打包产物
npm run preview
```
