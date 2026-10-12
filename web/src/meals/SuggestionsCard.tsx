import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import type { Suggestion } from '../api/types'
import { todayISO } from '../lib/dates'
import { Avatar } from '../ui/Avatar'
import { Photo } from '../ui/Photo'
import { useToast } from '../ui/Toast'

const SUGGESTIONS = ['suggestions']

/** Home: meals the other one logged today or yesterday. "You too?" logs it for me. */
export function SuggestionsCard() {
  const today = todayISO()
  const qc = useQueryClient()
  const toast = useToast()
  const list = useQuery({ queryKey: [...SUGGESTIONS, today], queryFn: () => api.suggestions(today) })
  const done = () => qc.invalidateQueries({ queryKey: SUGGESTIONS })
  const accept = useMutation({
    mutationFn: (s: Suggestion) => api.acceptSuggestion(s.id),
    onSuccess: (_, s) => {
      done()
      qc.invalidateQueries({ queryKey: ['day'] })
      qc.invalidateQueries({ queryKey: ['insights'] })
      toast(`${s.meal.name} logged · tap it in Today to change portions`)
    },
  })
  const decline = useMutation({ mutationFn: (s: Suggestion) => api.declineSuggestion(s.id), onSuccess: done })
  const busy = accept.isPending || decline.isPending
  if (!list.data?.length) return null

  return (
    <section aria-label="You too?">
      {list.data.map((s) => (
        <div key={s.id} className="card suggestion">
          <div className="row" style={{ gap: 10 }}>
            <Photo url={s.meal.photo_url} emoji={s.meal.emoji} seed={s.meal.id} alt=""
              style={{ width: 48, height: 48, aspectRatio: '1', fontSize: 24, flex: 'none' }} />
            <div className="sp">
              <h3>{s.by.name} had {s.meal.name}</h3>
              <div className="sub">
                {s.eaten_on === today ? '' : 'Yesterday · '}{s.meal_type} · {Math.round(s.meal.kcal_per_portion)} kcal / portion. You too?
              </div>
            </div>
            <Avatar name={s.by.name} color={s.by.color} size={28} />
          </div>
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <button className="btn sm" disabled={busy} onClick={() => accept.mutate(s)}>Yes, log it</button>
            <button className="btn sm ghost" disabled={busy} onClick={() => decline.mutate(s)}>No</button>
          </div>
        </div>
      ))}
      {(accept.error ?? decline.error) && <p className="error" role="alert">{(accept.error ?? decline.error)!.message}</p>}
    </section>
  )
}
