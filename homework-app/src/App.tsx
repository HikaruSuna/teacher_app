import React, { useState, useEffect, useRef } from 'react';

declare var process: {
  env: {
    NEXT_PUBLIC_API_URL?: string;
    [key: string]: string | undefined;
  };
};
type Task = {
  id: string;
  title: string;
  dueDate: string;
  status: 'pending' | 'submitted';
};

// 実行時に process がない環境での ReferenceError を防ぐ
const API_BASE_URL = (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL) 
  ? process.env.NEXT_PUBLIC_API_URL 
  : 'http://localhost:8000/api';


export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  // 初回レンダリング時にlocalStorageからトークンを復元
  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    if (savedToken) setToken(savedToken);
    setIsReady(true);
  }, []);

  const handleLogin = (newToken: string) => {
    localStorage.setItem('token', newToken);
    setToken(newToken);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
  };

  if (!isReady) return null; // Hydrationエラー防止用

  return (
    <div style={{ maxWidth: '400px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <header style={{ padding: '15px 0', borderBottom: '1px solid #ccc', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '20px', margin: 0 }}>宿題管理アプリ</h1>
      </header>
      {!token ? (
        <Login onLogin={handleLogin} />
      ) : (
        <Dashboard token={token} onLogout={handleLogout} />
      )}
    </div>
  );
}

// --- ログインコンポーネント ---
function Login({ onLogin }: { onLogin: (token: string) => void }) {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleRequestOtp = async () => {
    if (!email) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch(`${API_BASE_URL}/auth/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error('送信に失敗しました');
      setStep(2);
    } catch (err) {
      setErrorMsg('OTPの送信に失敗しました。メールアドレスを確認してください。');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch(`${API_BASE_URL}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      });
      if (!res.ok) throw new Error('認証失敗');
      
      const data = await res.json();
      onLogin(data.token); // 本物のトークンを渡す
    } catch (err) {
      setErrorMsg('OTPが間違っているか、有効期限が切れています。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2>ログイン</h2>
      {errorMsg && <p style={{ color: 'red', fontSize: '14px' }}>{errorMsg}</p>}
      
      {step === 1 ? (
        <div>
          <input 
            type="email" 
            placeholder="メールアドレス" 
            value={email} 
            onChange={e => setEmail(e.target.value)} 
            style={inputStyle} 
          />
          <button onClick={handleRequestOtp} disabled={loading} style={btnStyle}>
            {loading ? '送信中...' : 'ワンタイムパスワードを発行'}
          </button>
        </div>
      ) : (
        <div>
          <p>{email} 宛に送られた認証コードを入力</p>
          <input 
            type="text" 
            placeholder="123456" 
            value={otp} 
            onChange={e => setOtp(e.target.value)} 
            style={inputStyle} 
          />
          <button onClick={handleVerifyOtp} disabled={loading} style={btnStyle}>
            {loading ? '確認中...' : 'ログイン'}
          </button>
        </div>
      )}
    </div>
  );
}

// --- ダッシュボードコンポーネント ---
function Dashboard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  // タスク一覧の取得
  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/tasks`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('取得失敗');
        const data = await res.json();
        setTasks(data);
      } catch (err) {
        setErrorMsg('タスクの取得に失敗しました。');
      } finally {
        setLoading(false);
      }
    };
    fetchTasks();
  }, [token]);

  const handleTriggerUpload = (taskId: string) => {
    setActiveTaskId(taskId);
    fileInputRef.current?.click();
  };

  // 写真のアップロード処理
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0 && activeTaskId) {
      const file = files[0];
      
      // FormDataを使って画像ファイルを準備
      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await fetch(`${API_BASE_URL}/tasks/${activeTaskId}/submit`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }, // FormData時はContent-Typeを自動設定させる
          body: formData,
        });

        if (!res.ok) throw new Error('提出失敗');
        
        alert('提出完了しました！');
        setTasks(tasks.map(t => t.id === activeTaskId ? { ...t, status: 'submitted' } : t));
      } catch (err) {
        alert('画像の提出に失敗しました。通信環境を確認してください。');
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
    setActiveTaskId(null);
  };

  if (loading) return <p>読み込み中...</p>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>今日の宿題</h2>
        <button onClick={onLogout} style={{ ...btnStyle, padding: '5px 10px', width: 'auto', background: '#ccc' }}>ログアウト</button>
      </div>

      {errorMsg && <p style={{ color: 'red' }}>{errorMsg}</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        {tasks.map(task => (
          <div key={task.id} style={{ border: '1px solid #ddd', padding: '15px', borderRadius: '8px' }}>
            <h3 style={{ margin: '0 0 10px 0' }}>{task.title}</h3>
            <p style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#666' }}>期限: {task.dueDate}</p>
            
            {task.status === 'pending' ? (
              <button onClick={() => handleTriggerUpload(task.id)} style={btnStyle}>
                📷 写真を撮って提出
              </button>
            ) : (
              <div style={{ color: 'green', fontWeight: 'bold' }}>✅ 提出済み</div>
            )}
          </div>
        ))}
      </div>

      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
    </div>
  );
}

// --- 共通スタイル ---
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px', marginBottom: '10px',
  boxSizing: 'border-box', borderRadius: '4px', border: '1px solid #ccc'
};

const btnStyle: React.CSSProperties = {
  width: '100%', padding: '10px', backgroundColor: '#007bff',
  color: 'white', border: 'none', borderRadius: '4px',
  cursor: 'pointer', fontWeight: 'bold'
};