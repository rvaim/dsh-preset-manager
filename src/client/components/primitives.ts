/**
 * Presentational primitives shared by the page's views.
 *
 * These mirror the host's own controls — same markup shape, same token usage,
 * same `role`/`aria` behaviour — rather than importing a Client package: the
 * primitives are not a dependency a bundle may load, and copying the shape keeps
 * the page visually native while staying self-contained.
 */
import * as React from 'react'
import { IconAlert, IconError, IconInfo, IconSuccess } from './icons.js'

/** A panel: hairline border, one raised fill, an optional titled header. */
export function Panel(props: {
  title?: string
  hint?: string
  action?: React.ReactNode
  footer?: React.ReactNode
  children?: React.ReactNode
}): React.ReactElement {
  return React.createElement(
    'section',
    { className: 'dshpm-panel' },
    props.title === undefined
      ? null
      : React.createElement(
          'div',
          { className: 'dshpm-panel-head' },
          React.createElement(
            'div',
            { style: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 } },
            React.createElement('h3', { className: 'dshpm-panel-title' }, props.title),
            props.hint === undefined
              ? null
              : React.createElement('p', { className: 'dshpm-panel-hint' }, props.hint),
          ),
          props.action === undefined
            ? null
            : React.createElement(
                'div',
                { style: { marginLeft: 'auto', display: 'flex', gap: 6 } },
                props.action,
              ),
        ),
    props.children === undefined
      ? null
      : React.createElement('div', { className: 'dshpm-panel-body' }, props.children),
    props.footer === undefined
      ? null
      : React.createElement('div', { className: 'dshpm-panel-foot' }, props.footer),
  )
}

/** A labelled control. */
export function Field(props: {
  label: string
  hint?: string
  htmlFor?: string
  children?: React.ReactNode
}): React.ReactElement {
  const id = props.htmlFor
  return React.createElement(
    'div',
    { className: 'dshpm-field' },
    React.createElement(
      'label',
      { className: 'dshpm-label', ...(id === undefined ? {} : { htmlFor: id }) },
      props.label,
    ),
    props.children,
    props.hint === undefined
      ? null
      : React.createElement('span', { className: 'dshpm-hint' }, props.hint),
  )
}

export type ButtonVariant = 'default' | 'primary' | 'danger' | 'quiet'

/** A button. `variant` chooses weight, never a new size. */
export function Button(props: {
  children?: React.ReactNode
  variant?: ButtonVariant
  small?: boolean
  disabled?: boolean
  title?: string
  type?: 'button' | 'submit'
  onClick?: () => void
}): React.ReactElement {
  const variant = props.variant ?? 'default'
  const classes = [
    'dshpm-btn',
    variant === 'default' ? '' : `dshpm-btn--${variant}`,
    props.small === true ? 'dshpm-btn--sm' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return React.createElement(
    'button',
    {
      type: props.type ?? 'button',
      className: classes,
      ...(props.disabled === true ? { disabled: true } : {}),
      ...(props.title === undefined ? {} : { title: props.title }),
      ...(props.onClick === undefined ? {} : { onClick: props.onClick }),
    },
    props.children,
  )
}

export type BadgeTone = 'ok' | 'warn' | 'err' | 'idle'

/** A status pill. The dot makes state readable without relying on colour. */
export function Badge(props: {
  tone: BadgeTone
  children?: React.ReactNode
  title?: string
}): React.ReactElement {
  return React.createElement(
    'span',
    {
      className: `dshpm-badge dshpm-badge--${props.tone}`,
      ...(props.title === undefined ? {} : { title: props.title }),
    },
    React.createElement('span', { className: 'dshpm-dot' }),
    props.children,
  )
}

/** A neutral chip for ownership, which is not a health state. */
export function Chip(props: { children?: React.ReactNode }): React.ReactElement {
  return React.createElement(
    'span',
    { className: 'dshpm-badge dshpm-badge--idle' },
    props.children,
  )
}

export type NoticeLevel = 'info' | 'success' | 'warning' | 'error'

const NOTICE_ICON = {
  info: IconInfo,
  success: IconSuccess,
  warning: IconAlert,
  error: IconError,
} as const

const NOTICE_COLOR = {
  info: 'var(--dsw-alias-label-secondary)',
  success: 'var(--dsw-alias-state-success-primary)',
  warning: 'var(--dsw-alias-state-warn-primary)',
  error: 'var(--dsw-alias-state-error-primary)',
} as const

/**
 * A message block.
 *
 * Detail lines render as a list rather than being joined into the message so a
 * long diagnostic stays scannable, and the whole block is selectable for copying
 * — the user's usual next step after reading a failure.
 */
export function Notice(props: {
  level: NoticeLevel
  title?: string
  message?: string
  details?: readonly string[]
  onDismiss?: () => void
  dismissLabel?: string
  children?: React.ReactNode
}): React.ReactElement {
  const Icon = NOTICE_ICON[props.level]
  return React.createElement(
    'div',
    {
      className: `dshpm-notice dshpm-notice--${props.level}`,
      role: props.level === 'error' ? 'alert' : 'status',
    },
    React.createElement(
      'span',
      { style: { color: NOTICE_COLOR[props.level], flex: 'none', marginTop: 1 } },
      React.createElement(Icon, { size: 14 }),
    ),
    React.createElement(
      'div',
      { className: 'dshpm-notice-body' },
      props.title === undefined
        ? null
        : React.createElement('span', { className: 'dshpm-notice-title' }, props.title),
      props.message === undefined
        ? null
        : React.createElement('span', { className: 'dshpm-notice-text' }, props.message),
      props.details === undefined || props.details.length === 0
        ? null
        : React.createElement(
            'ul',
            { className: 'dshpm-issues' },
            props.details.map((line, index) =>
              React.createElement('li', { key: index }, line),
            ),
          ),
      props.children ?? null,
    ),
    props.onDismiss === undefined
      ? null
      : React.createElement(
          'button',
          {
            type: 'button',
            className: 'dshpm-notice-dismiss',
            onClick: props.onDismiss,
            title: props.dismissLabel,
            'aria-label': props.dismissLabel,
          },
          '×',
        ),
  )
}

/** A loading line with a spinner. */
export function Loading(props: { label: string }): React.ReactElement {
  return React.createElement(
    'div',
    { className: 'dshpm-loading' },
    React.createElement('span', { className: 'dshpm-spinner' }),
    React.createElement('span', null, props.label),
  )
}

/** An empty state: what is missing, why, and the one action that resolves it. */
export function EmptyState(props: {
  title: string
  body: string
  actions?: React.ReactNode
}): React.ReactElement {
  return React.createElement(
    'div',
    { className: 'dshpm-empty' },
    React.createElement('p', { className: 'dshpm-empty-title' }, props.title),
    React.createElement('p', { className: 'dshpm-empty-body' }, props.body),
    props.actions === undefined
      ? null
      : React.createElement('div', { className: 'dshpm-empty-actions' }, props.actions),
  )
}

/** A key/value row for read-only facts. */
export function KeyValue(props: {
  rows: readonly { key: string; value: React.ReactNode }[]
}): React.ReactElement {
  return React.createElement(
    'div',
    { className: 'dshpm-kv' },
    props.rows.map((row, index) =>
      React.createElement(
        'div',
        { className: 'dshpm-kv-row', key: index },
        React.createElement('span', { className: 'dshpm-kv-key' }, row.key),
        React.createElement('span', { className: 'dshpm-kv-val' }, row.value),
      ),
    ),
  )
}

/** A checkbox row. The whole label is clickable, which is the real hit target. */
export function Checkbox(props: {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  children?: React.ReactNode
}): React.ReactElement {
  return React.createElement(
    'label',
    { className: 'dshpm-check' },
    React.createElement('input', {
      type: 'checkbox',
      checked: props.checked,
      ...(props.disabled === true ? { disabled: true } : {}),
      onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
        props.onChange(event.target.checked),
    }),
    React.createElement('span', null, props.children),
  )
}

/** A segmented tab control. Values are plain strings; the caller narrows. */
export function Tabs(props: {
  value: string
  options: readonly { value: string; label: string }[]
  onChange: (value: string) => void
}): React.ReactElement {
  return React.createElement(
    'div',
    { className: 'dshpm-tabs', role: 'tablist' },
    props.options.map((option) =>
      React.createElement(
        'button',
        {
          key: option.value,
          type: 'button',
          role: 'tab',
          className: 'dshpm-tab',
          'aria-selected': props.value === option.value,
          onClick: () => props.onChange(option.value),
        },
        option.label,
      ),
    ),
  )
}
