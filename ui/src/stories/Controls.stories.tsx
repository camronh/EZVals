import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fn, userEvent, within } from 'storybook/test'
import { Dialog } from '../components/Dialog'
import { Dropdown, Segmented } from '../components/Dropdown'
import { Icon } from '../components/Icon'
import { Spinner } from '../components/Spinner'

const meta: Meta = { title: 'Design System/Controls', parameters: { layout: 'padded' } }
export default meta

const row = 'flex flex-wrap items-center gap-2'
const label = 'section-label mb-2 block'

/** `.btn` plus at most one variant (`btn-primary`, `btn-ghost`, `btn-danger`, `btn-pressed`) and one size (`btn-sm`, `btn-xs`), `btn-icon` for icon-only. */
export const Buttons: StoryObj = {
  render: () => (
    <div className="space-y-5 bg-surface text-fg">
      <div>
        <span className={label}>Variants</span>
        <div className={row}>
          <button className="btn btn-primary"><Icon name="play" className="h-3 w-3" />Run</button>
          <button className="btn"><Icon name="compare" />Compare</button>
          <button className="btn btn-ghost">Cancel</button>
          <button className="btn btn-danger"><Icon name="stop" className="h-3 w-3" />Stop</button>
          <button className="btn btn-pressed" aria-pressed="true"><Icon name="filter" />Filters</button>
          <button className="btn btn-icon" aria-label="More actions"><Icon name="more" /></button>
        </div>
      </div>
      <div>
        <span className={label}>Sizes: 32, 28 and 24px</span>
        <div className={row}>
          <button className="btn">Default</button>
          <button className="btn btn-sm">Small</button>
          <button className="btn btn-xs">Extra small</button>
          <button className="btn btn-sm btn-icon" aria-label="Close"><Icon name="close" /></button>
          <button className="btn btn-xs btn-icon" aria-label="Edit"><Icon name="pencil" className="h-3 w-3" /></button>
        </div>
      </div>
      <div>
        <span className={label}>States</span>
        <div className={row}>
          <button className="btn btn-primary" disabled>Disabled</button>
          <button className="btn" disabled>Disabled</button>
          <button className="btn btn-primary"><Spinner />Running…</button>
        </div>
      </div>
    </div>
  ),
}

export const Fields: StoryObj = {
  render: () => (
    <div className="grid max-w-md gap-3 bg-surface text-fg">
      <label className="flex flex-col gap-1.5"><span className="section-label">Text</span><input className="input" placeholder="Search" /></label>
      <label className="flex flex-col gap-1.5"><span className="section-label">Select</span><select className="input"><option>helpfulness</option><option>pass</option></select></label>
      <label className="flex flex-col gap-1.5"><span className="section-label">Textarea</span><textarea className="input" rows={3} placeholder="What did you notice?" /></label>
      <div className={row}>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" />Unchecked</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" defaultChecked />Checked</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" ref={(el) => { if (el) el.indeterminate = true }} />Some</label>
        <label className="flex items-center gap-2 text-sm text-fg-muted"><input type="checkbox" disabled />Disabled</label>
      </div>
    </div>
  ),
}

/** A radio group: arrow keys move the choice, and only the chosen option is in the Tab order. */
export const SegmentedControl: StoryObj = {
  render: function Render() {
    const [value, setValue] = useState('all')
    return <Segmented label="Show" value={value} onChange={setValue} options={[{ value: 'all', label: 'All' }, { value: 'failed', label: 'Failed' }, { value: 'errors', label: 'Errors' }]} />
  },
  play: async ({ canvasElement }) => {
    const all = within(canvasElement).getByRole('radio', { name: 'All' })
    all.focus()
    await userEvent.keyboard('{ArrowRight}')
    const failed = within(canvasElement).getByRole('radio', { name: 'Failed' })
    await expect(failed).toHaveAttribute('aria-checked', 'true')
    await expect(failed).toHaveFocus()
  },
}

export const Chips: StoryObj = {
  render: () => (
    <div className={`${row} bg-surface`}>
      <span className="chip">production</span>
      <span className="chip chip-success"><span aria-hidden="true">✓</span>pass</span>
      <span className="chip chip-danger"><span aria-hidden="true">✗</span>concise</span>
      <span className="chip chip-accent">helpfulness ≥ 0.8</span>
      <kbd className="kbd">Esc</kbd>
      <kbd className="kbd">↑</kbd>
    </div>
  ),
}

/** Menus take focus on open; arrow keys move between items; Escape closes and returns focus to the button. */
export const Menu: StoryObj = {
  render: () => (
    <div className="h-48 bg-surface">
      <Dropdown
        label="Export"
        align="left"
        panelClass="w-56 p-1"
        button={({ toggle, trigger }) => <button className="btn" onClick={toggle} {...trigger}><Icon name="download" />Export</button>}
      >
        {(close) => ['JSON', 'CSV', 'Markdown'].map((item) => <button key={item} role="menuitem" className="menu-item" onClick={close}>{item}</button>)}
      </Dropdown>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const trigger = canvas.getByRole('button', { name: 'Export' })
    await userEvent.click(trigger)
    await expect(canvas.getByRole('menuitem', { name: 'JSON' })).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    await expect(canvas.getByRole('menuitem', { name: 'CSV' })).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    await expect(canvas.queryByRole('menu')).toBeNull()
    await expect(trigger).toHaveFocus()
  },
}

export const DialogExample: StoryObj = {
  render: () => (
    <div className="h-64">
      <Dialog title="Settings" onClose={fn()}>
        <div className="px-5 py-4 text-sm text-fg-secondary">Dialog content.</div>
        <div className="flex justify-end gap-2 border-t border-line px-5 py-3"><button className="btn">Cancel</button><button className="btn btn-primary">Save</button></div>
      </Dialog>
    </div>
  ),
}
