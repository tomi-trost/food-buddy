import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { api } from '../api/client'
import type { MealCard, MealKind } from '../api/types'
import { MEAL_TYPE_SHORT } from '../lib/dates'
import { useAddFood } from '../add/AddFood'
import { CookMealSheet } from '../meals/CookSheet'
import { FamilyLearned } from '../meals/FamilyLearned'
import { byFamily, feed, type FeedSeg, type FeedSort, type FeedType, NEXT_SORT, ORIGIN_LABEL, SORT_LABEL } from '../lib/meals'
import { KIND_LABEL, perLabel } from '../lib/snacks'
import { Icon, type IconName } from '../ui/Icon'
import { Photo } from '../ui/Photo'
import { MEAL_TYPE_ICON, typeOption } from '../ui/mealTypes'
import { Toggle } from '../ui/Toggle'

/** Filters: one at a time, tap again to clear. */
const FILTERS: [Exclude<FeedSeg, 'all'>, string, IconName][] = [['top', 'Top', 'star'], ['quick', '≤ 30 min', 'clock'], ['cheap', '≤ 4 €', 'cost']]

/** The meal library; Snacks are meals typed Snack (decision 0025), shown with their own unit. */
export function MealsPage() {
  const [params, setParams] = useSearchParams()
  const type = (params.get('type') ?? 'all') as FeedType | 'snacks'
  const seg = (params.get('seg') ?? 'all') as FeedSeg
  const sort = (params.get('sort') ?? 'rating') as FeedSort
  const grouped = params.get('group') === '1'
  const [open, setOpen] = useState<string[]>([]) // families shown open in the grouped view
  const learned = useQuery({ queryKey: ['families'], queryFn: api.families, enabled: grouped })
  const learnedOf = (name: string) => learned.data?.find((f) => f.name === name)
  const set = (key: string, value: string) =>
    setParams((p) => {
      if (value) p.set(key, value)
      else p.delete(key)
      return p
    }, { replace: true })
  const cards = useQuery({ queryKey: ['meals'], queryFn: api.meals })
  const [logging, setLogging] = useState<number | null>(null)
  const addFood = useAddFood()
  const snacks = type === 'snacks'
  const kind: FeedType = snacks ? 'snack' : type
  const list = feed(cards.data ?? [], kind, snacks ? 'all' : seg, sort)

  return (
    <>
      <div className="top">
        <h1>Meals</h1>
        <button className="groupbtn" aria-label="Group by dish" aria-pressed={grouped} onClick={() => set('group', grouped ? '' : '1')}>
          <Icon name="layers" size={18} /> By dish
        </button>
      </div>
      <Toggle<FeedType | 'snacks'>
        label="Meal type"
        value={type}
        onChange={(v) => set('type', v)}
        stack
        options={[
          { value: 'all', label: <><Icon name="grid" size={18} /><span>All</span></> },
          typeOption('breakfast'),
          typeOption('lunch'),
          typeOption('dinner'),
          { value: 'snacks', label: <><Icon name={MEAL_TYPE_ICON.snack} size={18} /><span>Snacks</span></> },
        ]}
      />
      <div className="feedbar">
        {!snacks && (
          <div className="fchips" role="group" aria-label="Filter">
            {FILTERS.map(([k, label, icon]) => (
              <button key={k} className="fchip" aria-pressed={seg === k} onClick={() => set('seg', seg === k ? 'all' : k)}>
                <span><Icon name={icon} size={14} />{label}</span>
              </button>
            ))}
          </div>
        )}
        <span className="sp" />
        <button className="sortbtn" onClick={() => set('sort', NEXT_SORT[sort])} aria-label={`Sort: ${SORT_LABEL[sort]}`}>
          <Icon name="sort" size={15} /><b>{SORT_LABEL[sort]}</b>
        </button>
      </div>
      {cards.isError && <p className="error" role="alert">{cards.error.message}</p>}
      {grouped ? (
        byFamily(list).map((f) => {
          const shown = open.includes(f.family)
          return (
            <section key={f.family} className="family" aria-label={f.family}>
              <button className="family-head" aria-expanded={shown}
                onClick={() => setOpen(shown ? open.filter((x) => x !== f.family) : [...open, f.family])}>
                <span className="family-emojis" aria-hidden>{f.meals.slice(0, 3).map((m) => m.emoji).join('')}</span>
                <span className="sp">
                  <b>{f.family}</b>
                  <small>{f.meals.length} {f.meals.length === 1 ? 'dish' : 'variations'}{f.best !== null ? ` · best ★ ${Math.round(f.best * 10) / 10}` : ''}</small>
                </span>
                <span className={`family-chev${shown ? ' open' : ''}`}><Icon name="chev" size={16} /></span>
              </button>
              {shown && learnedOf(f.family) && <FamilyLearned family={learnedOf(f.family)!} />}
              {shown && <MealGrid list={f.meals} snacks={snacks} onLog={setLogging} />}
            </section>
          )
        })
      ) : <MealGrid list={list} snacks={snacks} onLog={setLogging} />}
      {cards.isSuccess && !list.length && (snacks ? (
        <div className="card" style={{ textAlign: 'center' }}>
          <p className="sub">No snacks yet. Snap a home-made one, or scan a pack and switch on “Save to our snacks”.</p>
          <button className="btn" onClick={() => addFood({ type: 'snack' })}><Icon name="plus" size={18} /> Add a snack</button>
        </div>
      ) : !cards.data.length ? (
        <div className="card" style={{ textAlign: 'center' }}>
          <p className="sub">No meals yet. Snap or type your first plate.</p>
          <button className="btn" onClick={() => addFood()}><Icon name="plus" size={18} /> Add your first meal</button>
        </div>
      ) : <p className="sub">No meals match this filter.</p>)}
      <CookMealSheet mealId={logging} initialType={type === 'all' ? undefined : kind as MealKind} onClose={() => setLogging(null)} />
    </>
  )
}

function MealGrid({ list, snacks, onLog }: { list: MealCard[]; snacks: boolean; onLog: (id: number) => void }) {
  return (
    <div className="mealgrid">
      {list.map((m) => (
        <div key={m.id} className="mealcard-wrap">
          <Link to={`/meals/${m.id}`} className="mealcard">
            <div style={{ position: 'relative' }}>
              <Photo url={m.photo_url} emoji={m.emoji} seed={m.id} alt={m.name} />
              <span className="badge" style={{ position: 'absolute', top: 8, right: 8 }}>
                {m.taste !== null ? <><Icon name="star" size={12} fill /> {Math.round(m.taste * 10) / 10}</> : 'unrated'}
              </span>
              {!snacks && (
                <span className="badge" style={{ position: 'absolute', top: 8, left: 8 }}>
                  {m.types.map((t: MealKind) => MEAL_TYPE_SHORT[t]).join(' / ')}
                </span>
              )}
            </div>
            <div className="b">
              <h3>{m.name}</h3>
              {snacks ? <SnackLines m={m} /> : (
                <>
                  <div className="sub">
                    {m.origin === 'home'
                      ? `${m.prep_minutes} min · ${(m.cost / m.portions).toFixed(2)} €/portion`
                      : `${ORIGIN_LABEL[m.origin]}${m.place ? ` · ${m.place}` : ''}`}
                  </div>
                  <div className="sub">{m.origin === 'home' ? `Cooked ${m.cooked_count}×` : `Had it ${m.cooked_count}×`}</div>
                </>
              )}
            </div>
          </Link>
          <button className="icon mealcard-log" aria-label={`Log ${m.name}`} onClick={() => onLog(m.id)}>
            <Icon name="plus" size={18} />
          </button>
        </div>
      ))}
    </div>
  )
}

function SnackLines({ m }: { m: MealCard }) {
  return (
    <>
      <div className="sub">
        {m.snack_kind ? KIND_LABEL[m.snack_kind] : 'Snack'} · {Math.round(m.per_unit.kcal)} kcal / {perLabel(m.per)}
      </div>
      <div className="sub">{`Eaten ${m.cooked_count}×`}</div>
    </>
  )
}
