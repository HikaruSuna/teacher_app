import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabase';
import type { Session } from '@supabase/supabase-js';

type Task = {
  id: string;
  title: string;
  due_date: string;
  status: 'pending' | 'submitted';
};

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsReady(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (!isReady) return null;

  return (
    <div style={{ maxWidth: '400px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <header style={{ padding: '15px 0', borderBottom: '1px solid #ccc', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '20px', margin: 0 }}>宿題管理アプリ</h1>
      </header>
      {!session ? (
        <Login />
      ) : (
        <Dashboard session={session} onLogout={() => supabase.auth.signOut()} />
      )}
    </div>
  );
}

function Login() {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleRequestOtp = async () => {
    if (!email) return;
    setLoading(true);
    setErrorMsg('');
    const { error } = await supabase.auth.signInWithOtp({ email });
    setLoading(false);
    if (error) {
      setErrorMsg('OTPの送信に失敗しました。メールアドレスを確認してください。');
    } else {
      setStep(2);
    }
  };

  const handleVerifyOtp = async () => {
    setLoading(true);
    setErrorMsg('');
    const { error } = await supabase.auth.verifyOtp({ email, token: otp, type: 'email' });
    setLoading(false);
    if (error) {
      setErrorMsg('OTPが間違っているか、有効期限が切れています。');
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

function Dashboard({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  useEffect(() => {
    const fetchTasks = async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', session.user.id);

      if (error) {
        setErrorMsg('タスクの取得に失敗しました。');
      } else {
        setTasks(data ?? []);
      }
      setLoading(false);
    };
    fetchTasks();
  }, [session]);

  const handleTriggerUpload = (taskId: string) => {
    setActiveTaskId(taskId);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !activeTaskId) return;

    const file = files[0];
    const filePath = `${session.user.id}/${activeTaskId}/${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from('task-submissions')
      .upload(filePath, file);

    if (uploadError) {
      alert('画像のアップロードに失敗しました。');
    } else {
      const { error: updateError } = await supabase
        .from('tasks')
        .update({ status: 'submitted' })
        .eq('id', activeTaskId);

      if (!updateError) {
        alert('提出完了しました！');
        setTasks(prev => prev.map(t => t.id === activeTaskId ? { ...t, status: 'submitted' } : t));
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
        <button onClick={onLogout} style={{ ...btnStyle, padding: '5px 10px', width: 'auto', background: '#ccc' }}>
          ログアウト
        </button>
      </div>

      {errorMsg && <p style={{ color: 'red' }}>{errorMsg}</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        {tasks.map(task => (
          <div key={task.id} style={{ border: '1px solid #ddd', padding: '15px', borderRadius: '8px' }}>
            <h3 style={{ margin: '0 0 10px 0' }}>{task.title}</h3>
            <p style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#666' }}>期限: {task.due_date}</p>

            {task.status === 'pending' ? (
              <button onClick={() => handleTriggerUpload(task.id)} style={btnStyle}>
                写真を撮って提出
              </button>
            ) : (
              <div style={{ color: 'green', fontWeight: 'bold' }}>提出済み</div>
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

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px', marginBottom: '10px',
  boxSizing: 'border-box', borderRadius: '4px', border: '1px solid #ccc',
};

const btnStyle: React.CSSProperties = {
  width: '100%', padding: '10px', backgroundColor: '#007bff',
  color: 'white', border: 'none', borderRadius: '4px',
  cursor: 'pointer', fontWeight: 'bold',
};
