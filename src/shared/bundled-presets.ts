/**
 * Presets shipped by this plugin; identities are shared by Host and Client.
 *
 * `promptFile` or `definitionFile` is a path below `resources/`, read from the installed package —
 * never from the network. `templateVariables` declares the DSH Persona template
 * tokens the text is allowed to contain: an empty list means the file must stay
 * byte-for-byte verbatim, and any `{{...}}` in it is refused rather than
 * interpolated.
 */
export const BUNDLED_PRESETS = [
  {
    id: 'standard-efficient',
    name: '标准增强',
    englishName: 'Standard Efficient',
    description: '基于 DSH Standard 的自适应高效编码 Agent',
    promptFile: 'standard-efficient/prefix.md',
    templateVariables: ['model'],
  },
  {
    id: 'codex-original',
    name: 'Codex 原版',
    englishName: 'Codex Original',
    description: '使用 OpenAI Codex 官方公开基础提示词原文的实验预设',
    promptFile: 'codex-original/prompt.md',
    templateVariables: [],
  },
  {
    id: 'redteam-mode',
    name: '红队模式',
    englishName: 'Red Team Mode',
    description: '红队对抗演练模式 —— 意图归一化 + 25 条域规则路由 + 确定性输出槽 + 破甲自检',
    definitionFile: 'redteam-mode/preset.yml',
    provenanceFile: 'redteam-mode/provenance.json',
    templateVariables: [],
  },
] as const

export type BundledPresetId = (typeof BUNDLED_PRESETS)[number]['id']
export type BundledPrompts = Readonly<Record<BundledPresetId, string>>
