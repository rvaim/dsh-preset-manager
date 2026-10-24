import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { registerEnablementTool } from '../../host/enablement-tool.js'
import type { CordisContext } from '../../host/adapters/cordis-context.js'
import type { MutationResult } from '../../shared/types.js'
import { ManagerError, ManagerErrorCode } from '../../shared/errors.js'

type RegisteredTool = {
  name: string
  deferLoading: boolean
  parameters: { required: string[] }
  execute(args: unknown): Promise<unknown>
  output: { render(args: unknown, value: unknown): { type: string; text: string }[] }
}
function harness(setEnabled: (request: { id: string; enabled: boolean }) => Promise<MutationResult>) {
  let tool: RegisteredTool | undefined
  let cleanup: (() => void | Promise<void>) | undefined
  const ctx: CordisContext = {
    get: (name) => name === 'tools' ? { register(value: RegisteredTool) { tool = value; return () => { tool = undefined } } } : undefined,
    effect: (run) => { const result = run(); if (result) cleanup = result },
    provide: () => {},
  }
  registerEnablementTool(ctx, { setEnabled })
  return { get tool() { assert.ok(tool); return tool }, dispose: () => cleanup?.() }
}

describe('preset enablement agent tool', () => {
  it('uses the same application operation and returns only the saved identity and state', async () => {
    const calls: unknown[] = []
    const registered = harness(async (request) => { calls.push(request); return { ok: true, applied: true, errors: [], warnings: [] } })
    assert.equal(registered.tool.name, 'preset_manager_set_enabled')
    assert.equal(registered.tool.deferLoading, true)
    assert.deepEqual(registered.tool.parameters.required, ['id', 'enabled'])
    const result = await registered.tool.execute({ id: 'codex-original', enabled: false })
    assert.deepEqual(calls, [{ id: 'codex-original', enabled: false }])
    assert.deepEqual(result, { id: 'codex-original', enabled: false, applied: true })
    assert.deepEqual(JSON.parse(registered.tool.output.render({}, result)[0]!.text), result)
    await registered.dispose()
    assert.throws(() => registered.tool)
  })
  it('preserves a backend refusal instead of claiming the toggle succeeded', async () => {
    const error = new ManagerError(ManagerErrorCode.invalidInput, 'Choose another default preset first')
    const registered = harness(async () => { throw error })
    await assert.rejects(
      () => registered.tool.execute({ id: 'standard-efficient', enabled: false }),
      (actual) => actual === error,
    )
  })
  it('refuses invalid enablement values before reaching the application', async () => {
    let calls = 0
    const registered = harness(async () => { calls++; return { ok: true, applied: true, errors: [], warnings: [] } })
    await assert.rejects(() => registered.tool.execute({ id: 'preset', enabled: 'false' }), /id and enabled/)
    assert.equal(calls, 0)
  })
})
