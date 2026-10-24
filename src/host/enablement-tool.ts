/** Agent access to the same enablement operation used by the list switch. */
import type { MutationResult } from '../shared/types.js'
import type { CordisContext } from './adapters/cordis-context.js'
import { ManagerError, ManagerErrorCode } from '../shared/errors.js'

interface ToolDefinition<Output> {
  name: string
  description: string
  deferLoading: true
  parameters: object
  output: { schema: object; render(args: unknown, value: Output): { type: 'text'; text: string }[] }
  execute(args: unknown): Promise<Output>
}
interface ToolsService { register(definition: ToolDefinition<{ id: string; enabled: boolean; applied: boolean }>): () => void }

export function registerEnablementTool(
  ctx: CordisContext,
  service: { setEnabled(request: { id: string; enabled: boolean }): Promise<MutationResult> },
): void {
  const tools = ctx.get('tools') as ToolsService | undefined
  if (!tools) return
  ctx.effect(() => tools.register({
    name: 'preset_manager_set_enabled', deferLoading: true,
    description: 'Enable or disable a preset provided or created by Preset Manager and return its saved state. Configuration is retained when disabled. Change the DSH default before disabling that preset.',
    parameters: {
      type: 'object', additionalProperties: false,
      properties: {
        id: { type: 'string', description: 'Preset ID shown in Preset Manager.' },
        enabled: { type: 'boolean', description: 'Whether the preset should be available for new sessions; the choice persists across restarts.' },
      }, required: ['id', 'enabled'],
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: { id: { type: 'string' }, enabled: { type: 'boolean' }, applied: { type: 'boolean' } },
        required: ['id', 'enabled', 'applied'],
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(args) {
      const request = args as { id?: unknown; enabled?: unknown } | null
      if (!request || typeof request.id !== 'string' || typeof request.enabled !== 'boolean') throw new TypeError('id and enabled are required')
      const result = await service.setEnabled({ id: request.id, enabled: request.enabled })
      if (!result.ok || !result.applied) {
        throw new ManagerError(
          ManagerErrorCode.registrationFailed,
          result.errors.map((issue) => issue.message).join('\n') || 'Preset state was not applied',
          result.errors,
        )
      }
      return { id: request.id, enabled: request.enabled, applied: true }
    },
  }), 'dsh-preset-manager: preset enablement tool')
}
