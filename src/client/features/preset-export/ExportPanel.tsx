/**
 * Export and share one preset.
 *
 * Three affordances the requirement calls for, each with an honest outcome:
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
import type { ExportResult, ValidationIssue } from '../../../shared/types.js'
import type { PresetManagerApi } from '../../api/remote-api.js'
import { Card, Notice, SectionHeader } from '../../components/primitives.js'

export interface ExportPanelProps {
  readonly api: PresetManagerApi
  readonly id: string
  readonly t: (key: string) => string
  readonly onClose: () => void
  readonly onNotice: (level: 'error' | 'success', message: string) => void
}

export function ExportPanel(props: ExportPanelProps): React.ReactElement {
  const { api, id, t } = props
  const [result, setResult] = React.useState<ExportResult | undefined>(undefined)
  const [error, setError] = React.useState<string | undefined>(undefined)
  const [copyState, setCopyState] = React.useState<'idle' | 'copied' | 'failed'>('idle')

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
      if (navigator.clipboard?.writeText === undefined) throw new Error('clipboard API unavailable')
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
    'div',
    { className: 'dshpm' },
    React.createElement(
      Card,
      null,
      React.createElement(SectionHeader, { title: t('share.title') }),

      error === undefined
        ? null
        : React.createElement(Notice, { level: 'error', message: error }),

      result === undefined
        ? React.createElement('p', { className: 'dshpm-muted' }, t('loading'))
        : React.createElement(
            'div',
            { className: 'dshpm' },

            result.risks.length === 0
              ? React.createElement('p', { className: 'dshpm-muted' }, t('share.noRisks'))
              : React.createElement(Notice, {
                  level: 'warning',
                  message: t('share.risks'),
                  details: result.risks.map(formatRisk),
                }),

            copyState === 'copied'
              ? React.createElement(Notice, { level: 'success', message: t('share.copied') })
              : null,
            copyState === 'failed'
              ? React.createElement(Notice, {
                  level: 'error',
                  message: t('share.copyFailed'),
                })
              : null,

            React.createElement(
              'div',
              { className: 'dshpm-actions' },
              React.createElement(
                'button',
                {
                  type: 'button',
                  className: 'dshpm-primary',
                  onClick: () => void copy(),
                },
                t('action.copyShare'),
              ),
              React.createElement(
                'button',
                { type: 'button', onClick: download },
                t('action.download'),
              ),
              React.createElement(
                'button',
                { type: 'button', onClick: props.onClose },
                t('action.cancel'),
              ),
            ),

            React.createElement(
              SectionHeader,
              { title: t('share.manualCopy'), hint: t('share.noRisks') },
            ),
            React.createElement('textarea', {
              className: 'dshpm-code',
              readOnly: true,
              value: result.yaml,
              spellCheck: false,
              'aria-label': t('share.manualCopy'),
            }),
          ),
    ),
  )
}

function formatRisk(issue: ValidationIssue): string {
  return `${issue.path === undefined ? '' : issue.path + ': '}${issue.message}${
    issue.detail === undefined ? '' : `（${issue.detail}）`
  }`
}
