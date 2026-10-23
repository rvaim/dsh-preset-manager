/**
 * Locale dictionaries must resolve the way the host resolves them.
 *
 * DSH's locale service looks a key up with a flat `dict[key]`: it does not walk
 * a nested object and does not split on dots. A nested dictionary therefore
 * resolves only its top-level keys, and every `t('action.import')` silently
 * renders the key name itself — which is exactly what a page full of
 * `action.import` buttons is.
 *
 * These tests pin the two properties that failure depended on: the flattened
 * dictionary contains the dotted keys the UI asks for, and both languages carry
 * the same key set.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { en, flattenLocale, localeKeyDiff, zh } from '../../client/locales/index.js'

describe('locale dictionaries', () => {
  it('flattens a nested tree into dotted keys', () => {
    const flat = flattenLocale({ a: { b: { c: 'value' } }, top: 'root' })
    assert.deepEqual(flat, { 'a.b.c': 'value', top: 'root' })
  })

  it('rejects a non-string leaf instead of rendering an object', () => {
    assert.throws(
      () => flattenLocale({ bad: { nested: 42 as unknown as string } }),
      /must be a string/,
    )
  })

  it('exposes the dotted keys the page actually asks for', () => {
    // These are the exact keys whose absence rendered as button labels.
    for (const key of [
      'action.import',
      'action.clone',
      'action.view',
      'action.export',
      'action.history',
      'action.delete',
      'action.restore',
      'action.purge',
      'common.refresh',
      'common.retry',
      'common.cancel',
      'page.title',
      'list.emptyTitle',
      'error.notReadyTitle',
    ]) {
      assert.equal(typeof zh[key], 'string', `zh is missing ${key}`)
      assert.equal(typeof en[key], 'string', `en is missing ${key}`)
      // A key that resolves to itself is the failure mode, not a translation.
      assert.notEqual(zh[key], key)
      assert.notEqual(en[key], key)
    }
  })

  it('keeps both languages structurally identical', () => {
    const diff = localeKeyDiff()
    assert.deepEqual(diff.missingInZh, [], 'keys present in en but not zh')
    assert.deepEqual(diff.missingInEn, [], 'keys present in zh but not en')
  })

  it('carries no nested object values in the flat result', () => {
    for (const [key, value] of Object.entries(zh)) {
      assert.equal(typeof value, 'string', `zh.${key} is not a string`)
    }
    for (const [key, value] of Object.entries(en)) {
      assert.equal(typeof value, 'string', `en.${key} is not a string`)
    }
  })

  it('provides the placeholder tokens the page interpolates', () => {
    // `t('list.summary', { total, managed })` only works if the template carries
    // those names; a mismatch renders the braces to the user.
    const expectToken = (template: string | undefined, token: string): void => {
      assert.ok(template !== undefined, `missing template for ${token}`)
      assert.match(template, new RegExp(`\\{${token}\\}`))
    }
    expectToken(zh['list.summary'], 'total')
    expectToken(zh['list.summary'], 'managed')
    expectToken(zh['detail.rowCount'], 'count')
    expectToken(zh['data.purgeInstruction'], 'phrase')
    expectToken(en['list.summary'], 'total')
    expectToken(en['detail.rowCount'], 'count')
  })
})
