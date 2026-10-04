import { useQuery } from '@tanstack/react-query'
import { type CSSProperties, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { api } from '../api/client'
import type { AnalysisResult } from '../api/types'
import { scale, sum } from '../lib/macros'

const POLL_MS = 2000

const TILES = [
  { key: 'kcal', label: 'kcal', color: 'var(--k)', unit: '' },
  { key: 'protein', label: 'protein', color: 'var(--p)', unit: ' g' },
  { key: 'carbs', label: 'carbs', color: 'var(--c)', unit: ' g' },
  { key: 'fat', label: 'fat', color: 'var(--f)', unit: ' g' },
  { key: 'fiber', label: 'fiber', color: 'var(--fi)', unit: ' g' },
  { key: 'sugar', label: 'sugar', color: 'var(--sg)', unit: ' g' },
] as const

function usePhoto(url: string | undefined) {
  const [src, setSrc] = useState<string>()
  useEffect(() => {
    if (!url) return
    let objectUrl: string | undefined
    let cancelled = false
    api
      .photoBlob(url)
      .then((blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setSrc(objectUrl)
      })
      .catch(() => {})
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [url])
  return src
}

export function AnalysisPage() {
  const { id = '' } = useParams()
  const job = useQuery({
    queryKey: ['analysis', id],
    queryFn: () => api.analysis(id),
    refetchInterval: (q) => {
      const status = q.state.data?.status
      return status === 'done' || status === 'failed' ? false : POLL_MS
    },
  })
  const photo = usePhoto(job.data?.photo_url)

  return (
    <>
      <Link to="/" className="sub">← Home</Link>
      {photo ? <img className="photo" src={photo} alt="Your meal" /> : <div className="photo" />}
      {job.isError && <p className="error" role="alert">{job.error.message}</p>}
      {(job.isPending || job.data?.status === 'queued' || job.data?.status === 'running') && (
        <p className="pulse" role="status">Analyzing your meal… this can take a minute.</p>
      )}
      {job.data?.status === 'failed' && (
        <section className="card">
          <h2>Couldn't analyze this photo</h2>
          <p className="sub">{job.data.error}</p>
          <Link to="/snap" className="btn">Try another photo</Link>
        </section>
      )}
      {job.data?.status === 'done' && job.data.result && <Verdict result={job.data.result} />}
    </>
  )
}

function Verdict({ result }: { result: AnalysisResult }) {
  const [grams, setGrams] = useState(() => result.items.map((i) => i.grams))
  const totals = useMemo(
    () =>
      sum(
        result.items.flatMap((item, i) =>
          item.ingredient ? [scale(item.ingredient.per100, grams[i])] : [],
        ),
      ),
    [result.items, grams],
  )

  return (
    <>
      <div>
        <h1>{result.dish}</h1>
        <p className="sub">
          {result.meal_type} · {result.servings} serving{result.servings > 1 ? 's' : ''}
        </p>
      </div>
      <section className="macros" aria-label="Totals">
        {TILES.map((t) => (
          <div key={t.key} className="macro" style={{ '--mc': t.color } as CSSProperties}>
            <b data-testid={`total-${t.key}`}>
              {Math.round(totals[t.key])}
              {t.unit}
            </b>
            <small>{t.label}</small>
          </div>
        ))}
      </section>
      <section className="card">
        <h2 style={{ marginBottom: 10 }}>Ingredients</h2>
        <ul className="items">
          {result.items.map((item, i) => (
            <li key={i} className="item">
              <div className="name">
                {item.ingredient?.name ?? item.name}
                {item.ingredient ? (
                  <small>{Math.round(scale(item.ingredient.per100, grams[i]).kcal)} kcal</small>
                ) : (
                  <small className="warn">“{item.name}” isn't in the food database yet</small>
                )}
              </div>
              <label>
                <span className="visually-hidden">Grams of {item.ingredient?.name ?? item.name}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={grams[i]}
                  onChange={(e) => {
                    const value = Number(e.target.value)
                    setGrams((g) => g.map((v, j) => (j === i ? (Number.isFinite(value) ? value : 0) : v)))
                  }}
                />
              </label>
              <span className="sub">g</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
