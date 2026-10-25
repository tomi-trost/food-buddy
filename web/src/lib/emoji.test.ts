import { describe, expect, it } from 'vitest'
import { guessEmoji } from './emoji'

describe('guessEmoji', () => {
  it('takes the dish from the last food word', () => {
    expect(guessEmoji('Banana pancakes')).toBe('🥞')
    expect(guessEmoji('Banana pancake')).toBe('🥞')
    expect(guessEmoji('Spaghetti bolognese')).toBe('🍝')
    expect(guessEmoji('Overnight oats')).toBe('🥣')
  })

  it('knows plurals both ways', () => {
    expect(guessEmoji('Roasted tomatoes')).toBe('🍅')
    expect(guessEmoji('Waffles')).toBe('🧇')
  })

  it('is null when no word names a food', () => {
    expect(guessEmoji('Our Sunday thing')).toBeNull()
    expect(guessEmoji('')).toBeNull()
  })
})
