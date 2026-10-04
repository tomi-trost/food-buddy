import type {
  AnalysisJob, CookIn, Day, Insights, HouseholdPatch, Ingredient, Me, Meal, MealCard, MealCreate, MealPatch, MealType, MePatch, Plan, PlanMode, Rating, RegisterBody, Shopping, StockItem, WizardCell,
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

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  const token = tokenStore.get()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')

  const response = await fetch(`/api${path}`, { ...init, headers })
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
  uploadPhoto(file: File) {
    const form = new FormData()
    form.append('photo', file)
    return json<AnalysisJob>('/analyses', { method: 'POST', body: form })
  },
  analysis: (id: number | string) => json<AnalysisJob>(`/analyses/${id}`),
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
  day: (date: string) => json<Day>(`/day?date=${date}`),
  insights: (end: string, days = 7) => json<Insights>(`/insights?end=${end}&days=${days}`),
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
