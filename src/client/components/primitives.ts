/**
 * Small presentational primitives shared by the page's views.
 *
 * These deliberately mirror the host's own controls (same markup shape, same
 * token usage, same `role`/`aria` behaviour) rather than importing a Client
 * package: the primitives are not a dependency a bundle may load, and copying
 * the shape keeps the page visually native while remaining self-contained.
 */
import * as React from 'react'

/** A section heading plus optional muted explanation. */
export function SectionHeader(props: {
  title: string
  hint?: string
}): React.ReactElement {
  return React.createElement(
    'div',
    { className: 'dshpm-header' },
    React.createElement('h4', { className: 'dshpm-section-title' }, props.title),
    props.hint === undefined
      ? null
      : React.createElement('p', { className: 'dshpm-hint' }, props.hint),
  )
}

/**
 * A labelled form field.
 *
 * `children` is optional so a field can be rendered as a bare caption. Most
 * callers pass the control as a child element.
 */
export function Field(props: {
  label: string
  hint?: string
  children?: React.ReactNode
}): React.ReactElement {
  return React.createElement(
    'label',
    { className: 'dshpm-field' },
    React.createElement('span', { className: 'dshpm-label' }, props.label),
    props.children,
    props.hint === undefined
      ? null
      : React.createElement('span', { className: 'dshpm-hint' }, props.hint),
  )
}

export type BadgeTone = 'ok' | 'warn' | 'err' | 'idle' | 'plain'

/** One pill-shaped status badge. */
export function Badge(props: {
  tone: BadgeTone
  children?: React.ReactNode
  title?: string
}): React.ReactElement {
  const tone = props.tone === 'plain' ? '' : ` dshpm-${props.tone}`
  return React.createElement(
    'span',
    { className: `dshpm-badge${tone}`, ...(props.title === undefined ? {} : { title: props.title }) },
    props.children,
  )
}

export type NoticeLevel = 'info' | 'success' | 'warning' | 'error'

/**
 * A message block.
 *
 * Detail lines are rendered as a list rather than joined into the message so a
 * long diagnostic stays scannable, and the whole block is selectable for
 * copying — the user's usual next step after reading a failure.
 */
export function Notice(props: {
  level: NoticeLevel
  message: string
  details?: readonly string[]
  onDismiss?: () => void
  dismissLabel?: string
}): React.ReactElement {
  const cls = props.level === 'info' ? '' : ` dshpm-${props.level}`
  return React.createElement(
    'div',
    { className: `dshpm-notice${cls}`, role: props.level === 'error' ? 'alert' : 'status' },
    React.createElement(
      'div',
      { className: 'dshpm-notice-head' },
      React.createElement('span', { className: 'dshpm-notice-body' }, props.message),
      React.createElement('span', { className: 'dshpm-spacer' }),
      props.onDismiss === undefined
        ? null
        : React.createElement(
            'button',
            { type: 'button', onClick: props.onDismiss },
            props.dismissLabel ?? '×',
          ),
    ),
    props.details === undefined || props.details.length === 0
      ? null
      : React.createElement(
          'ul',
          { className: 'dshpm-details' },
          props.details.map((line, index) =>
            React.createElement('li', { key: index }, line),
          ),
        ),
  )
}

/** A bordered card grouping related controls. */
export function Card(props: { children?: React.ReactNode }): React.ReactElement {
  return React.createElement('div', { className: 'dshpm-card' }, props.children)
}
