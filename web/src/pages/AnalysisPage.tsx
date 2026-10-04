import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { api } from '../api/client'
import type { AnalysisResult, MealType } from '../api/types'
import { todayISO } from '../lib/dates'
import { Details, type DetailsState } from '../snap/Details'
import { fromAnalysis, type PlateItem, recipeCost, toMealCreate } from '../snap/plate'
import { Verdict } from '../snap/Verdict'
import { Icon } from '../ui/Icon'
import { Photo } from '../ui/Photo'
import { useToast } from '../ui/Toast'

const POLL_MS = 2000
const TYPES: MealType[] = ['breakfast', 'lunch', 'dinner']

export function AnalysisPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const job = useQuery({
    queryKey: ['analysis', id],
    queryFn: () => api.analysis(id),
    refetchInterval: (q) => {
      const status = q.state.data?.status
      return status === 'done' || status === 'failed' ? false : POLL_MS
    },
  })

  const close = (
    <button className="icon" aria-label="Close" onClick={() => navigate('/')}>
      <Icon name="close" />
    </button>
  )

  if (job.data?.status === 'done' && job.data.result) {
    return <SnapFlow analysisId={job.data.id} photoUrl={job.data.photo_url} result={job.data.result} close={close} />
  }

  return (
    <>
      <div className="top">
        {close}
        <span className="sub">{job.data?.status === 'failed' ? '' : 'Analyzing…'}</span>
        <span style={{ width: 44 }} />
      </div>
      <Photo url={job.data?.photo_url} emoji="🍽️" alt="Your meal" />
      {job.isError && <p className="error" role="alert">{job.error.message}</p>}
      {job.data?.status === 'failed' ? (
        <section className="card" style={{ marginTop: 12 }}>
          <h3>Couldn't analyze this photo</h3>
          <p className="sub">{job.data.error}</p>
          <Link to="/snap" className="btn">Try another photo</Link>
        </section>
      ) : (
        <div role="status" aria-label="Analyzing your meal">
          <div className="shimmer" style={{ width: '60%', height: 26 }} />
          <div className="shimmer" />
          <div className="shimmer" style={{ width: '80%' }} />
          <div className="shimmer" />
          <p className="sub">Analyzing your meal… this can take a minute.</p>
        </div>
      )}
    </>
  )
}

function SnapFlow({ analysisId, photoUrl, result, close }: {
  analysisId: number
  photoUrl: string
  result: AnalysisResult
  close: React.ReactNode
}) {
  const navigate = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const [params] = useSearchParams()
  const [step, setStep] = useState<'verdict' | 'details'>('verdict')
  const [items, setItemsState] = useState<PlateItem[]>(() => fromAnalysis(result))
  const [servings, setServings] = useState(1)
  const typeParam = params.get('type') as MealType | null
  const [details, setDetails] = useState<DetailsState>(() => ({
    name: result.dish.charAt(0).toUpperCase() + result.dish.slice(1),
    mealType: typeParam && TYPES.includes(typeParam) ? typeParam : (result.meal_type === 'snack' ? 'lunch' : result.meal_type),
    prepMinutes: 30,
    portions: 2,
    cost: 0,
    usedUp: [],
  }))
  const [costTouched, setCostTouched] = useState(false)

  // Cost follows the estimate until the user changes it.
  useEffect(() => {
    if (!costTouched) setDetails((d) => ({ ...d, cost: Math.max(0, Math.round(recipeCost(items, d.portions))) }))
  }, [items, details.portions, costTouched])

  const post = useMutation({
    mutationFn: () =>
      api.createMeal(
        toMealCreate({
          items, name: details.name, mealType: details.mealType, eatenOn: todayISO(),
          prepMinutes: details.prepMinutes, portions: details.portions, servingsEaten: servings,
          cost: costTouched ? details.cost : null, usedUp: details.usedUp, analysisId,
        }),
      ),
    onSuccess: (meal) => {
      qc.invalidateQueries({ queryKey: ['meals'] })
      qc.invalidateQueries({ queryKey: ['day'] })
      qc.invalidateQueries({ queryKey: ['inventory'] })
      navigate(`/meals/${meal.id}?rate=1`, { replace: true })
      toast('Posted. Ingredients and shopping list updated.')
    },
  })

  return (
    <>
      <div className="top">
        {step === 'verdict' ? close : (
          <button className="icon" aria-label="Back" onClick={() => setStep('verdict')}><Icon name="back" /></button>
        )}
        <span className="sub">Step {step === 'verdict' ? 1 : 2} of 2</span>
        <span style={{ width: 44 }} />
      </div>
      {step === 'verdict' ? (
        <>
          <Photo url={photoUrl} emoji="🍽️" alt="Your meal" style={{ aspectRatio: '16 / 9' }} />
          <Verdict
            dish={details.name}
            items={items}
            setItems={(f) => setItemsState(f)}
            servings={servings}
            setServings={setServings}
            onNext={() => setStep('details')}
          />
        </>
      ) : (
        <Details
          items={items}
          state={details}
          set={(patch) => {
            if ('cost' in patch) setCostTouched(true)
            setDetails((d) => ({ ...d, ...patch }))
          }}
          onPost={() => post.mutate()}
          posting={post.isPending}
          error={post.isError ? post.error.message : undefined}
        />
      )}
    </>
  )
}
