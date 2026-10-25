import { describe, expect, it } from 'vitest'
import { drop, enqueue, fromForm, pending, toForm } from './outbox'

describe('outbox', () => {
  it('keeps changes in the order they were made until dropped', async () => {
    await enqueue({ path: '/snacks', method: 'POST', json: '{"a":1}', label: 'Log Apple' }, 2)
    await enqueue({ path: '/shopping/check/3', method: 'PUT', json: '{"checked":true}', label: 'Tick Milk' }, 1)
    const [first, second] = await pending()
    expect([first.label, second.label]).toEqual(['Log Apple', 'Tick Milk']) // made first, not by clock
    expect(first).toMatchObject({ path: '/snacks', method: 'POST', json: '{"a":1}', at: 2 })
    await drop(first.id!)
    expect((await pending()).map((c) => c.label)).toEqual(['Tick Milk'])
  })

  it('stores a photo form as bytes and builds it again', async () => {
    const form = new FormData()
    form.append('photo', new File(['jpeg'], 'p.jpg', { type: 'image/jpeg' }))
    form.append('kind', 'meal')
    form.append('meal_type', 'lunch')
    const q = await fromForm(form)
    expect(q.fields).toEqual([['kind', 'meal'], ['meal_type', 'lunch']])
    expect(q.file).toMatchObject({ field: 'photo', name: 'p.jpg', type: 'image/jpeg' })
    const again = toForm(q)
    expect(again.get('kind')).toBe('meal')
    const photo = again.get('photo') as File
    expect([photo.name, await photo.text()]).toEqual(['p.jpg', 'jpeg'])
    await expect(fromForm(new FormData())).rejects.toThrow(/photo/)
  })
})
