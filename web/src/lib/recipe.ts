// Mirrors api/app/meals/recipes.py → template_steps (same wording; half-up rounding).

export function templateSteps(names: string[], prepMinutes: number, portions: number): string[] {
  const low = names.map((n) => n.toLowerCase())
  if (!low.length) return [`Serve in ${portions} portions.`]
  const steps = [
    `Prep: wash and chop ${low.slice(0, 3).join(', ')}.`,
    `Heat a pan with oil; cook ${low[0]} until golden (~${Math.round(prepMinutes * 0.3)} min).`,
  ]
  if (low.length > 1) steps.push(`Add ${low.slice(1, 4).join(', ')} and simmer/stir for ${Math.round(prepMinutes * 0.4)} min.`)
  steps.push(`Season, taste, adjust and serve in ${portions} portions.`)
  return steps
}
