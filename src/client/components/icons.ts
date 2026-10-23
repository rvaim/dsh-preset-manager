/**
 * Icons, drawn as inline SVG.
 *
 * One stroke weight, one 16px grid, `currentColor` throughout — so an icon takes
 * the colour of the control it sits in and never needs a per-use variant. These
 * are authored here rather than pulled from a dependency because the bundle
 * already treats Client packages as unavailable.
 */
import * as React from 'react'

type IconProps = { readonly size?: number; readonly className?: string }

function svg(
  path: React.ReactNode,
  props: IconProps,
  viewBox = '0 0 16 16',
): React.ReactElement {
  return React.createElement(
    'svg',
    {
      viewBox,
      width: props.size ?? 14,
      height: props.size ?? 14,
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.5,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': true,
      focusable: false,
      ...(props.className === undefined ? {} : { className: props.className }),
    },
    path,
  )
}

/** A preset: stacked composition layers. */
export function IconPreset(props: IconProps): React.ReactElement {
  return svg(
    React.createElement(React.Fragment, null,
      React.createElement('rect', { x: 2.5, y: 2.5, width: 11, height: 3.2, rx: 1 }),
      React.createElement('rect', { x: 2.5, y: 6.9, width: 11, height: 3.2, rx: 1 }),
      React.createElement('rect', { x: 2.5, y: 11.3, width: 11, height: 2.2, rx: 1 }),
    ),
    props,
  )
}

/** Fork: one source branching into an independent composition. */
export function IconFork(props: IconProps): React.ReactElement {
  return svg(React.createElement(React.Fragment, null,
    React.createElement('circle', { cx: 4, cy: 3, r: 1.5 }),
    React.createElement('circle', { cx: 12, cy: 3, r: 1.5 }),
    React.createElement('circle', { cx: 8, cy: 13, r: 1.5 }),
    React.createElement('path', { d: 'M4 4.5v1A3.5 3.5 0 0 0 7.5 9H8m4-4.5v1A3.5 3.5 0 0 1 8.5 9H8v2.5' }),
  ), props)
}

/** Copy. */
export function IconCopy(props: IconProps): React.ReactElement {
  return svg(
    React.createElement(React.Fragment, null,
      React.createElement('rect', { x: 5.5, y: 5.5, width: 8, height: 8, rx: 1.5 }),
      React.createElement('path', { d: 'M10.5 5.5v-1a1.5 1.5 0 0 0-1.5-1.5H4a1.5 1.5 0 0 0-1.5 1.5v5A1.5 1.5 0 0 0 4 11h1' }),
    ),
    props,
  )
}

/** Edit. */
export function IconEdit(props: IconProps): React.ReactElement {
  return svg(
    React.createElement(React.Fragment, null,
      React.createElement('path', { d: 'M11.2 2.6 13.4 4.8 6 12.2 3 13l.8-3z' }),
      React.createElement('path', { d: 'M9.6 4.2 11.8 6.4' }),
    ),
    props,
  )
}

/** History: a clock with a back arrow. */
export function IconHistory(props: IconProps): React.ReactElement {
  return svg(
    React.createElement(React.Fragment, null,
      React.createElement('path', { d: 'M2.6 8a5.4 5.4 0 1 0 1.6-3.8' }),
      React.createElement('path', { d: 'M2.4 2.6v2.6h2.6' }),
      React.createElement('path', { d: 'M8 5.4V8l1.9 1.2' }),
    ),
    props,
  )
}

/** Export: arrow out of a tray. */
export function IconExport(props: IconProps): React.ReactElement {
  return svg(
    React.createElement(React.Fragment, null,
      React.createElement('path', { d: 'M8 10V2.6' }),
      React.createElement('path', { d: 'M5.2 5.4 8 2.6l2.8 2.8' }),
      React.createElement('path', { d: 'M2.8 10.4v1.8a1.2 1.2 0 0 0 1.2 1.2h8a1.2 1.2 0 0 0 1.2-1.2v-1.8' }),
    ),
    props,
  )
}

/** Delete. */
export function IconTrash(props: IconProps): React.ReactElement {
  return svg(
    React.createElement(React.Fragment, null,
      React.createElement('path', { d: 'M2.6 4.2h10.8' }),
      React.createElement('path', { d: 'M6.2 4.2V3a1 1 0 0 1 1-1h1.6a1 1 0 0 1 1 1v1.2' }),
      React.createElement('path', { d: 'M4.2 4.2v8.2a1.4 1.4 0 0 0 1.4 1.4h4.8a1.4 1.4 0 0 0 1.4-1.4V4.2' }),
      React.createElement('path', { d: 'M6.8 7v4M9.2 7v4' }),
    ),
    props,
  )
}

/** Import: arrow into a tray. */
export function IconImport(props: IconProps): React.ReactElement {
  return svg(
    React.createElement(React.Fragment, null,
      React.createElement('path', { d: 'M8 2.6V10' }),
      React.createElement('path', { d: 'M5.2 7.2 8 10l2.8-2.8' }),
      React.createElement('path', { d: 'M2.8 10.4v1.8a1.2 1.2 0 0 0 1.2 1.2h8a1.2 1.2 0 0 0 1.2-1.2v-1.8' }),
    ),
    props,
  )
}

/** Back. */
export function IconArrowLeft(props: IconProps): React.ReactElement {
  return svg(
    React.createElement(React.Fragment, null,
      React.createElement('path', { d: 'M9.5 3.5 5 8l4.5 4.5' }),
    ),
    props,
  )
}

/** Refresh. */
export function IconRefresh(props: IconProps): React.ReactElement {
  return svg(
    React.createElement(React.Fragment, null,
      React.createElement('path', { d: 'M13.2 8a5.2 5.2 0 1 1-1.6-3.7' }),
      React.createElement('path', { d: 'M13.4 2.8v2.8h-2.8' }),
    ),
    props,
  )
}

/** Save. */
export function IconCheck(props: IconProps): React.ReactElement {
  return svg(React.createElement('path', { d: 'M3 8.6 6.2 11.8 13 4.6' }), props)
}

/** Warning triangle. */
export function IconAlert(props: IconProps): React.ReactElement {
  return svg(
    React.createElement(React.Fragment, null,
      React.createElement('path', { d: 'M8 2.6 14.2 13H1.8z' }),
      React.createElement('path', { d: 'M8 6.4v3.2' }),
      React.createElement('path', { d: 'M8 11.4h.01' }),
    ),
    props,
  )
}

/** Error circle. */
export function IconError(props: IconProps): React.ReactElement {
  return svg(
    React.createElement(React.Fragment, null,
      React.createElement('circle', { cx: 8, cy: 8, r: 5.8 }),
      React.createElement('path', { d: 'M8 5v3.6' }),
      React.createElement('path', { d: 'M8 11h.01' }),
    ),
    props,
  )
}

/** Success circle. */
export function IconSuccess(props: IconProps): React.ReactElement {
  return svg(
    React.createElement(React.Fragment, null,
      React.createElement('circle', { cx: 8, cy: 8, r: 5.8 }),
      React.createElement('path', { d: 'M5.4 8.2 7.2 10l3.4-3.6' }),
    ),
    props,
  )
}

/** Info circle. */
export function IconInfo(props: IconProps): React.ReactElement {
  return svg(
    React.createElement(React.Fragment, null,
      React.createElement('circle', { cx: 8, cy: 8, r: 5.8 }),
      React.createElement('path', { d: 'M8 7.2v3.4' }),
      React.createElement('path', { d: 'M8 5h.01' }),
    ),
    props,
  )
}
