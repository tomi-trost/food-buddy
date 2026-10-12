import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { api, ApiError } from '../api/client'
import type { AnalysisJob, AnalysisResult, MealType, Nutrients, Rating } from '../api/types'
import { OPEN_ANALYSES } from '../layout/PendingBanner'
import { todayISO } from '../lib/dates'
import { DEFAULT_RATING, RatingFields } from '../meals/RatingFields'
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
  const toast = useToast()
  const job = useQuery({
    queryKey: ['analysis', id],
    queryFn: () => api.analysis(id),
    refetchInterval: (q) => {
      const status = q.state.data?.status
      return status === 'done' || status === 'failed' ? false : POLL_MS
    },
  })

  // Posted by the other person in the meantime (both of us see the photo)
  const postedMeal = job.data?.meal_id
  useEffect(() => {
    if (postedMeal) {
      navigate(`/meals/${postedMeal}`, { replace: true })
      toast('Already posted — here it is')
    }
  }, [postedMeal, navigate, toast])

  const close = (
    <button className="icon" aria-label="Close" onClick={() => navigate('/')}>
      <Icon name="close" />
    </button>
  )

  if (job.data?.closed && !postedMeal) {
    return (
      <>
        <div className="top">{close}<span /><span style={{ width: 44 }} /></div>
        <section className="card">
          <h3>This photo was discarded</h3>
          <Link to="/snap" className="btn" style={{ marginTop: 12 }}>Take another photo</Link>
        </section>
      </>
    )
  }

  if (job.data?.status === 'done' && job.data.result && !job.data.closed) {
    return (
      <SnapFlow analysisId={job.data.id} photoUrl={job.data.photo_url} result={job.data.result}
        rated={!!job.data.my_rating} chosenType={job.data.meal_type} saveOnly={job.data.save_only} close={close} />
    )
  }

  return (
    <>
      <div className="top">
        {close}
        <span className="sub">{job.data?.status === 'failed' ? '' : 'Analyzing…'}</span>
        <span style={{ width: 44 }} />
      </div>
      <Photo url={job.data?.photo_url} emoji="🍽️" alt="Your meal" style={{ aspectRatio: '16 / 9' }} />
      {job.isError && <p className="error" role="alert">{job.error.message}</p>}
      {job.data && <Waiting job={job.data} />}
    </>
  )
}

/** While the model works (a few minutes on the VM): rate right away, or leave and come back. */
function Waiting({ job }: { job: AnalysisJob }) {
  const navigate = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const [draft, setDraft] = useState<Rating>(job.my_rating ?? DEFAULT_RATING)
  const update = (updated: AnalysisJob) => {
    qc.setQueryData(['analysis', String(job.id)], updated)
    qc.invalidateQueries({ queryKey: OPEN_ANALYSES })
  }
  const rate = useMutation({
    mutationFn: () => api.rateAnalysis(job.id, draft),
    onSuccess: (updated) => {
      update(updated)
      toast('Rating saved — it goes with the meal when you post it')
    },
  })
  const retry = useMutation({ mutationFn: () => api.retryAnalysis(job.id), onSuccess: update })
  const discard = useMutation({
    mutationFn: () => api.discardAnalysis(job.id),
    onSuccess: (updated) => {
      update(updated)
      navigate('/', { replace: true })
      toast('Photo discarded')
    },
  })
  const failed = job.status === 'failed'
  const error = [rate, retry, discard].find((m) => m.isError)?.error

  return (
    <>
      {failed ? (
        <section className="card" style={{ marginTop: 12 }}>
          <h3>Couldn't analyze this photo</h3>
          <p className="sub">{job.error}</p>
          <button className="btn" disabled={retry.isPending} onClick={() => retry.mutate()}>Try again</button>
          <Link to="/snap" className="btn ghost" style={{ marginTop: 8 }}>Try another photo</Link>
        </section>
      ) : (
        <div role="status" aria-label="Analyzing your meal" className="card" style={{ marginTop: 12 }}>
          <h3 className="pulse">Analyzing your meal…</h3>
          <p className="sub" style={{ margin: '4px 0 0' }}>
            This takes a few minutes. You can leave: it keeps going and shows up above the tabs when it's ready.
          </p>
        </div>
      )}
      {error && <p className="error" role="alert">{error.message}</p>}

      {!failed && (
        <>
          <section className="card" style={{ marginTop: 12 }} aria-label="Rate it while you wait">
            <h3>{job.my_rating ? 'Your rating' : 'Rate it while you wait'}</h3>
            <RatingFields draft={draft} set={(patch) => setDraft((d) => ({ ...d, ...patch }))} />
            <button className="btn" style={{ marginTop: 16 }} disabled={rate.isPending} onClick={() => rate.mutate()}>
              {job.my_rating ? 'Update rating' : 'Save rating'}
            </button>
          </section>
          <button className="btn ghost" style={{ marginTop: 12 }} onClick={() => navigate('/')}>Check it later</button>
        </>
      )}
      <button className="textbtn" style={{ marginTop: 12 }} disabled={discard.isPending} onClick={() => discard.mutate()}>
        Discard this photo
      </button>
    </>
  )
}

function SnapFlow({ analysisId, photoUrl, result, rated, chosenType, saveOnly, close }: {
  analysisId: number
  photoUrl: string | null
  result: AnalysisResult
  rated: boolean // rated while waiting: the rating is already on the meal
  chosenType: MealType | null // picked on the Snap screen
  saveOnly: boolean // "For later" on the Snap screen
  close: React.ReactNode
}) {
  const navigate = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const [params] = useSearchParams()
  const [step, setStep] = useState<'verdict' | 'details'>('verdict')
  const [items, setItemsState] = useState<PlateItem[]>(() => fromAnalysis(result))
  const [servings, setServings] = useState(1)
  const [override, setOverride] = useState<Nutrients | null>(null)
  const typeParam = params.get('type') as MealType | null
  const [details, setDetails] = useState<DetailsState>(() => ({
    name: result.dish.charAt(0).toUpperCase() + result.dish.slice(1),
    mealType: chosenType
      ?? (typeParam && TYPES.includes(typeParam) ? typeParam : (result.meal_type === 'snack' ? 'lunch' : result.meal_type)),
    eaten: !saveOnly,
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
          items, name: details.name, mealType: details.mealType, eaten: details.eaten, eatenOn: todayISO(),
          prepMinutes: details.prepMinutes, portions: details.portions, servingsEaten: servings,
          cost: costTouched ? details.cost : null, usedUp: details.usedUp, analysisId, perPortion: override,
        }),
      ),
    onSuccess: (meal) => {
      qc.invalidateQueries({ queryKey: ['meals'] })
      qc.invalidateQueries({ queryKey: ['day'] })
      qc.invalidateQueries({ queryKey: ['inventory'] })
      qc.invalidateQueries({ queryKey: OPEN_ANALYSES })
      if (!details.eaten) {
        navigate(`/meals/${meal.id}`, { replace: true })
        toast('Saved to your meals for later')
        return
      }
      navigate(`/meals/${meal.id}${rated ? '' : '?rate=1'}`, { replace: true })
      toast('Posted. Ingredients and shopping list updated.')
    },
    onError: (error) => {
      // The other person posted this photo first: the page follows job.meal_id to their meal
      if (error instanceof ApiError && error.status === 409) {
        qc.invalidateQueries({ queryKey: ['analysis', String(analysisId)] })
        qc.invalidateQueries({ queryKey: OPEN_ANALYSES })
      }
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
            override={override}
            setOverride={setOverride}
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
