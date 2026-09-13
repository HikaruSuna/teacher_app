import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, buildLoginID, getCurrentUser, login, logout } from './auth'

afterEach(() => vi.unstubAllGlobals())

describe('buildLoginID', () => {
  it('normalizes the username and adds the selected role domain', () => {
    expect(buildLoginID(' Tanaka.01 ', 'student')).toBe('tanaka.01@student.com')
    expect(buildLoginID('SUZUKI', 'teacher')).toBe('suzuki@teacher.com')
  })
})

describe('authentication API', () => {
  it('logs in with credentials enabled', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      user: { id: '1', login_id: 'taro@student.com', full_name: '太郎', role: 'student' },
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const user = await login('taro@student.com', 'password')

    expect(user.full_name).toBe('太郎')
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8080/api/auth/login', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({ login_id: 'taro@student.com', password: 'password' }),
    }))
  })

  it('treats a 401 current-user response as signed out', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })))
    await expect(getCurrentUser()).resolves.toBeNull()
  })

  it('preserves the API error code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { code: 'too_many_attempts' },
    }), { status: 429 })))
    try {
      await login('taro@student.com', 'wrong')
      expect.fail('login should reject')
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError)
      expect((error as ApiError).status).toBe(429)
      expect((error as ApiError).code).toBe('too_many_attempts')
    }
  })

  it('logs out with credentials enabled', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    await logout()
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8080/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    })
  })
})
