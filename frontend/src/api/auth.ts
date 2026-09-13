export type Role = 'student' | 'teacher'

export type User = {
  id: string
  login_id: string
  full_name: string
  role: Role
}

type UserResponse = { user: User }
type ErrorResponse = { error?: { code?: string; message?: string } }

export class ApiError extends Error {
  status: number
  code: string

  constructor(status: number, code = 'unknown_error') {
    super(code)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'

export function buildLoginID(username: string, role: Role): string {
  return `${username.trim().toLowerCase()}@${role}.com`
}

export async function login(loginID: string, password: string): Promise<User> {
  const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login_id: loginID, password }),
  })
  if (!response.ok) throw await apiError(response)
  return ((await response.json()) as UserResponse).user
}

export async function getCurrentUser(signal?: AbortSignal): Promise<User | null> {
  const response = await fetch(`${apiBaseUrl}/api/auth/me`, { credentials: 'include', signal })
  if (response.status === 401) return null
  if (!response.ok) throw await apiError(response)
  return ((await response.json()) as UserResponse).user
}

export async function logout(): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  })
  if (!response.ok) throw await apiError(response)
}

async function apiError(response: Response): Promise<ApiError> {
  try {
    const data = (await response.json()) as ErrorResponse
    return new ApiError(response.status, data.error?.code)
  } catch {
    return new ApiError(response.status)
  }
}
