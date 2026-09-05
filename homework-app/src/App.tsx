import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './auth';
import Login from './pages/Login';
import Invite from './pages/Invite';
import StudentDashboard from './pages/StudentDashboard';
import TeacherDashboard from './pages/TeacherDashboard';

export default function App() {
  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', fontFamily: 'sans-serif', padding: '0 16px' }}>
      <header style={{ padding: '15px 0', borderBottom: '1px solid #ccc', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '20px', margin: 0 }}>宿題レビュー</h1>
      </header>
      <Routes>
        <Route path="/invite" element={<Invite />} />
        <Route path="/" element={<Home />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

function Home() {
  const { loading, session, profile, profileError, refreshProfile, signOut } = useAuth();

  if (loading) return <p>読み込み中...</p>;
  if (!session) return <Login />;

  if (!profile) {
    return (
      <div>
        <p style={{ color: 'red' }}>{profileError ?? 'プロフィールが見つかりません。'}</p>
        <button onClick={() => void refreshProfile()}>再試行</button>{' '}
        <button onClick={() => void signOut()}>ログアウト</button>
      </div>
    );
  }

  if (profile.role === 'teacher') return <TeacherDashboard />;
  if (profile.role === 'student') {
    if (!profile.teacher_id) {
      return (
        <div>
          <p>まだ先生に紐づいていません。先生から受け取った招待リンクを開いてください。</p>
          <button onClick={signOut}>ログアウト</button>
        </div>
      );
    }
    return <StudentDashboard />;
  }
  return null;
}
