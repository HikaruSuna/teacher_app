// src/App.tsx
import React, { useState, useRef, useEffect } from 'react';
import { requestOtp, verifyOtp, fetchTasks, submitTask, type Task } from './mockApi';

export default function App() {
  const [token, setToken] = useState<string | null>(null);

  // トークンがなければログイン画面、あればダッシュボードを表示
  return (
    <div style={{ maxWidth: '400px', margin: '0 auto', fontFamily: 'sans-serif', padding: '20px' }}>
      <header style={{ borderBottom: '2px solid #eee', paddingBottom: '10px', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '20px', margin: 0 }}>宿題管理アプリ</h1>
      </header>
      {!token ? <Login onLogin={setToken} /> : <Dashboard onLogout={() => setToken(null)} />}
    </div>
  );
}

// --- ログインコンポーネント ---
function Login({ onLogin }: { onLogin: (token: string) => void }) {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);

  const handleRequestOtp = async () => {
    if (!email) return;
    setLoading(true);
    await requestOtp(email);
    setLoading(false);
    setStep(2);
    alert('ダミーのOTP「123456」を入力してください');
  };

  const handleVerifyOtp = async () => {
    setLoading(true);
    const token = await verifyOtp(email, otp);
    setLoading(false);
    if (token) {
      onLogin(token);
    } else {
      alert('OTPが間違っています');
    }
  };

  return (
    <div>
      <h2>ログイン</h2>
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
          <p>{email} 宛に送られた6桁の数字を入力</p>
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
function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  useEffect(() => {
    fetchTasks().then(data => {
      setTasks(data);
      setLoading(false);
    });
  }, []);

  // カメラ・ライブラリを起動する処理
  const handleTriggerUpload = (taskId: string) => {
    setActiveTaskId(taskId);
    fileInputRef.current?.click();
  };

  // ファイルが選択された時の処理（アップロード実行）
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0 && activeTaskId) {
      const file = files[0];
      alert(`「${file.name}」を提出中...`);
      
      const success = await submitTask(activeTaskId, file);
      if (success) {
        alert('提出完了しました！');
        // タスクの状態を更新
        setTasks(tasks.map(t => t.id === activeTaskId ? { ...t, status: 'submitted' } : t));
      }
    }
    // inputをリセット
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

      {/* 隠しファイル入力（カメラ/ライブラリ呼び出し用） */}
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
  width: '100%',
  padding: '10px',
  marginBottom: '10px',
  boxSizing: 'border-box',
  borderRadius: '4px',
  border: '1px solid #ccc'
};

const btnStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px',
  backgroundColor: '#007bff',
  color: 'white',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontWeight: 'bold'
};