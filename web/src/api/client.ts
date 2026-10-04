import type { AnalysisJob, HouseholdPatch, Me, MePatch, RegisterBody } from './types'

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
  /** Photos need the auth header, so they're fetched as blobs instead of plain <img src>. */
  async photoBlob(url: string) {
    return (await request(url.replace(/^\/api/, ''))).blob()
  },
}
