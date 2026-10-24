/** Controlled, keyboard-accessible enablement switch. */
import * as React from 'react'

export interface SwitchProps {
  checked: boolean
  label: string
  disabled?: boolean
  busy?: boolean
  title?: string
  onChange(checked: boolean): void
}

export function Switch(props: SwitchProps): React.ReactElement {
  return React.createElement('button', {
    type: 'button', role: 'switch', className: 'dshpm-switch',
    'aria-checked': props.checked, 'aria-label': props.label,
    'aria-busy': props.busy || undefined,
    disabled: props.disabled || props.busy,
    title: props.title ?? props.label,
    onClick: () => { if (!props.disabled && !props.busy) props.onChange(!props.checked) },
  }, React.createElement('span', { className: 'dshpm-switch-track', 'aria-hidden': true },
    React.createElement('span', { className: 'dshpm-switch-thumb' }),
  ))
}
