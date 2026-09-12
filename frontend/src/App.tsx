import { useEffect, useState } from 'react'
import { getHealth, type HealthStatus } from './api/health'

type ConnectionState =
  | { kind: 'loading' }
  | { kind: 'connected'; data: HealthStatus }
  | { kind: 'error' }

function App() {
  const [connection, setConnection] = useState<ConnectionState>({ kind: 'loading' })

  useEffect(() => {
    const controller = new AbortController()

    getHealth(controller.signal)
      .then((data) => setConnection({ kind: 'connected', data }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setConnection({ kind: 'error' })
      })

    return () => controller.abort()
  }, [])

  return (
    <main className="app-shell">
      <section className="status-panel" aria-labelledby="page-title">
        <div className="brand-mark" aria-hidden="true">T</div>
        <p className="eyebrow">家庭教師向け課題管理</p>
        <h1 id="page-title">Tutor</h1>

        <div className={`connection connection--${connection.kind}`} role="status" aria-live="polite">
          <span className="connection__dot" aria-hidden="true" />
          <div>
            <strong>
              {connection.kind === 'loading' && '接続を確認しています'}
              {connection.kind === 'connected' && '接続できています'}
              {connection.kind === 'error' && 'APIに接続できません'}
            </strong>
            <p>
              {connection.kind === 'loading' && 'Go APIとPostgreSQLの状態を確認中です。'}
              {connection.kind === 'connected' && '開発基盤は正常に動作しています。'}
              {connection.kind === 'error' && 'Go APIとPostgreSQLを起動して、画面を再読み込みしてください。'}
            </p>
          </div>
        </div>

        {connection.kind === 'connected' && (
          <dl className="service-list">
            <div>
              <dt>Go API</dt>
              <dd>{connection.data.status === 'ok' ? '正常' : '停止'}</dd>
            </div>
            <div>
              <dt>PostgreSQL</dt>
              <dd>{connection.data.database === 'connected' ? '接続済み' : '未接続'}</dd>
            </div>
          </dl>
        )}
      </section>
    </main>
  )
}

export default App
