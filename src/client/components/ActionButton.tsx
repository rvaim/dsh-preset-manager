/** Feedback stays on the control that initiated the action. */
import * as React from 'react'
import { IconCheck } from './icons.js'

type ActionState = 'idle' | 'pending' | 'success' | 'error'
export interface ActionButtonProps {
  label: string
  pendingLabel: string
  successLabel: string
  retryLabel: string
  hint?: string
  feedback?: string
  disabled?: boolean
  icon?: React.ReactNode
  onAction(): Promise<boolean>
}

export function ActionButton(props: ActionButtonProps): React.ReactElement {
  const [state, setState] = React.useState<ActionState>('idle')
  const inFlight = React.useRef(false)
  const mounted = React.useRef(true)
  const timer = React.useRef<ReturnType<typeof setTimeout>>()
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; clearTimeout(timer.current) } }, [])
  const run = async (): Promise<void> => {
    if (props.disabled || inFlight.current) return
    inFlight.current = true
    clearTimeout(timer.current)
    setState('pending')
    let ok = false
    try { ok = await props.onAction() } catch { /* the originating control reports failure */ }
    inFlight.current = false
    if (!mounted.current) return
    setState(ok ? 'success' : 'error')
    if (ok) timer.current = setTimeout(() => { if (mounted.current) setState('idle') }, 1800)
  }
  const label = state === 'pending' ? props.pendingLabel : state === 'success' ? props.successLabel : state === 'error' ? props.retryLabel : props.label
  return React.createElement('button', {
    type: 'button', className: 'dshpm-btn dshpm-btn--quiet dshpm-action-btn',
    disabled: props.disabled || state === 'pending', 'data-action-state': state,
    'aria-busy': state === 'pending', 'aria-label': state === 'idle' ? props.label : `${props.label}：${label}`, title: state === 'idle' ? props.hint : props.feedback ?? label,
    onClick: () => void run(),
  },
    state === 'pending' ? React.createElement('span', { className: 'dshpm-spinner', 'aria-hidden': true }) :
      state === 'success' ? React.createElement(IconCheck, { size: 14 }) : props.icon,
    React.createElement('span', { 'aria-live': 'polite' }, label),
  )
}
