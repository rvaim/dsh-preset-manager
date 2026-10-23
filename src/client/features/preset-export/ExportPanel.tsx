/**
 * Export and share one preset.
 *
 * Three affordances, each with an honest outcome:
 *
 *  - **Copy share text** reports success only after the Clipboard API resolved.
 *    When it fails — an insecure origin, a denied permission — the panel says so
 *    and leaves the text selectable, rather than claiming a copy that did not
 *    happen.
 *  - **Download YAML** uses a blob URL and revokes it, so nothing is left behind.
 *  - **Preview** is the textarea itself, plus the risk findings detected before
 *    the user copies anything.
 *
 * Sensitive findings are shown, never applied: the plugin does not rewrite the
 * user's preset to remove a secret.
 */
import * as React from 'react'
import type { ExportResult } from '../../../shared/types.js'
import type { PresetManagerApi } from '../../api/remote-api.js'
import type { Translate } from '../../pages/PresetManagerPage.js'
import { Button, Loading, Notice, Panel } from '../../components/primitives.js'
import { IconCopy, IconExport } from '../../components/icons.js'

export interface ExportPanelProps {
  readonly api: PresetManagerApi
  readonly id: string
  readonly t: Translate
  readonly onClose: () => void
}

type CopyState = 'idle' | 'copied' | 'failed'

export function ExportPanel(props: ExportPanelProps): React.ReactElement {
  const { api, id, t } = props
  const [result, setResult] = React.useState<ExportResult | undefined>(undefined)
  const [error, setError] = React.useState<string | undefined>(undefined)
  const [copyState, setCopyState] = React.useState<CopyState>('idle')

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const exported = await api.exportPreset(id)
        if (!cancelled) setResult(exported)
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [api, id])

  /**
   * Copy through the Clipboard API.
   *
   * The success message is set only in the resolved branch: a rejection must not
   * leave the UI claiming a copy.
   */
  const copy = async (): Promise<void> => {
    if (result === undefined) return
    try {
      if (navigator.clipboard?.writeText === undefined) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(result.yaml)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  const download = (): void => {
    if (result === undefined) return
    const blob = new Blob([result.yaml], { type: 'application/yaml' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${id}.preset.yml`
    anchor.click()
    // Revoke on the next task so the click has consumed the URL in every browser.
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  return React.createElement(
    Panel,
    {
      title: t('share.heading'),
      footer: React.createElement(
        React.Fragment,
        null,
        React.createElement(Button, { onClick: props.onClose }, t('common.close')),
        React.createElement('span', { className: 'dshpm-spacer' }),
        React.createElement(
          Button,
          { disabled: result === undefined, onClick: download },
          React.createElement(IconExport, { size: 13 }),
          t('share.download'),
        ),
        React.createElement(
          Button,
          {
            variant: 'primary',
            disabled: result === undefined,
            onClick: () => void copy(),
          },
          React.createElement(IconCopy, { size: 13 }),
          t('share.copyShare'),
        ),
      ),
    },

    error === undefined
      ? null
      : React.createElement(Notice, { level: 'error', message: error }),

    result === undefined
      ? React.createElement(Loading, { label: t('common.loading') })
      : React.createElement(
          React.Fragment,
          null,

          result.risks.length === 0
            ? React.createElement(Notice, {
                level: 'info',
                message: t('share.noRisks'),
              })
            : React.createElement(Notice, {
                level: 'warning',
                title: t('share.risksTitle'),
                message: t('share.risksHint'),
                details: result.risks.map(
                  (issue) =>
                    `${issue.path === undefined ? '' : issue.path + ': '}${issue.message}${
                      issue.detail === undefined ? '' : `（${issue.detail}）`
                    }`,
                ),
              }),

          copyState === 'copied'
            ? React.createElement(Notice, { level: 'success', message: t('share.copySucceeded') })
            : null,
          copyState === 'failed'
            ? React.createElement(Notice, {
                level: 'error',
                title: t('share.copyFailedTitle'),
                message: t('share.copyFailedBody'),
              })
            : null,

          React.createElement(
            'div',
            { className: 'dshpm-field' },
            React.createElement('span', { className: 'dshpm-label' }, t('share.manualHeading')),
            React.createElement('span', { className: 'dshpm-hint' }, t('share.manualHint')),
            React.createElement('textarea', {
              className: 'dshpm-textarea dshpm-textarea--code',
              readOnly: true,
              value: result.yaml,
              spellCheck: false,
              'aria-label': t('share.manualHeading'),
            }),
          ),
        ),
  )
}
