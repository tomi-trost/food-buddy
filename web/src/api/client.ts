import type {
  AnalysisJob, CatalogItem, CookIn, Day, Insights, LogEntry, LogPatch, Reward, SnackIn, HouseholdPatch, Ingredient, Me, Meal, MealCard, MealCreate, MealPatch, MealType, MePatch, Plan, PushConfig, PushKind, SavedSnack, Suggestion, SavedSnackPatch, SnackLogged, PlanMode, Rating, RegisterBody, Shopping, StockItem, WizardCell,
} from './types'

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
    throw new ApiError(0, "Can't reach Food Buddy. Check your connection and try again.")
  }
  if (response.type === 'opaqueredirect') {
    // A full navigation outside the service worker's scope, so Access can show its page.
    const here = window.location.pathname + window.location.search
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
  uploadPhoto(file: File, kind: 'meal' | 'snack' | 'label' = 'meal', meal?: { type: MealType | null; saveOnly: boolean }) {
    const form = new FormData()
    form.append('photo', file)
    form.append('kind', kind)
    if (meal?.type) form.append('meal_type', meal.type)
    if (meal?.saveOnly) form.append('save_only', 'true')
    return json<AnalysisJob>('/analyses', { method: 'POST', body: form })
  },
  /** Type a dish instead of snapping it; checked and posted like a photo. */
  describe: (kind: 'meal' | 'snack', text: string, meal?: { type: MealType | null; saveOnly: boolean }) =>
    json<AnalysisJob>('/analyses/text', {
      method: 'POST',
      body: JSON.stringify({ kind, text, meal_type: meal?.type ?? null, save_only: meal?.saveOnly ?? false }),
    }),
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
    json<AnalysisJob>(`/analyses/${id}/rating`, { method: 'PUT', body: JSON.stringify(rating) }),
  discardAnalysis: (id: number) => json<AnalysisJob>(`/analyses/${id}/discard`, { method: 'POST' }),
  retryAnalysis: (id: number) => json<AnalysisJob>(`/analyses/${id}/retry`, { method: 'POST' }),
  searchIngredients: (q: string, limit = 30) =>
    json<Ingredient[]>(`/ingredients?${new URLSearchParams({ q, limit: String(limit) })}`),
  createMeal: (body: MealCreate) => json<Meal>('/meals', { method: 'POST', body: JSON.stringify(body) }),
  meal: (id: number | string) => json<Meal>(`/meals/${id}`),
  meals: () => json<MealCard[]>('/meals'),
  rateMeal: (id: number, rating: Rating) =>
    json<Meal>(`/meals/${id}/rating`, { method: 'PUT', body: JSON.stringify(rating) }),
  inventory: (today: string) => json<StockItem[]>(`/inventory?today=${today}`),
  addStock: (ingredientId: number, today: string, grams?: number) =>
    json<StockItem>('/inventory', { method: 'POST', body: JSON.stringify({ ingredient_id: ingredientId, today, grams }) }),
  changeStock: (ingredientId: number, delta: number, today: string) =>
    json<StockItem>(`/inventory/${ingredientId}?today=${today}`, { method: 'PATCH', body: JSON.stringify({ delta }) }),
  removeStock: async (ingredientId: number, usedUp: boolean) => {
    await request(`/inventory/${ingredientId}?used_up=${usedUp}`, { method: 'DELETE' })
  },
  cookable: () => json<MealCard[]>('/inventory/cookable'),
  patchMeal: (id: number, patch: MealPatch) =>
    json<Meal>(`/meals/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  async deleteMeal(id: number, keepLog: boolean) {
    await request(`/meals/${id}?keep_log=${keepLog}`, { method: 'DELETE' })
  },
  unrateMeal: (id: number) => json<Meal>(`/meals/${id}/rating`, { method: 'DELETE' }),
  day: (date: string) => json<Day>(`/day?date=${date}`),
  editLog: (id: number, patch: LogPatch) => json<LogEntry>(`/log/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  async removeLog(id: number) {
    await request(`/log/${id}`, { method: 'DELETE' })
  },
  insights: (end: string, days = 7) => json<Insights>(`/insights?end=${end}&days=${days}`),
  snackCatalog: () => json<CatalogItem[]>('/snacks/catalog'),
  logSnack: (body: SnackIn) => json<SnackLogged>('/snacks', { method: 'POST', body: JSON.stringify(body) }),
  savedSnacks: () => json<SavedSnack[]>('/snacks/saved'),
  suggestions: (today: string) => json<Suggestion[]>(`/suggestions?today=${today}`),
  acceptSuggestion: (id: number, servings = 1) =>
    json<{ log_id: number }>(`/suggestions/${id}/accept`, { method: 'POST', body: JSON.stringify({ servings_eaten: servings }) }),
  async declineSuggestion(id: number) {
    await request(`/suggestions/${id}/decline`, { method: 'POST' })
  },
  updateSavedSnack: (id: number, patch: SavedSnackPatch) =>
    json<SavedSnack>(`/snacks/saved/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  async deleteSavedSnack(id: number) {
    await request(`/snacks/saved/${id}`, { method: 'DELETE' })
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
  checkItem: (ingredientId: number, checked: boolean) =>
    json<Shopping>(`/shopping/check/${ingredientId}`, { method: 'PUT', body: JSON.stringify({ checked }) }),
  finishShopping: (today: string) =>
    json<{ added: number }>('/shopping/finish', { method: 'POST', body: JSON.stringify({ today }) }),
  cookMeal: (id: number, body: CookIn) =>
    json<Meal>(`/meals/${id}/cook`, { method: 'POST', body: JSON.stringify(body) }),
  /** Photos need the auth header, so they're fetched as blobs instead of plain <img src>. */
  async photoBlob(url: string) {
    return (await request(url.replace(/^\/api/, ''))).blob()
  },
}
