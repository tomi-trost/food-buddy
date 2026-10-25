import type {
  AnalysisJob, CatalogItem, CookIn, Day, Insights, LearnedFamily, LogEntry, Sources, LogPatch, Reward, SnackIn, HouseholdPatch, Ingredient, IngredientFromCode, Me, Meal, MealCard, MealCreate, MealKind, MealPatch, MealType, MePatch, Plan, PushConfig, PushKind, Suggestion, SnackLogged, PlanMode, Product, Rating, RegisterBody, Shopping, StockItem, WizardCell,
} from './types'
import { isOffline, reportReachable } from '../lib/online'
import { drop, enqueue, fromForm, pending, toForm } from '../lib/outbox'
import { shrinkPhoto } from '../lib/photoResize'

const TOKEN_KEY = 'fb.token'

// localStorage can throw (private mode, blocked storage); the app then just asks to log in again.
export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  },
  set(token: string | null) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token)
      else localStorage.removeItem(TOKEN_KEY)
    } catch {
      /* ignore */
    }
  },
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

/** Cloudflare Access wants its PIN again; the page is on its way to /api/reauth. */
export class SessionExpired extends Error {
  constructor() {
    super('Session expired, opening the sign-in page…')
  }
}

/** Back from /api/reauth and Access still redirects: its cookie doesn't stick on this device
 *  (blocked cookies, private tab, a stale Home Screen app). Going again would reload forever. */
export class AccessBlocked extends Error {
  constructor() {
    super(
      "Cloudflare's access check didn't stick on this device. Open food-buddy.web-corner.cc in Safari " +
        '(not a private tab, cookies allowed), enter the e-mail code, then log in here again.',
    )
  }
}

const REAUTH_MARK = 'reauth=1'

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  const token = tokenStore.get()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')

  let response: Response
  try {
    // The API never redirects; a redirect means Cloudflare Access sends us to its PIN page.
    response = await fetch(`/api${path}`, { ...init, headers, redirect: 'manual' })
  } catch {
    reportReachable(false)
    throw new ApiError(0, "Can't reach Food Buddy. Check your connection and try again.")
  }
  reportReachable(true)
  if (response.type === 'opaqueredirect') {
    const { pathname, search } = window.location
    if (new URLSearchParams(search).get('reauth') === '1') throw new AccessBlocked() // tried once already
    // A full navigation outside the service worker's scope, so Access can show its page; the
    // marker comes back with the page so a second redirect stops instead of looping.
    const here = pathname + (search ? `${search}&` : '?') + REAUTH_MARK
    window.location.assign(`/api/reauth?next=${encodeURIComponent(here)}`)
    throw new SessionExpired()
  }
  if (response.status === 401) tokenStore.set(null)
  if (!response.ok) {
    let message = response.statusText || 'Request failed'
    try {
      const body = await response.json()
      if (typeof body.detail === 'string') message = body.detail
      else if (Array.isArray(body.detail) && body.detail[0]?.msg) message = body.detail[0].msg
    } catch {
      /* not JSON */
    }
    throw new ApiError(response.status, message)
  }
  return response
}

const json = async <T>(path: string, init?: RequestInit) => (await request(path, init)).json() as Promise<T>

/** No connection: the change waits on this phone (lib/outbox) and is sent when we're back. */
export class Queued extends Error {
  constructor() {
    super("No connection: saved on this phone, it's sent when you're back online.")
  }
}
export const isQueued = (e: unknown): boolean => e instanceof Queued
/** An error worth showing: a change kept for later isn't one. */
export const shownError = (e: Error | null | undefined): Error | null => (e && !isQueued(e) ? e : null)

/** A change that can wait: sent now when we can, else kept for later. While older ones wait, it
 *  waits behind them, so they arrive in the order they were made. A request that failed before
 *  reaching the server is kept; one the server answered (even with an error) isn't. */
async function queueable(path: string, init: RequestInit, label: string): Promise<Response> {
  const keep = async (): Promise<never> => {
    const body = init.body instanceof FormData ? { form: await fromForm(init.body) } : init.body ? { json: String(init.body) } : {}
    await enqueue({ path, method: init.method ?? 'POST', label, ...body })
    if (!isOffline()) void flushOutbox() // back already: send it with the rest
    throw new Queued()
  }
  if (isOffline() || (await pending()).length) return keep()
  try {
    return await request(path, init)
  } catch (e) {
    if (e instanceof ApiError && e.status === 0) return keep()
    throw e
  }
}

const queuedJson = async <T>(path: string, init: RequestInit, label: string) =>
  (await queueable(path, init, label)).json() as Promise<T>

export type FlushResult = { sent: number; failed: { label: string; message: string }[]; stopped: boolean }

let flushing: Promise<FlushResult> | null = null

/** Send what waits, oldest first. Stops (and tries again later) when the connection, the login or
 *  the server is gone; a change the server turns down (gone, invalid) is dropped and reported. */
export function flushOutbox(): Promise<FlushResult> {
  flushing ??= (async () => {
    const result: FlushResult = { sent: 0, failed: [], stopped: false }
    for (const c of await pending()) {
      try {
        await request(c.path, { method: c.method, body: c.form ? toForm(c.form) : c.json })
        await drop(c.id!)
        result.sent += 1
      } catch (e) {
        if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 401) {
          await drop(c.id!)
          result.failed.push({ label: c.label, message: e.message })
          continue
        }
        result.stopped = true
        break
      }
    }
    return result
  })().finally(() => {
    flushing = null
  })
  return flushing
}

export const api = {
  async login(email: string, password: string) {
    const { access_token } = await json<{ access_token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    tokenStore.set(access_token)
  },
  async register(body: RegisterBody) {
    const { access_token } = await json<{ access_token: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    tokenStore.set(access_token)
  },
  logout: () => tokenStore.set(null),
  me: () => json<Me>('/auth/me'),
  updateMe: (patch: MePatch) => json<Me>('/auth/me', { method: 'PATCH', body: JSON.stringify(patch) }),
  updateHousehold: (patch: HouseholdPatch) =>
    json<Me>('/household', { method: 'PATCH', body: JSON.stringify(patch) }),
  async uploadPhoto(file: File, kind: 'meal' | 'label' = 'meal', meal?: { type: MealKind | null; saveOnly: boolean }) {
    const form = new FormData()
    form.append('photo', await shrinkPhoto(file))
    form.append('kind', kind)
    if (meal?.type) form.append('meal_type', meal.type)
    if (meal?.saveOnly) form.append('save_only', 'true')
    const what = kind === 'label' ? 'Nutrition label photo' : `Photo of ${meal?.type ?? 'a meal'}`
    return await queuedJson<AnalysisJob>('/analyses', { method: 'POST', body: form }, what)
  },
  /** Type a dish instead of snapping it; checked and posted like a photo. */
  describe: (text: string, meal?: { type: MealKind | null; saveOnly: boolean }) =>
    queuedJson<AnalysisJob>('/analyses/text', {
      method: 'POST',
      body: JSON.stringify({ kind: 'meal', text, meal_type: meal?.type ?? null, save_only: meal?.saveOnly ?? false }),
    }, `“${text}”`),
  analysis: (id: number | string) => json<AnalysisJob>(`/analyses/${id}`),
  openAnalyses: () => json<AnalysisJob[]>('/analyses/open'),
  pushConfig: () => json<PushConfig>('/push'),
  pushSubscribe: async (subscription: PushSubscriptionJSON) => {
    await request('/push/subscription', { method: 'PUT', body: JSON.stringify(subscription) })
  },
  pushUnsubscribe: async (endpoint: string) => {
    await request('/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint }) })
  },
  pushPrefs: (off: PushKind[]) => json<PushConfig>('/push/prefs', { method: 'PUT', body: JSON.stringify({ off }) }),
  pushTest: () => json<{ sent: number }>('/push/test', { method: 'POST' }),
  rateAnalysis: (id: number, rating: Rating) =>
    queuedJson<AnalysisJob>(`/analyses/${id}/rating`, { method: 'PUT', body: JSON.stringify(rating) }, 'Rating'),
  discardAnalysis: (id: number) => json<AnalysisJob>(`/analyses/${id}/discard`, { method: 'POST' }),
  reopenAnalysis: (id: number) => json<AnalysisJob>(`/analyses/${id}/reopen`, { method: 'POST' }),
  retryAnalysis: (id: number) => json<AnalysisJob>(`/analyses/${id}/retry`, { method: 'POST' }),
  /** Count an ingredient our way everywhere (g, pieces of unit_grams g, or ml at unit_grams g/ml). */
  setIngredientUnit: (id: number, unit: 'g' | 'pc' | 'ml', unit_grams = 1) =>
    json<Ingredient>(`/ingredients/${id}/unit`, { method: 'PUT', body: JSON.stringify({ unit, unit_grams }) }),
  searchIngredients: (q: string, limit = 30) =>
    json<Ingredient[]>(`/ingredients?${new URLSearchParams({ q, limit: String(limit) })}`),
  createMeal: (body: MealCreate) => json<Meal>('/meals', { method: 'POST', body: JSON.stringify(body) }),
  meal: (id: number | string) => json<Meal>(`/meals/${id}`),
  meals: () => json<MealCard[]>('/meals'),
  rateMeal: (id: number, rating: Rating, name = 'a meal') =>
    queuedJson<Meal>(`/meals/${id}/rating`, { method: 'PUT', body: JSON.stringify(rating) }, `Rating of ${name}`),
  inventory: (today: string) => json<StockItem[]>(`/inventory?today=${today}`),
  addStock: (ingredientId: number, today: string, grams?: number, name = 'an ingredient') =>
    queuedJson<StockItem>('/inventory', { method: 'POST', body: JSON.stringify({ ingredient_id: ingredientId, today, grams }) }, `Add ${name}`),
  changeStock: (ingredientId: number, delta: number, today: string, name = 'an ingredient') =>
    queuedJson<StockItem>(`/inventory/${ingredientId}?today=${today}`, { method: 'PATCH', body: JSON.stringify({ delta }) }, `Change ${name}`),
  removeStock: async (ingredientId: number, usedUp: boolean, name = 'an ingredient') => {
    await queueable(`/inventory/${ingredientId}?used_up=${usedUp}`, { method: 'DELETE' }, `Remove ${name}`)
  },
  cookable: () => json<MealCard[]>('/inventory/cookable'),
  patchMeal: (id: number, patch: MealPatch) =>
    json<Meal>(`/meals/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  families: () => json<LearnedFamily[]>('/families'),
  renameFamily: (name: string, to: string) =>
    json<{ name: string; meals: number }>('/families/rename', { method: 'PUT', body: JSON.stringify({ name, to }) }),
  setFamilyBlocks: (name: string, blocked_words: string[], blocked_ingredients: number[]) =>
    json<LearnedFamily>('/families/blocks', { method: 'PUT', body: JSON.stringify({ name, blocked_words, blocked_ingredients }) }),
  async setMealPhoto(id: number, file: File) {
    const form = new FormData()
    form.append('photo', await shrinkPhoto(file))
    return await json<Meal>(`/meals/${id}/photo`, { method: 'PUT', body: form })
  },
  async deleteMeal(id: number, keepLog: boolean) {
    await request(`/meals/${id}?keep_log=${keepLog}`, { method: 'DELETE' })
  },
  async declineAlias(mealId: number, name: string) {
    await request(`/meals/${mealId}/aliases/decline`, { method: 'POST', body: JSON.stringify({ name }) })
  },
  undoMeal: (id: number) => json<{ analysis_id: number | null }>(`/meals/${id}/undo`, { method: 'POST' }),
  unrateMeal: (id: number) => json<Meal>(`/meals/${id}/rating`, { method: 'DELETE' }),
  day: (date: string) => json<Day>(`/day?date=${date}`),
  editLog: (id: number, patch: LogPatch, name = 'an entry') =>
    queuedJson<LogEntry>(`/log/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }, `Change ${name}`),
  async removeLog(id: number, name = 'an entry') {
    await queueable(`/log/${id}`, { method: 'DELETE' }, `Remove ${name}`)
  },
  insights: (end: string, days = 7) => json<Insights>(`/insights?end=${end}&days=${days}`),
  insightSources: (end: string, days: number, userId: number) =>
    json<Sources>(`/insights/sources?end=${end}&days=${days}&user_id=${userId}`),
  snackCatalog: () => json<CatalogItem[]>('/snacks/catalog'),
  logSnack: (body: SnackIn) => queuedJson<SnackLogged>('/snacks', { method: 'POST', body: JSON.stringify(body) }, `Log ${body.name}`),
  product: (code: string) => json<Product>(`/barcode/${code}`),
  ingredientFromBarcode: (code: string, body: IngredientFromCode) =>
    json<Ingredient>(`/barcode/${code}/ingredient`, { method: 'POST', body: JSON.stringify(body) }),
  suggestions: (today: string) => json<Suggestion[]>(`/suggestions?today=${today}`),
  acceptSuggestion: (id: number, servings = 1) =>
    json<{ log_id: number }>(`/suggestions/${id}/accept`, { method: 'POST', body: JSON.stringify({ servings_eaten: servings }) }),
  async declineSuggestion(id: number) {
    await request(`/suggestions/${id}/decline`, { method: 'POST' })
  },
  rewards: (today: string) => json<Reward[]>(`/rewards?today=${today}`),
  useReward: (today: string) => json<Reward[]>('/rewards/use', { method: 'POST', body: JSON.stringify({ today }) }),
  plan: () => json<Plan | null>('/plan'),
  makePlan: (weekStart: string, wizard: WizardCell[][]) =>
    json<Plan>('/plan', { method: 'POST', body: JSON.stringify({ week_start: weekStart, wizard }) }),
  slotOptions: (day: number, type: MealType) => json<MealCard[]>(`/plan/slots/${day}/${type}/options`),
  putSlot: (day: number, type: MealType, body: { mode: PlanMode; minutes?: number | null; meal_id?: number | null }) =>
    json<Plan>(`/plan/slots/${day}/${type}`, { method: 'PUT', body: JSON.stringify(body) }),
  approvePlan: () => json<Plan>('/plan/approve', { method: 'POST' }),
  shopping: () => json<Shopping>('/shopping'),
  checkItem: (ingredientId: number, checked: boolean, name = 'an item') =>
    queuedJson<Shopping>(`/shopping/check/${ingredientId}`, { method: 'PUT', body: JSON.stringify({ checked }) }, `${checked ? 'Tick' : 'Untick'} ${name}`),
  finishShopping: (today: string) =>
    json<{ added: number }>('/shopping/finish', { method: 'POST', body: JSON.stringify({ today }) }),
  cookMeal: (id: number, body: CookIn, name = 'a meal') =>
    queuedJson<Meal>(`/meals/${id}/cook`, { method: 'POST', body: JSON.stringify(body) }, `Log ${name}`),
  /** Photos need the auth header, so they're fetched as blobs instead of plain <img src>. */
  async photoBlob(url: string) {
    return (await request(url.replace(/^\/api/, ''))).blob()
  },
}
