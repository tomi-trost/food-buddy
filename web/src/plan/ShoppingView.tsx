import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { api } from '../api/client'
import type { ShoppingItem } from '../api/types'
import { todayISO } from '../lib/dates'
import { Icon } from '../ui/Icon'
import { useToast } from '../ui/Toast'

export function ShoppingView() {
  const qc = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const shopping = useQuery({ queryKey: ['shopping'], queryFn: api.shopping })
  const check = useMutation({
    mutationFn: ({ id, on }: { id: number; on: boolean }) => api.checkItem(id, on),
    onSuccess: (s) => qc.setQueryData(['shopping'], s),
  })
  const finish = useMutation({
    mutationFn: () => api.finishShopping(todayISO()),
    onSuccess: ({ added }) => {
      qc.invalidateQueries({ queryKey: ['shopping'] })
      qc.invalidateQueries({ queryKey: ['inventory'] })
      navigate('/ingredients')
      toast(`${added} item${added === 1 ? '' : 's'} added to ingredients`)
    },
  })

  const s = shopping.data
  if (!s) return shopping.isError ? <p className="error" role="alert">{shopping.error.message}</p> : null
  if (!s.items.length && !s.plan_approved) {
    return (
      <div className="card sub" style={{ textAlign: 'center', padding: 26 }}>
        The shopping list appears once you both approve the weekly menu — or when you mark an ingredient as used up while cooking.
      </div>
    )
  }

  const ran = s.items.filter((i) => i.ran_out)
  const groups = new Map<string, ShoppingItem[]>()
  for (const i of s.items.filter((x) => !x.ran_out)) groups.set(i.ingredient.category, [...(groups.get(i.ingredient.category) ?? []), i])
  const inCart = s.items.filter((i) => i.checked).length

  const line = (i: ShoppingItem) => (
    <button key={i.ingredient.id} style={{ width: '100%', textAlign: 'left' }} aria-pressed={i.checked}
      aria-label={`${i.ingredient.name}, ${i.buy} g`} onClick={() => check.mutate({ id: i.ingredient.id, on: !i.checked })}>
      <span className={`chk${i.checked ? ' on' : ''}`}>{i.checked && <Icon name="check" size={16} />}</span>
      <span className={`sp${i.checked ? ' done' : ''}`}>
        {i.ingredient.emoji} {i.ingredient.name}
        {i.have > 0 && <div className="sub">have {i.have} g</div>}
      </span>
      <b>{i.buy} g</b>
    </button>
  )

  return (
    <>
      <div className="row sub" style={{ marginBottom: 8 }}>
        <span className="sp">{s.items.length} items · est. {s.total.toFixed(2)} €</span>
        <span>{inCart} in cart</span>
      </div>
      {!!ran.length && (
        <div className="card">
          <h3 className="row" style={{ gap: 6 }}><Icon name="alert" size={16} /> Ran out while cooking</h3>
          <div className="list">{ran.map(line)}</div>
        </div>
      )}
      {[...groups].map(([category, items]) => (
        <div className="card" key={category}>
          <h3>{category}</h3>
          <div className="list">{items.map(line)}</div>
        </div>
      ))}
      {!!s.in_stock.length && (
        <div className="card">
          <h3>Already in stock</h3>
          <div className="chips" style={{ marginTop: 8 }}>
            {s.in_stock.map((i) => <span key={i.id} className="chip">{i.emoji} {i.name}</span>)}
          </div>
        </div>
      )}
      {finish.isError && <p className="error" role="alert">{finish.error.message}</p>}
      <button className="btn" disabled={!inCart || finish.isPending} onClick={() => finish.mutate()}>
        <Icon name="cart" size={18} /> Finished shopping → add to ingredients
      </button>
    </>
  )
}
