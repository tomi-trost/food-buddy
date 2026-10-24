import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import type { LearnedFamily } from '../api/types'

/** What a family we made learned from its meals; tap a keyword to stop (or start) matching on it. */
export function FamilyLearned({ family }: { family: LearnedFamily }) {
  const qc = useQueryClient()
  const save = useMutation({
    mutationFn: (next: { words: string[]; ingredients: number[] }) => api.setFamilyBlocks(family.name, next.words, next.ingredients),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['families'] })
      qc.invalidateQueries({ queryKey: ['meals'] })
    },
  })
  const words = family.blocked_words
  const ingredients = family.blocked_ingredients.map((i) => i.id)
  const toggleWord = (w: string) => save.mutate({ words: words.includes(w) ? words.filter((x) => x !== w) : [...words, w], ingredients })
  const toggleIng = (id: number) => save.mutate({ words, ingredients: ingredients.includes(id) ? ingredients.filter((x) => x !== id) : [...ingredients, id] })
  const learned = family.words.length + family.ingredients.length + words.length + ingredients.length > 0

  if (family.members < 2) {
    return <p className="sub family-learned">Put one more meal in “{family.name}” and new meals like them land here by themselves.</p>
  }
  return (
    <div className="family-learned" aria-label={`What ${family.name} matches`}>
      <div className="sub">
        {learned ? `Learned from your ${family.members} picks. New meals with these land here; tap one to stop using it.` : `Your ${family.members} picks share no words or main ingredients yet.`}
      </div>
      <div className="chips" style={{ marginTop: 6 }}>
        {family.words.map((w) => <button key={w} className="chip" disabled={save.isPending} onClick={() => toggleWord(w)} aria-label={`Stop matching ${w}`}>“{w}” ✕</button>)}
        {family.ingredients.map((i) => <button key={i.id} className="chip" disabled={save.isPending} onClick={() => toggleIng(i.id)} aria-label={`Stop matching ${i.name}`}>{i.name} ✕</button>)}
        {family.blocked_words.map((w) => <button key={w} className="chip off" disabled={save.isPending} onClick={() => toggleWord(w)} aria-label={`Match ${w} again`}>“{w}”</button>)}
        {family.blocked_ingredients.map((i) => <button key={i.id} className="chip off" disabled={save.isPending} onClick={() => toggleIng(i.id)} aria-label={`Match ${i.name} again`}>{i.name}</button>)}
      </div>
      {save.isError && <p className="error" role="alert">{save.error.message}</p>}
    </div>
  )
}
