import { type FormEvent, useEffect, useState } from 'react'
import { ApiError, buildLoginID, getCurrentUser, login, logout, type Role, type User } from './api/auth'

type AuthState =
  | { kind: 'loading' }
  | { kind: 'guest' }
  | { kind: 'authenticated'; user: User }
  | { kind: 'unavailable' }

const usernamePattern = /^[a-z0-9]([a-z0-9._-]{0,30}[a-z0-9])?$/

function App() {
  const [authState, setAuthState] = useState<AuthState>({ kind: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    getCurrentUser(controller.signal)
      .then((user) => setAuthState(user ? { kind: 'authenticated', user } : { kind: 'guest' }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setAuthState({ kind: 'unavailable' })
      })
    return () => controller.abort()
  }, [])

  if (authState.kind === 'loading') return <LoadingScreen />
  if (authState.kind === 'unavailable') return <UnavailableScreen onRetry={() => window.location.reload()} />
  if (authState.kind === 'authenticated') {
    return <HomeScreen user={authState.user} onSignedOut={() => setAuthState({ kind: 'guest' })} />
  }
  return <LoginScreen onSignedIn={(user) => setAuthState({ kind: 'authenticated', user })} />
}

function LoginScreen({ onSignedIn }: { onSignedIn: (user: User) => void }) {
  const [role, setRole] = useState<Role>('student')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalizedUsername = username.trim().toLowerCase()
    if (!usernamePattern.test(normalizedUsername)) {
      setError('IDは半角英数字と「.」「_」「-」で入力してください。')
      return
    }
    if (!password) {
      setError('パスワードを入力してください。')
      return
    }

    setSubmitting(true)
    setError('')
    try {
      onSignedIn(await login(buildLoginID(normalizedUsername, role), password))
    } catch (loginError) {
      if (loginError instanceof ApiError && loginError.status === 401) {
        setError('IDまたはパスワードが正しくありません。')
      } else if (loginError instanceof ApiError && loginError.status === 429) {
        setError('ログインに複数回失敗しました。しばらく待ってからお試しください。')
      } else {
        setError('ログインできませんでした。APIが起動しているか確認してください。')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const changeRole = (nextRole: Role) => {
    setRole(nextRole)
    setError('')
  }

  return (
    <main className="login-layout">
      <section className="intro-panel" aria-labelledby="app-name">
        <Brand />
        <div>
          <p className="eyebrow">家庭教師向け課題管理</p>
          <h1 id="app-name">学びのやりとりを、<br />ひとつの場所に。</h1>
          <p className="intro-copy">課題の提出から先生のフィードバックまで、迷わず確認できます。</p>
        </div>
        <p className="intro-note">Tutor</p>
      </section>

      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-card">
          <p className="eyebrow">WELCOME BACK</p>
          <h2 id="login-title">ログイン</h2>

          <fieldset className="role-picker">
            <legend>利用者を選択</legend>
            {(['student', 'teacher'] as const).map((item) => (
              <label key={item} className={role === item ? 'role-option role-option--active' : 'role-option'}>
                <input type="radio" name="role" value={item} checked={role === item} onChange={() => changeRole(item)} />
                <span>{item === 'student' ? '生徒' : '先生'}</span>
              </label>
            ))}
          </fieldset>

          <form onSubmit={handleSubmit} noValidate>
            <label className="field-label" htmlFor="username">ログインID</label>
            <div className="login-id-field">
              <input
                id="username"
                name="username"
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder={role === 'student' ? 'student01' : 'teacher01'}
                aria-describedby="login-domain"
                disabled={submitting}
              />
              <span id="login-domain">@{role}.com</span>
            </div>

            <label className="field-label" htmlFor="password">パスワード</label>
            <input
              className="text-field"
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="パスワードを入力"
              disabled={submitting}
            />

            <div className="form-message" role="alert" aria-live="polite">{error}</div>
            <button className="primary-button" type="submit" disabled={submitting}>
              {submitting ? 'ログインしています…' : 'ログイン'}
            </button>
          </form>
        </div>
      </section>
    </main>
  )
}

function HomeScreen({ user, onSignedOut }: { user: User; onSignedOut: () => void }) {
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const isTeacher = user.role === 'teacher'

  const handleLogout = async () => {
    setSubmitting(true)
    setError('')
    try {
      await logout()
      onSignedOut()
    } catch {
      setError('ログアウトできませんでした。もう一度お試しください。')
      setSubmitting(false)
    }
  }

  return (
    <main className="home-shell">
      <header className="home-header">
        <Brand compact />
        <button className="logout-button" type="button" onClick={handleLogout} disabled={submitting}>
          {submitting ? '処理中…' : 'ログアウト'}
        </button>
      </header>

      <section className="home-content" aria-labelledby="home-title">
        <div className="user-heading">
          <span className={`role-badge role-badge--${user.role}`}>{isTeacher ? '先生' : '生徒'}</span>
          <p>{user.login_id}</p>
        </div>
        <h1 id="home-title">{user.full_name}さん、こんにちは</h1>
        <p className="home-lead">{isTeacher ? '先生用ホーム' : '生徒用ホーム'}</p>

        <div className="empty-state">
          <span aria-hidden="true">{isTeacher ? '添' : '学'}</span>
          <div>
            <h2>{isTeacher ? '提出された課題' : 'あなたの課題'}</h2>
            <p>{isTeacher ? '担当生徒からの提出はこちらに表示されます。' : '提出した課題と先生からの結果はこちらに表示されます。'}</p>
          </div>
        </div>
        <div className="form-message" role="alert" aria-live="polite">{error}</div>
      </section>
    </main>
  )
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? 'brand brand--compact' : 'brand'} aria-label="Tutor">
      <span aria-hidden="true">T</span>
      <strong>Tutor</strong>
    </div>
  )
}

function LoadingScreen() {
  return <main className="centered-screen"><div className="loading-dot" /><p>ログイン状態を確認しています</p></main>
}

function UnavailableScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="centered-screen">
      <Brand compact />
      <h1>接続できませんでした</h1>
      <p>Go APIとPostgreSQLを起動して、もう一度お試しください。</p>
      <button className="primary-button retry-button" type="button" onClick={onRetry}>再読み込み</button>
    </main>
  )
}

export default App
