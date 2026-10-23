/**
 * ZH dictionary for the preset manager settings page.
 *
 * Authored as a tree for readability;  flattens it into the
 * flat key map DSH's locale service actually reads. `locale/zh.json`
 * mirrors this content for plugin-manager display metadata.
 */
export const zh: Record<string, unknown> = {
  "meta": {
    "title": "Agent 预设管理器",
    "description": "在运行时注册与管理 Agent 预设，完全不修改 DSH 配置文件"
  },
  "nav": "预设管理",
  "page": {
    "title": "Agent 预设管理器",
    "subtitle": "预设通过运行时接口注册，DSH 配置文件保持原样。"
  },
  "common": {
    "loading": "正在读取预设…",
    "working": "正在处理…",
    "cancel": "取消",
    "close": "关闭",
    "save": "保存",
    "refresh": "刷新",
    "back": "返回列表",
    "retry": "重试",
    "dismiss": "关闭提示",
    "confirm": "确认",
    "copy": "复制",
    "copied": "已复制",
    "none": "无",
    "unnamed": "未命名预设"
  },
  "phase": {
    "starting": "正在启动",
    "ready": "就绪",
    "degraded": "部分预设未加载",
    "stopping": "正在停止",
    "stopped": "已停止"
  },
  "state": {
    "registered": "已注册",
    "notRegistered": "未注册",
    "registering": "注册中",
    "failed": "注册失败",
    "healthy": "运行正常",
    "broken": "激活异常",
    "unchecked": "未检查",
    "default": "DSH 默认"
  },
  "ownership": {
    "managed": "本插件",
    "builtin": "内置",
    "thirdParty": "第三方"
  },
  "list": {
    "heading": "预设列表",
    "summary": "共 {total} 个预设，其中 {managed} 个由本插件管理",
    "emptyTitle": "还没有自定义预设",
    "emptyBody": "复制一个现有预设作为起点，或导入别人分享的配置。内置预设不会被修改。",
    "emptyActionClone": "复制一个预设",
    "emptyActionImport": "导入预设",
    "columnPreset": "预设",
    "columnState": "状态",
    "columnPlugins": "插件数",
    "columnActions": "操作",
    "loadFailedTitle": "无法读取预设列表",
    "loadFailedBody": "Host 接口没有响应。请确认插件已启用，然后重试。"
  },
  "detail": {
    "backToList": "返回列表",
    "compositionHeading": "插件组合",
    "compositionHint": "该预设声明的完整插件行，只读展示。",
    "revisionLabel": "版本",
    "rowCount": "{count} 行",
    "readOnlyNote": "内置与第三方预设只能查看和复制。",
    "dataLocation": "数据目录",
    "defaultWarning": "这个预设是 DSH 当前默认预设。删除前请先在 DSH 设置中改回内置预设，否则新会话会引用一个不存在的预设。"
  },
  "action": {
    "view": "查看",
    "clone": "复制",
    "edit": "编辑",
    "editPersona": "编辑 Persona",
    "editYaml": "编辑 YAML",
    "history": "历史",
    "export": "导出",
    "delete": "删除",
    "restore": "恢复此版本",
    "import": "导入",
    "confirmImport": "确认导入",
    "previewImport": "预览导入",
    "purge": "清除数据"
  },
  "editor": {
    "heading": "编辑预设",
    "tabPersona": "Persona",
    "tabYaml": "高级 YAML",
    "sharedDraft": "两种编辑方式共用同一份草稿，切换不会丢失修改。",
    "name": "名称",
    "description": "描述",
    "prefix": "Prefix（前置指令）",
    "suffix": "Suffix（后置指令）",
    "complete": "替换内置提示词",
    "completeHint": "默认关闭：Persona 会追加在内置提示词之上，而不是替换它。",
    "noPersonaRow": "该预设没有 persona 插件行。填写任一字段会新增一行。",
    "yamlHeading": "插件组合",
    "yamlHint": "保留 DSH 的 YAML 方言、!!js 表达式与未知字段。",
    "yamlErrorTitle": "YAML 无法解析",
    "validateAndDiff": "校验并对比",
    "saveAndRegister": "保存并注册",
    "diffHeading": "将要保存的变更",
    "diffMetadata": "元数据",
    "diffAdded": "新增",
    "diffRemoved": "移除",
    "diffChanged": "修改",
    "diffUnchanged": "{count} 项未变更",
    "noChanges": "没有检测到变更。",
    "validateFailedTitle": "配置校验未通过，尚未保存",
    "saveSucceeded": "已保存并注册「{name}」"
  },
  "clone": {
    "heading": "复制预设",
    "source": "源预设",
    "newId": "新预设 ID",
    "newIdHint": "小写字母、数字、点、下划线、连字符；以字母或数字开头。",
    "newIdInvalid": "ID 格式不正确",
    "newIdTaken": "该 ID 已被占用",
    "name": "显示名称",
    "nameHint": "留空则使用「源名称 副本」。",
    "submit": "创建副本",
    "succeeded": "已复制为「{name}」"
  },
  "history": {
    "heading": "历史版本",
    "hint": "恢复会把该版本重新注册为当前版本，当前版本先归档，因此恢复本身也可撤销。",
    "emptyTitle": "还没有历史版本",
    "emptyBody": "保存过一次修改后，旧版本会出现在这里。",
    "columnSavedAt": "保存时间",
    "columnPreset": "版本",
    "columnPlugins": "插件数",
    "columnOrigin": "来源",
    "reasonCreate": "新建",
    "reasonSave": "保存",
    "reasonImport": "导入",
    "reasonRestore": "恢复",
    "restored": "已恢复该版本"
  },
  "share": {
    "heading": "导出与分享",
    "risksTitle": "分享前请确认",
    "risksHint": "以下内容可能包含密钥或本机路径。插件只提示，不会改写你的预设。",
    "noRisks": "未检测到明显的密钥或本机路径。",
    "copyShare": "复制分享文本",
    "download": "下载 YAML",
    "manualHeading": "分享文本",
    "manualHint": "复制失败时可在此手动选择。",
    "copySucceeded": "已复制到剪贴板",
    "copyFailedTitle": "复制失败",
    "copyFailedBody": "浏览器拒绝了剪贴板访问。请手动选择下方文本复制。",
    "downloadStarted": "已开始下载"
  },
  "import": {
    "heading": "导入预设",
    "pasteLabel": "粘贴分享文本或 YAML",
    "readClipboard": "读取剪贴板",
    "pickFile": "选择文件",
    "clipboardFailed": "无法读取剪贴板，请手动粘贴。",
    "nothingApplied": "预览不会写入文件，也不会注册任何预设。",
    "previewHeading": "导入预览",
    "idConflictTitle": "ID 已被占用",
    "idConflictBody": "该 ID 已存在。请改用下面的建议 ID 或其他未被占用的 ID。",
    "newIdLabel": "改用这个 ID",
    "risksTitle": "风险与兼容性",
    "warningsTitle": "提醒",
    "errorsTitle": "无法导入",
    "compositionHeading": "将导入的插件组合",
    "acknowledge": "我已阅读上述内容，确认导入",
    "blockedHint": "存在阻止导入的问题，解决后才能继续。",
    "succeeded": "预设已导入并注册",
    "emptyText": "请先粘贴内容"
  },
  "remove": {
    "heading": "删除预设",
    "body": "删除「{name}」？最后一份配置会保留在历史版本中，可随时恢复。",
    "confirm": "确认删除",
    "defaultRiskTitle": "这是 DSH 的默认预设",
    "defaultRiskBody": "本插件不会修改 DSH 自身的默认预设设置。删除后新会话可能引用一个不存在的预设，你需要在 DSH 设置中改回内置预设。",
    "defaultRiskConfirm": "我了解，仍然删除",
    "succeeded": "预设已删除，可在历史版本中恢复"
  },
  "data": {
    "heading": "插件数据",
    "locationLabel": "数据目录",
    "managedCount": "{count} 个预设由本插件管理",
    "keepNote": "停用或卸载插件都不会删除这些文件。需要时用下面的操作显式清除。",
    "purgeHeading": "清除全部插件数据",
    "purgeWarning": "会删除本插件目录下的全部预设、历史与元数据。操作不可撤销，但会先写入一份备份。",
    "purgeInstruction": "输入 {phrase} 以确认",
    "purgeSucceeded": "插件数据已清除",
    "purgeButton": "清除全部数据"
  },
  "defaultNote": {
    "heading": "关于默认预设",
    "body": "本插件不会修改 DSH 持久化的默认预设。你可以用 DSH 原生的预设选择器选择本插件注册的预设；若把它设为默认，删除前请先改回内置预设。"
  },
  "diagnostics": {
    "heading": "诊断",
    "copy": "复制诊断",
    "quarantined": "有预设文件无法解析，已隔离保留"
  },
  "error": {
    "notReadyTitle": "Host 接口尚未就绪",
    "notReadyBody": "插件正在挂载运行时接口。若长时间停留在此状态，请重新加载页面。",
    "genericTitle": "操作失败",
    "revisionConflict": "预设已被其他页面修改。请重新载入后再保存。",
    "notFound": "找不到该预设，可能已被删除。"
  }
}
