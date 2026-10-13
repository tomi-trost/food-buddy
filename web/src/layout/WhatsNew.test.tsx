import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { markSeen, RELEASES, seenRelease, unseen } from '../lib/whatsNew'
import { WhatsNew } from './WhatsNew'

const r = (id: string) => ({ id, notes: [`note ${id}`] })
const releases = [r('c'), r('b'), r('a')]

describe('unseen releases', () => {
  it('lists what came after the last seen one, newest first', () => {
    expect(unseen(releases, 'c')).toEqual([])
    expect(unseen(releases, 'b')).toEqual([r('c')])
    expect(unseen(releases, 'a')).toEqual([r('c'), r('b')])
    expect(unseen(releases, 'a', 1)).toEqual([r('c')])
  })

  it('shows only the latest when nothing or an unknown release was seen', () => {
    expect(unseen(releases, null)).toEqual([r('c')])
    expect(unseen(releases, 'gone')).toEqual([r('c')])
    expect(unseen([], null)).toEqual([])
  })
})

describe('WhatsNew', () => {
  it('shows the notes once, then remembers them as seen', () => {
    const { unmount } = render(<WhatsNew />)
    const dialog = screen.getByRole('dialog', { name: "What's new" })
    expect(dialog).toHaveTextContent(RELEASES[0].notes[0])
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(seenRelease()).toBe(RELEASES[0].id)
    unmount()
    render(<WhatsNew />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('stays hidden when the latest notes were already seen', () => {
    markSeen(RELEASES[0].id)
    render(<WhatsNew />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
