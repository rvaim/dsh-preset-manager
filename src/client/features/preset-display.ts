/** The display copy DSH's native Agent Presets surface supplies for shipped IDs. */
import type { PresetSummary } from '../../shared/types.js'
import type { Translate } from '../pages/PresetManagerPage.js'
import { BUNDLED_PRESETS } from '../../shared/bundled-presets.js'

const SHIPPED = new Set(['standard', 'ptc', 'minimal', 'cordis'])

export function presetDisplay(preset: PresetSummary, t: Translate): { name: string; description: string } {
  if (preset.ownership === 'builtin' && BUNDLED_PRESETS.some((entry) => entry.id === preset.id)) {
    return { name: t(`builtin.${preset.id}.name`), description: t(`builtin.${preset.id}.description`) }
  }
  const builtin = preset.ownership === 'builtin' && SHIPPED.has(preset.id)
  return {
    name: preset.name?.trim() || (builtin ? t(`builtin.${preset.id}.name`) : preset.id),
    description: preset.description?.trim() ||
      (builtin ? t(`builtin.${preset.id}.description`) : t('list.noDescription')),
  }
}
