import type { Me } from '../api/types'

export const me = (over: Partial<Me> = {}): Me => ({
  id: 1,
  email: 'tomi@example.com',
  name: 'Tomi',
  color: '#b9532f',
  goals: { kcal: 2200, protein: 110, fiber: 30, sugar: 50 },
  household: {
    id: 1,
    name: 'Home',
    invite_code: 'inv123',
    reward_per: 2,
    reward_cap: 3,
    members: [
      { id: 1, name: 'Tomi', color: '#b9532f' },
      { id: 2, name: 'Partner', color: '#5d8582' },
    ],
  },
  ...over,
})
