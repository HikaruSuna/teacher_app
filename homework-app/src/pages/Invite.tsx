import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../supabase';
import { useAuth } from '../auth';
import { btnStyle } from '../ui';

type Status = 'loading' | 'invalid' | 'ready' | 'joining' | 'error';

export default function Invite() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const { session, loading, signInWithGoogle, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [teacherName, setTeacherName] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(token ? 'loading' : 'invalid');
  const [error, setError] = useState('');
  const joinStartedRef = useRef(false);

  // 招待情報（先生名）の取得
  useEffect(() => {
    if (!token) return;
    joinStartedRef.current = false;
    let cancelled = false;
    supabase.rpc('get_invite_info', { invite_token: token }).then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data || data.length === 0) { setStatus('invalid'); return; }
      setTeacherName(data[0].teacher_name ?? '先生');
      setStatus('ready');
    });
    return () => { cancelled = true; };
  }, [token]);

  // ログイン済みでトークンがあれば、先生に参加してホームへ
  useEffect(() => {
    if (loading || !token || !session || status !== 'ready' || joinStartedRef.current) return;
    joinStartedRef.current = true;
    (async () => {
      setStatus('joining');
      const { error } = await supabase.rpc('join_teacher', { invite_token: token });
      if (error) {
        setError('参加に失敗しました。リンクが無効か、期限切れの可能性があります。');
        setStatus('error');
        return;
      }
      await refreshProfile();
      navigate('/', { replace: true });
    })();
  }, [loading, token, session, status, refreshProfile, navigate]);

  if (status === 'loading' || loading) return <p>読み込み中...</p>;

  if (status === 'invalid') {
    return (
      <div>
        <h2>無効な招待リンク</h2>
        <p>このリンクは無効か、期限が切れています。先生に新しいリンクをもらってください。</p>
      </div>
    );
  }

  if (status === 'joining') return <p>クラスに参加しています...</p>;

  if (status === 'error') {
    return (
      <div>
        <h2>エラー</h2>
        <p style={{ color: 'red' }}>{error}</p>
      </div>
    );
  }

  // status === 'ready' かつ未ログイン
  return (
    <div>
      <h2>{teacherName} 先生のクラスに参加しますか？</h2>
      <p style={{ color: '#666', fontSize: '14px' }}>
        Googleでログインすると、{teacherName} 先生の生徒として登録されます。
      </p>
      <button
        onClick={() => signInWithGoogle(`/invite?token=${encodeURIComponent(token!)}`)}
        style={btnStyle}
      >
        Googleでログイン
      </button>
    </div>
  );
}
