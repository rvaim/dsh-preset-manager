/** Native top-layer dialog: focus trapping, Escape, and return focus are browser-owned. */
import * as React from 'react'

export interface DialogProps {
  title: string
  closeLabel: string
  busy?: boolean
  variant?: 'default' | 'editor' | 'confirm'
  onClose(): void
  children?: React.ReactNode
  footer?: React.ReactNode
}

export function Dialog(props: DialogProps): React.ReactElement {
  const ref = React.useRef<HTMLDialogElement>(null)
  const titleId = React.useId()
  const onClose = React.useRef(props.onClose)
  onClose.current = props.onClose
  React.useLayoutEffect(() => {
    const dialog = ref.current!
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
    dialog.showModal()
    return () => {
      dialog.close()
      if (trigger?.isConnected && (!trigger.closest('dialog') || trigger.closest('dialog')!.open)) trigger.focus({ preventScroll: true })
    }
  }, [])
  return React.createElement('dialog', {
    ref, className: `dshpm-dialog${props.variant === 'editor' ? ' dshpm-dialog--editor' : props.variant === 'confirm' ? ' dshpm-dialog--confirm' : ''}`, 'aria-labelledby': titleId,
    onKeyDown: (event: React.KeyboardEvent<HTMLDialogElement>) => {
      if (event.key === 'Escape') event.stopPropagation()
    },
    onCancel: (event: React.SyntheticEvent<HTMLDialogElement>) => {
      event.preventDefault()
      event.stopPropagation()
      if (!props.busy) onClose.current()
    },
    onClick: (event: React.MouseEvent<HTMLDialogElement>) => {
      if (props.busy || event.target !== event.currentTarget) return
      const box = event.currentTarget.getBoundingClientRect()
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose.current()
    },
  },
    React.createElement('div', { className: 'dshpm-dialog-layout' },
      React.createElement('header', { className: 'dshpm-dialog-head' },
        React.createElement('h3', { id: titleId, className: 'dshpm-dialog-title' }, props.title),
        React.createElement('button', {
          className: 'dshpm-notice-dismiss', type: 'button', disabled: props.busy,
          'aria-label': props.closeLabel, title: props.closeLabel,
          onClick: () => onClose.current(),
        }, React.createElement('svg', { viewBox: '0 0 16 16', width: 16, height: 16, 'aria-hidden': true },
          React.createElement('path', { d: 'm4 4 8 8m0-8-8 8', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 }))),
      ),
      React.createElement('div', { className: 'dshpm-dialog-body' }, props.children),
      props.footer === undefined ? null : React.createElement('footer', { className: 'dshpm-dialog-foot' }, props.footer),
    ),
  )
}
