# @rvaim/dsh-preset-manager

在 DeepSeek Harness **运行时**注册与管理 Agent 预设的插件。它**不修改任何 DSH 配置文件**：预设通过 `ctx.agentPresets.register()` 动态注册，数据只保存在插件自己的目录里。

[![npm](https://img.shields.io/npm/v/@rvaim/dsh-preset-manager.svg)](https://www.npmjs.com/package/@rvaim/dsh-preset-manager)
[![license](https://img.shields.io/npm/l/@rvaim/dsh-preset-manager.svg)](./LICENSE)

- 包名：`@rvaim/dsh-preset-manager`
- 版本：`0.5.1`
- 中文名：Agent 预设管理器
- 设置页：DSH Web「设置 → 预设管理」
- 数据目录：`$DSH_HOME/dsh-preset-manager/`
- 许可证：MIT

---

## 插件自带预设

启用插件后提供三个只读预设，可在预设管理器中查看、复制配置或派生为可编辑的自定义预设。

| ID | 中文名称 | English name | 描述 |
|---|---|---|---|
| `standard-efficient` | 标准增强 | Standard Efficient | 基于 DSH Standard 的自适应高效编码 Agent |
| `codex-original` | Codex 原版 | Codex Original | 使用 OpenAI Codex 官方公开基础提示词原文的实验预设 |
| `redteam-mode` | 红队模式 | Red Team Mode | 红队对抗演练模式 —— 意图归一化 + 25 条域规则路由 + 确定性输出槽 + 破甲自检 |

标准增强和 Codex 原版在插件每次启用时，通过宿主公开的 `agentPresets.readDocument('standard')` 读取当前 Standard 的完整实际插件组合，并保留注册表中的排序元数据。除上述身份信息及 Persona 的 `prefix` 外，插件树、工具、嵌套分组、条件表达式、隔离配置、Persona 的 suffix/complete/includeRuntimeContext 和未知字段均保持原样。启用后不会持续改写已注册定义；重新启用时才重新读取 Standard。已有同名用户预设或第三方预设会保留，并报告冲突。

自带预设不写入用户的 `presets/` 或修订历史；清除用户数据不会删除它们，停用插件会撤销本插件持有的全部自带预设注册。Standard 缺失、异常或其 Persona 结构无法安全识别时，会显示诊断，不回退到一份猜测的精简配置。管理器按当前语言显示中英文名称；宿主注册表使用上述中文名称。

- 红队模式使用本地 [完整预设 YAML](resources/redteam-mode/preset.yml)，保留 `order: 10`、22 个根条目及三个嵌套分组中的完整插件配置；直接读取本地定义，不从 Standard 合并或改写。
- 红队模式的 Persona 是**纯加法**：用户原文 [user-original.md](resources/redteam-mode/user-original.md) 逐字节保留，只在其第一个章节前插入 [adaptive-execution.md](resources/redteam-mode/adaptive-execution.md)（轻量 / 标准 / 深度 / 关键四档 + 五步判断链 + 收尾门槛）。加载时会核对：把插入段删掉必须逐字节还原用户原文，任何一处改动都会被拒绝注册。[完整性记录](resources/redteam-mode/provenance.json) 保存三份资源的字节数与 SHA-256。
- 标准增强使用 [完整静态提示词](resources/standard-efficient/prefix.md)，仅保留用户指定的 `{{model}}` 模板变量。
- Codex 原版使用 [OpenAI 官方文件](https://github.com/openai/codex/blob/970111f6cb62cc02fe36a82ea7d71b37a2889c97/codex-rs/models-manager/prompt.md)的完整原文，固定 Git commit 为 `970111f6cb62cc02fe36a82ea7d71b37a2889c97`，SHA-256 为 `ac8ae107a0d72fe3476b430afb161ea4e67da2e446d778aefc44828160559807`。原始文件共 20,903 字节，未经总结、改写、翻译、工具名替换或添加前后文。
- 原文及 [来源记录](resources/codex-original/provenance.json)、[Apache-2.0 许可证](resources/codex-original/LICENSE)、[上游 NOTICE](resources/codex-original/NOTICE)均随 npm 包提供。插件自身代码仍为 MIT；Codex 原文适用其上游许可。
- 运行时仅从本地包内读取资源并核对 Codex 文件的长度和 SHA-256，不连接 GitHub、不下载最新版。当前固定原文没有 `{{` 模板标记，不会被 DSH Persona 意外插值；以后更换上游原文时若出现该标记，将拒绝注册而不改写原文。

Codex 原版只替换 Persona Prefix，仍使用 DSH Standard 的工具、运行环境和其他系统提示段。它用于比较官方公开提示词的效果，不等同于复现完整 Codex CLI 的行为。

`npm run verify` 包含 `verify:bundled`：实际生成 npm tarball、解包，比较原文字节与 SHA-256，并从解包后的 Host 模块验证断网时的本地资源读取。

## 预设列表与启停

预设以一行一项的横向列表展示：名称与 ID、完整用途说明、操作和启停开关保持对齐。

- 插件自带预设，以及本插件创建、派生或导入的自定义预设，都可以启用或停用。
- 停用只撤销运行时注册，配置和历史仍保留，条目仍可查看、复制；自定义预设仍可编辑。
- 编辑或恢复已停用的预设不会自动启用它；新建、派生和导入的预设默认启用。
- 启停状态保存在插件自己的数据目录，重启 DSH 或重新启用插件后仍生效。
- 当前 DSH 默认预设需要先在原生设置中切换为其他默认项，之后才能停用。
- DSH 官方预设及第三方预设由各自的提供方管理，本列表不提供启停开关。

自动化可通过 `preset_manager_set_enabled` 使用相同的启停服务，参数为预设 `id` 和布尔值 `enabled`。

## 1. 它解决了什么问题

DSH 的 Agent 预设原本只能在 Cordis 组合（`cordis.patch.yml` 或 Bundle Patch）里声明。想调整 Persona、复制一份内置预设、试用一个别人分享的配置，都得改 DSH 的配置文件再重启。

本插件换了一条路径：DSH 的 `AgentPresetRegistry` 服务提供了一个公开的运行时注册接口，插件在启动时读取自己的预设文件，逐个注册进 Registry，并在停用时逐个注销。DSH 的配置文件从头到尾没有变化。

---

## 2. 已实现且验证通过

以下项目都在**本机真实的 DSH V0.2.1-rc.5 运行时**上验证过，不是推断。

| 能力 | 验证方式 | 结果 |
|---|---|---|
| 第三方 Host 插件访问 `AgentPresetRegistry` | 真实 DSH 进程内 `inject: ['agentPresets']` | ✅ |
| 程序化注册预设 | `register()` 返回 disposer，`list()` 由 5 项变 6 项 | ✅ |
| 读取真实激活健康状态 | `compositionInventory()` 显示 `fiberState: 2`(ACTIVE)、无 `broken` | ✅ |
| 停用时注销 | 停用后再启用，`list-before` 中已无该预设 | ✅ |
| 不修改 DSH 配置文件 | `cordis.patch.yml` 哈希前后一致（`6d5d0e8e…`），语义解析无任何预设内容 | ✅ |
| 设置页出现在官方设置中 | Slot 检查器显示 `settings.section` 占用项 `dsh-preset-manager`，`order: 25`，`active: true` | ✅ |
| 复制内置预设 | 通过真实服务复制，组合逐字节一致 | ✅ |
| 保存并注册 | 编辑 Persona 后保存，Registry 中定义已更新 | ✅ |
| 修订号冲突检测 | 用过期 revision 保存被拒绝 | ✅ |
| 导出 → 导入 | 分享文本往返，语义一致 | ✅ |
| 删除并注销 | 删除后 Registry 中消失 | ✅ |
| 停用注销全部自身注册 | teardown 后托管预设消失，内置预设保留 | ✅ |
| 重启自动恢复 | 第二个进程从同一目录恢复，且**只注册一次** | ✅ |
| 停用不删数据 | 停用后 `presets/`、`history/`、`metadata.json` 全部保留 | ✅ |

自动化测试：**210 个单元/集成测试全部通过**，覆盖动态注册生命周期、持久化、领域规则、导入导出、非侵入性、注册管理器与插件自带预设；另有 **17 项真实 Gateway/插件注入检查**和 **57 项完整 Client/Host 入口检查**。

---

## 3. 已实现但未验证（需浏览器交互）

这些功能代码完整、类型检查与构建通过，但无法在无人值守环境下点击验证：

- 页面内的按钮交互（点击复制、下载、文件选择、剪贴板读取）
- 暗色模式下的实际渲染效果
- 剪贴板权限被拒时的降级提示外观

**未经人工点击确认的部分，我不宣称已通过视觉验收。**

### 0.2.2 编辑器与弹窗精修

YAML 区统一使用 CodeMirror，提供语法高亮、行号、折叠和缩进引导线；
左侧插件树使用对齐的图标/名称/包名列，并显示父子分支线。
编辑窗口缩为有尺寸上限的居中弹窗，前置/后置提示词改为 Tab 切换。
派生移到查看弹窗；删除、放弃未保存修改和保存确认使用独立确认弹窗，
编辑器底栏的删除、取消、保存始终保持位置和含义不变。

### 0.2.0 按 DSH 实际结构编辑

预设由 `id/name/description/order` 元数据和 `plugins` 组合树构成，不等于单一前缀。

- **派生**：创建独立副本，留在网格；**复制**：写入剪贴板。
- 进行中、成功和重试只显示在点击的按钮上，不再产生顶部成功横幅。
- 编辑元数据，前置/后置模板，以及任意嵌套分组内的 Persona 条目。
- 插件与工具页支持增加、删除、分组、同级排序和字面启停；完整条目 YAML 保留配置、条件、隔离、依赖与未知字段。
- 完整 YAML 现在涵盖整个预设，和表单共用草稿。非法输入保留原文，保存与切换不会静默丢弃。
- 保存会持久化并注册完整定义，已有会话保留原组合，新会话采用新定义。

设计依据及语义边界见 [DSH 预设编辑模型](docs/preset-editor-model.md)。

### 0.1.8 直接操作与提示词编辑

「复制」只创建副本并刷新网格，不自动打开编辑器；需要修改时由用户点击「编辑」。
「导出」直接将配置复制到剪贴板，不打开窗口；剪贴板拒绝访问时明确报告失败。
编辑弹窗使用接近整个视口的宽高，压缩名称和描述区域，将主要空间用于提示词。
移除「替换内置提示词」开关；直接编辑原文并保存，同时保留源配置原有的组合模式。
提示词和配置 YAML 来回切换保持同一草稿，无法解析的 YAML 保留原文。

### 0.1.7 独立弹窗

双列网格作为主界面始终保留，只在极窄内容区折成单列。
卡片「查看」直接打开只读弹窗；自定义卡片「编辑」直接打开编辑弹窗，无须先查看。
「复制并编辑」直接进入新副本的编辑弹窗。保存、取消和关闭都回到原网格位置。
弹窗有固定标题/操作栏与独立滚动，支持 Escape、焦点归还和未保存修改保护。

### 0.1.6 界面与交互

列表采用与 DSH 原生 Agent 预设页相近的分组卡片：宽内容区两列、窄内容区一列，
按内置、自定义和第三方区分。用途说明完整展示；内置预设缺少注册元数据时，
使用与宿主相同的中英文短说明，自定义内容始终优先。

点击卡片的「复制并编辑」直接复制该项，自动生成名称和不冲突的 ID，随后进入新副本编辑。
不再弹出来源选择和 ID 表单，也不会默认复制列表第一项。复制保留完整插件组合和用途说明。
主按钮的背景与文字都使用随宿主主题变化的成对令牌，移除了固定白字与亮度滤镜。

### 0.1.5 修复说明

`remote` 与 `remote.presetManager` 是两个独立的 Cordis Service。
0.1.4 虽已完成命名空间挂载，却从只声明 `remote` 的插件上下文读取另一个服务，
因此出现 `cannot get property "remote.presetManager" without inject`。
现在由外层负责挂载，再由显式声明该命名空间的子 fiber 消费服务；服务撤销会清除页面 API，
晚到的列表响应不会恢复旧绑定，网关的对象型错误详情也能正确显示。

`npm run verify:client` 加载实际打包的 Client 与 Host 入口，使用真实 Cordis 注入与 Gateway，
在隔离数据目录中检查列表就绪、复制、打开编辑器、删除、断连恢复、停用再启用及取消。
原来的 root Context 通信验证保留，但不再作为插件入口可用的唯一证据。
当前浏览器还可通过可选的 `@rvaim/dsh-preset-manager` Client Inspect provider 查询
版本、挂载状态、列表状态、预设数量和实际挂载页面数量；该查询只读。

### 0.1.4 修复说明

0.1.3 的远程方法 `presetManager/remove` 与当前 DSH 的
`RemoteNamespaceService.remove()` 重名。宿主在挂载前拒绝整组 descriptor，
因此即使 Host 插件已启用，页面仍无法读取列表，并显示
`method "presetManager/remove" conflicts with its namespace service`。

删除端点现为 `deletePreset`，通过协议的 `implementation: 'remove'` 映射到
原有 Host 删除逻辑；页面的业务 API 保持不变。

`npm run verify:binding` 现在默认验证本次构建的 `dist`，使用与目标 DSH
一致的真实 Cordis、Gateway 和 Typert Registry，验证旧端点确实被拒绝、
完整接口挂载、列表读取、删除 RPC、参数传递、YAML 返回值、非法输入和卸载后重挂载。
也可以传入明确的产物目录，例如 `node scripts/verify-binding.mjs /path/to/package/dist`。
这些自动化检查不等同于真实页面的视觉验收。升级已安装包后，若安装器提示需要重启，
请完整退出并重开 DSH 后再进入「设置 → 预设管理」。

### 0.1.3 修复说明

上一版在真实页面上有两个缺陷，均已修复：

1. **所有 Remote 调用失败，页面显示「Host 接口尚未就绪」。**
   根因是 gateway 的绑定校验要求 `typertRemote.service === 被提供的对象本身`。
   原实现把 face 展开成第二个对象，`service` 却指向第一个，身份校验失败，
   每次调用都得到 `gateway/binding-invalid`。现在绑定直接挂在被提供的对象上，
   并有回归测试锁定这一约束（`scripts/verify-binding.mjs`、`src/tests/unit/remote-binding.test.ts`）。

2. **按钮显示 `action.import` 这类键名而不是文案。**
   根因是 DSH 的 locale 服务用扁平的 `dict[key]` 查表，不会遍历嵌套对象。
   原字典是嵌套树，只有顶层键能解析，带点的键全部回退成键名本身。
   现在注册前会扁平化，并有测试断言中英文键集合一致、占位符齐全
   （`src/tests/unit/locale.test.ts`）。

---

## 4. 当前 DSH 不支持的部分（如实说明）

1. **无法自动消除 DSH 已持久化的默认预设引用。**
   DSH 把「默认预设」存在自己的 settings 里（`agent-preset-registry.config.selectedDefault`）。本插件不写它。若用户把自定义预设设为默认后又删除它，DSH 仍指向那个 ID。在「绝对禁止修改 DSH 设置」的前提下，这无法自动修复——插件会在删除前明确警告，并提示用户在 DSH 设置里改回内置预设。

2. **卸载时不自动清理数据。**
   DSH 的卸载流程没有提供能可靠区分「卸载」与「热重载 / 临时停用」的扩展点。因此卸载后 `$DSH_HOME/dsh-preset-manager/` 会保留（不再被读取，但占用磁盘）。这是刻意的选择：宁可留下无效目录，也不冒一次 HMR 就删光用户预设的风险。清理方式见 §8。

3. **历史会话的预设引用受 DSH 原生规则限制。**
   会话日志里记录的是预设 ID。插件停用后该 ID 不再存在，恢复能力取决于 DSH 自身的处理，本插件不修改会话日志。

4. **官方预设选择器没有注册表变更事件。**
   DSH 没有公开「预设列表已变化」的通知接口。选择器在组件挂载时重新读取（`useEffect → load()`），因此新预设会在**下次打开新建会话或重新挂载选择器时**出现，而不是即时推送。本插件不使用 DOM 注入或猴子补丁去强制刷新。

---

## 5. 架构

轻量 Clean Architecture + Ports & Adapters。

```text
                DSH Web Settings
                       │
                 Client UI (React)
                       │
              Client State (store)
                       │
              Remote API (typert)
                       │
            Application Service
              ╱       │        ╲
        Use Cases   Ports    Sharing
                       │
              Infrastructure
              ╱            ╲
   FilePresetRepository   DynamicPresetRegistryAdapter
          │                        │
   Plugin-owned files      AgentPresetRegistry
```

### 目录

```text
dsh-preset-manager/
├── package.json              # Bundle 清单 + dsh.client 声明
├── cordis.patch.yml          # 只加载本插件一行，不含任何预设
├── icon.svg                  # 显示图标
├── locale/{zh,en}.json       # 显示元数据 + 页面文案
├── tsconfig*.json
├── src/
│   ├── shared/               # 跨 Host/Client 的线类型与错误码
│   │   ├── types.ts
│   │   ├── contracts.ts
│   │   └── errors.ts
│   ├── domain/               # 纯逻辑，无 IO
│   │   ├── preset-model.ts        # YAML 方言、canonical、展平
│   │   ├── preset-revision.ts     # 内容哈希（Host-only，用 node:crypto）
│   │   ├── preset-validator.ts    # 结构与 ID 校验
│   │   ├── clone-preset.ts        # 完整复制
│   │   ├── persona-editor.ts      # Persona 投影读写
│   │   └── preset-diff.ts         # 语义差异
│   ├── sharing/              # 版本化分享格式
│   │   ├── share-format.ts
│   │   ├── preset-exporter.ts
│   │   ├── preset-importer.ts
│   │   ├── compatibility-checker.ts
│   │   └── sensitive-data-checker.ts
│   ├── host/
│   │   ├── index.ts               # 组合根：注入、路径、注册、生命周期
│   │   ├── application/
│   │   │   ├── preset-manager-service.ts
│   │   │   ├── deps.ts
│   │   │   └── use-cases/*.ts
│   │   ├── ports/                 # 三个端口接口
│   │   ├── adapters/
│   │   │   ├── file-preset-repository.ts
│   │   │   ├── dynamic-preset-registry.ts
│   │   │   ├── dsh-preset-source.ts
│   │   │   └── cordis-context.ts
│   │   ├── lifecycle/
│   │   │   ├── registration-manager.ts
│   │   │   └── startup-restore.ts
│   │   └── remote/
│   │       ├── descriptors.ts     # Host 与 Client 共用的端点声明
│   │       └── preset-manager-remote.ts
│   ├── client/
│   │   ├── index.ts               # 注册设置页与 Remote 命名空间
│   │   ├── api/remote-api.ts
│   │   ├── state/store.ts
│   │   ├── pages/PresetManagerPage.tsx
│   │   ├── components/primitives.ts
│   │   ├── features/…             # list / clone / persona-editor /
│   │   │                          #   history / export / import
│   │   └── locales/
│   └── tests/unit/                # 20 个测试文件 + 假 Registry
└── scripts/
    ├── build.mjs                  # Host: tsc  → ESM
    ├── run-tests.mjs              # 编译并运行测试
    ├── e2e-verify.mjs             # 完整生命周期端到端
    ├── e2e-restart.mjs            # 重启恢复
    ├── e2e-installed.mjs          # 针对已安装产物验证
    └── asar-extract.mjs           # 读取 app.asar 内源码的辅助工具
```

**模块职责不混淆：** `domain/` 与 `sharing/` 无 IO；`host/ports/` 只有接口；`host/adapters/` 才碰文件与 Registry；`application/` 只做编排；`client/` 不直接调用文件系统或 Registry。

---

## 6. 数据目录与文件格式

全部位于 `$DSH_HOME/dsh-preset-manager/`（通过 DSH 官方 `dshHomePath()` 解析，不硬编码用户目录）。

```text
$DSH_HOME/dsh-preset-manager/
├── presets/
│   └── <id>.yml              # 当前有效定义，唯一权威来源
├── history/
│   └── <id>/
│       └── <sha256>.yml      # 被替换/删除的历史版本
├── backups/
│   ├── quarantine/           # 解析失败的文件（原样保留，供手工修复）
│   └── purge-<时间>.json     # 「清除全部数据」前的快照
└── metadata.json             # 仅索引：revision / savedAt / reason
```

**约定：**

- `presets/` 是**唯一权威**。历史版本永远不会自动覆盖当前配置。
- `metadata.json` 只存索引，**不存第二份预设定义**（测试断言了这一点）。
- 文件为 DSH 的 Cordis 方言 YAML，`!!js` 表达式以 `{ __jsExpr: "…" }` 形式保留，**解析期永不求值**。
- 写入是原子的：先写同目录临时文件 → 重新解析校验 → `fsync` → `rename` 覆盖。中断不会留下半个预设。
- 损坏文件被移入 `backups/quarantine/` 而不是删除，其余预设不受影响。

### 一个预设文件的例子

```yaml
id: my-preset
name: 我的预设
plugins:
  - id: persona
    name: '@deepseek-ai/dsh-persona'
    config:
      prefix: |
        You are a coding agent.
      complete: false
```

---

## 7. 动态注册与注销的实现

### 关键事实（读自安装版源码）

`@deepseek-ai/dsh-agent-preset-registry` 的实现有三条性质，决定了整个设计：

1. **`register()` 遇到重复 ID 直接抛错**（`Duplicate agent preset: <id>`）。所以「替换」只能是「先注销，再注册」，没有 upsert。
2. **`register()` 即使激活失败也会 resolve**，失败信息只出现在 roster 行的 `broken` 字段上。因此**不能把「没抛异常」当成成功**——每次注册后都回读 `list()` 判断健康。
3. **返回的 disposer 是幂等的异步函数**，由声明方持有，是撤销注册的唯一方式。

### 注册流程

```text
读 presets/ → 结构校验 → 冲突检查 → register() → 回读 list() 判定健康
                                              ├─ healthy  → 写入当前版本（已是新内容）
                                              └─ broken   → 补偿回滚，不落盘
```

**先注册、后落盘**是刻意的：如果先写文件，一个注册失败的编辑会在下次启动时被重新捡起，用户只能通过会话起不来才发现。反过来，注册失败时磁盘上的上一版本原封不动地继续生效。

### 替换（补偿式，不是原子操作）

```text
保留旧定义 → 注销旧注册 → 注册新版本
                              ├─ 成功且健康 → 完成
                              └─ 抛错或 broken → 重新注册旧定义，并如实报告
```

代码和文档都不宣称这是原子的：两次调用之间预设短暂不存在，这个窗口内新建的会话看不到它。这是 `AgentPresetRegistry` 没有 replace 操作的直接后果，不是可以掩盖的实现细节。

### 停用 / 卸载

`ctx.effect()` 注册**一个**清理函数，Cordis 在行被停用、卸载或热替换时调用它：

```text
关闭入口闸（同步，先于任何 await）
   ↓
等待进行中的注册/更新收敛
   ↓
注销本插件持有的全部注册
   ↓
移除 Host 服务
```

闸门是同步关闭的，所以拆除期间的调用会立刻收到 `manager/stopping`，而不是开始一段会被丢弃的工作。**注册中发生停用**也被覆盖：一个在 `dispose()` 之后才落地的注册会立即被注销并报错，不会留下孤儿预设（有专门的竞态测试）。

---

## 8. 启停、卸载与数据清理

| 操作 | 预设注册 | 设置页 | 数据文件 |
|---|---|---|---|
| **停用插件** | 全部注销 | 消失 | **保留** |
| **重新启用** | 从 `presets/` 恢复 | 重新出现 | 原样 |
| **卸载插件** | 全部注销 | 消失 | **保留**（见下） |
| **清除全部数据** | 先注销再删 | 保留 | 删除，并先写一份备份 |

### 为什么卸载不自动删数据

DSH 的卸载路径没有向插件提供可靠区分「卸载」和「热重载 / 临时停用」的扩展点。如果在这个回调里删数据，一次 HMR 就可能删光用户全部预设。所以本插件选择保留目录，并在设置页提供明确的「清除全部插件数据」，需要输入 `DELETE ALL PRESET DATA` 才执行。

### 手动清理

```powershell
Remove-Item -Recurse -Force "$env:USERPROFILE\.dsh\dsh-preset-manager"
```

或设置页 → 预设管理 → 清除全部插件数据。

---

## 9. 导入与导出

### 导出

每个预设都提供：

1. **复制分享文本** — 走 Clipboard API，**只在复制真的成功后**才提示成功；失败时显示「复制失败」并把文本留在可选区域。
2. **下载 YAML** — Blob URL，用完即回收。
3. **预览分享内容** — 就是那个只读文本框，外加风险提示。

分享格式带版本化信封：

```yaml
kind: dsh-agent-preset-share
formatVersion: 1
preset:
  id: my-preset
  name: 我的预设
  plugins: [ … ]
```

信封**不含**本地路径、注册句柄、历史记录或运行时状态。

### 安全提示

导出前扫描明显的密钥形态（`sk-`、`AKIA`、`ghp_`、JWT、私钥块、内联 Bearer）与本机绝对路径（`C:\Users\…`、`/home/…`）。**只报告，不改写**——插件不会偷偷修改用户写的预设。

### 导入

```text
读取文本 → 识别格式版本 → 安全解析（不求值 !!js）→ 检查插件可用性
   → 检查敏感信息 → 预览完整配置 → 检查 ID 冲突
   → 用户勾选确认 → 保存到插件目录 → 运行时注册 → 验证
```

- **预览阶段不写文件、不注册任何东西**（有测试断言）。
- 未知的 `formatVersion` 在读 payload 之前就被拒绝。
- ID 冲突时给出确定性的建议 ID（`<id>-copy`、`-copy-2`…），而不是随机串。
- 缺失的插件包会**阻止导入**并指明是哪个包。插件绝不自动安装分享文件里的第三方包。

---

## 10. 安装

```powershell
# 方式一：从 npm 安装
plugin_manager install_bundle  target=@rvaim/dsh-preset-manager

# 方式二：从本地目录 / tarball 安装
plugin_manager install_bundle  target=C:\path\to\dsh-preset-manager
```

安装后重启 DSH 或让 HMR 生效，然后打开「设置 → 预设管理」。

### 配置项

| 字段 | 默认 | 说明 |
|---|---|---|
| `skipRestore` | `false` | 跳过启动恢复。文件不会被改动，只是本次启动不注册它们。用于排查「某个预设导致启动异常」。 |

如需在 profile 的 `cordis.patch.yml` 中设置：

```yaml
- id: preset-manager
  config:
    skipRestore: true
```

---

## 11. 开发

```powershell
npm install
npm run typecheck     # 全量类型检查（含 client）
npm run build         # Host → dist/host (ESM)，Client → dist/client.js
npm test              # 编译并运行 210 个测试
npm run verify        # 类型检查、测试、构建、Gateway、完整入口与打包资源校验

node scripts/e2e-verify.mjs                    # 完整生命周期
DSH_HOME=… node scripts/e2e-restart.mjs        # 重启恢复
node scripts/e2e-installed.mjs                 # 针对已安装产物
```

### 构建产物的形态

- **Host**：`tsc` 编译成 ESM，保留 `node:` 内建与裸模块说明符，由 DSH 的 Node 进程加载。
- **Client**：`esbuild` 打成单个 CommonJS 工厂，外面套 `window.__ModuleLoader__.load({ id, factory })`。React 从页面模块表取（`external`），避免出现第二份 React。

### 仓库

- 源码：<https://github.com/rvaim/dsh-preset-manager>
- 发布：`npm publish`（`prepublishOnly` 会自动执行 `verify`）
- `dist/` 不纳入 git，由发布流程构建

---

## 12. 设计取舍（为什么这样做）

- **`presets/` 是唯一权威，历史不自动覆盖当前。** 一个坏掉的当前文件应该被看见并报告，而不是被悄悄换成用户没选的旧版本。
- **注册先于落盘。** 见 §7。
- **健康检查靠回读 roster，不靠「没抛异常」。** 因为 `register()` 对激活失败也 resolve。
- **停用闸门同步关闭。** 异步闸门会允许拆除期间开始新的注册，从而留下孤儿。
- **不做 DOM 注入、不打猴子补丁、不改官方前端。** 缺少实时刷新接口时，如实说明并依赖组件挂载时的重新读取。
- **敏感信息只警告不脱敏。** 静默改写用户内容比泄露更难排查。
- **卸载不删数据。** 见 §8。

---

## 13. 版本兼容

- 开发与验证环境：**DSH V0.2.1-rc.5**（桌面端），Node 24.21.0。
- `engines.dsh` 精确 pin 到 `0.2.1-rc.5`；DSH 用 `semver.satisfies(运行时版本, engines.dsh)` 判定，精确 pin 与运行时不一致时**整个 Bundle 会被跳过**（插件行不出现，设置页也不出现）。升级 DSH 后若插件「凭空消失」，先核对这里的版本。
- 依赖的公开接口：`ctx.agentPresets.{register,list,readDocument}`、`ctx.typert.register`、`ctx.slots.{inject,register}`、`ctx.locale.{register,bind}`、`ctx.remote.$mount`、`dshHomePath`。
- 未使用：任何私有字段、`register` 的内部 `definitions` Map、DOM 查询、官方前端源码改写。
- 若 DSH 升级后 `AgentPresetRegistry` 的语义变化（例如允许重复 ID、或不再回读 `broken`），`DynamicPresetRegistryAdapter` 是唯一需要修改的地方。
