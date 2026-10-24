/** Presets shipped by this plugin; identities are shared by Host and Client. */
export const BUNDLED_PRESETS = [
  {
    id: 'standard-efficient',
    name: '标准增强',
    englishName: 'Standard Efficient',
    description: '基于 DSH Standard 的自适应高效编码 Agent',
    promptFile: 'standard-efficient/prefix.md',
  },
  {
    id: 'codex-original',
    name: 'Codex 原版',
    englishName: 'Codex Original',
    description: '使用 OpenAI Codex 官方公开基础提示词原文的实验预设',
    promptFile: 'codex-original/prompt.md',
  },
] as const

export type BundledPresetId = (typeof BUNDLED_PRESETS)[number]['id']
export type BundledPrompts = Readonly<Record<BundledPresetId, string>>
