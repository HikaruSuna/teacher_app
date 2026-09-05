import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../auth';
import { btnStyle, cardStyle, inputStyle, secondaryBtnStyle } from '../ui';
import type { Profile, Review, ReviewResult, Submission } from '../types';

type SubmissionWithReview = Submission & { reviews: Review[] };

interface Invite {
  id: string;
  token: string;
  is_active: boolean;
  created_at: string;
}

const BUCKET = 'task-submissions';

export default function TeacherDashboard() {
  const { profile, signOut } = useAuth();
  const [students, setStudents] = useState<Profile[]>([]);
  const [items, setItems] = useState<SubmissionWithReview[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [invite, setInvite] = useState<Invite | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: studentData }, { data: subData }, { data: inviteData }] = await Promise.all([
      supabase.from('profiles').select('*').eq('teacher_id', profile!.id),
      supabase.from('submissions').select('*, reviews(*)').order('created_at', { ascending: false }),
      supabase.from('invites').select('id, token, is_active, created_at')
        .eq('is_active', true).order('created_at', { ascending: false }).limit(1),
    ]);

    setStudents((studentData as Profile[]) ?? []);
    const list = (subData as SubmissionWithReview[]) ?? [];
    setItems(list);
    setInvite((inviteData as Invite[])?.[0] ?? null);

    const entries = await Promise.all(
      list.map(async (s) => {
        const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(s.file_path, 3600);
        return [s.id, signed?.signedUrl ?? ''] as const;
      }),
    );
    setUrls(Object.fromEntries(entries));
    setLoading(false);
  }, [profile]);

  // マウント時の一度きりのデータ取得（setState は await 後なのでカスケードしない）
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const inviteUrl = invite ? `${window.location.origin}/invite?token=${invite.token}` : '';

  const handleCreateOrCopy = async () => {
    let url = inviteUrl;
    if (!invite) {
      const token = crypto.randomUUID();
      const { data, error } = await supabase.from('invites')
        .insert({ token, teacher_id: profile!.id })
        .select('id, token, is_active, created_at')
        .single();
      if (error || !data) { setErrorMsg('招待リンクの作成に失敗しました。'); return; }
      setInvite(data as Invite);
      url = `${window.location.origin}/invite?token=${(data as Invite).token}`;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setErrorMsg('コピーに失敗しました。リンク: ' + url);
    }
  };

  const studentName = (id: string) =>
    students.find((s) => s.id === id)?.full_name ?? '生徒';

  const pending = items.filter((s) => s.status === 'submitted');
  const reviewed = items.filter((s) => s.status === 'reviewed');

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>先生ダッシュボード</h2>
        <button onClick={signOut} style={{ ...secondaryBtnStyle, width: 'auto', padding: '5px 10px' }}>
          ログアウト
        </button>
      </div>

      {errorMsg && <p style={{ color: 'red', fontSize: '14px' }}>{errorMsg}</p>}

      <div style={{ ...cardStyle, marginBottom: '20px' }}>
        <strong>生徒を招待</strong>
        <p style={{ fontSize: '13px', color: '#666', margin: '6px 0' }}>
          リンクをコピーしてLINE等で生徒に送ってください。
        </p>
        <button onClick={handleCreateOrCopy} style={btnStyle}>
          {copied ? 'コピーしました！' : invite ? '招待リンクをコピー' : '招待リンクを作成してコピー'}
        </button>
        <p style={{ fontSize: '13px', color: '#666', marginTop: '10px' }}>
          登録済みの生徒: {students.length}人
        </p>
      </div>

      {loading ? (
        <p>読み込み中...</p>
      ) : (
        <>
          <h2>未レビュー（{pending.length}）</h2>
          {pending.length === 0 ? (
            <p style={{ color: '#666' }}>未レビューの提出はありません。</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '24px' }}>
              {pending.map((s) => (
                <ReviewCard key={s.id} submission={s} imageUrl={urls[s.id]}
                  studentName={studentName(s.student_id)} onReviewed={load} />
              ))}
            </div>
          )}

          <h2>レビュー済み（{reviewed.length}）</h2>
          {reviewed.length === 0 ? (
            <p style={{ color: '#666' }}>まだありません。</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {reviewed.map((s) => {
                const r = s.reviews?.[0];
                return (
                  <div key={s.id} style={cardStyle}>
                    <h3 style={{ margin: '0 0 4px' }}>{s.title}</h3>
                    <p style={{ fontSize: '13px', color: '#666', margin: '0 0 8px' }}>{studentName(s.student_id)}</p>
                    <span style={{ color: r?.result === 'approved' ? 'green' : '#d9534f', fontWeight: 'bold' }}>
                      {r?.result === 'approved' ? '✅ 承認' : '📝 直しあり'}
                    </span>
                    {r?.comment && <p style={{ margin: '4px 0 0', color: '#333' }}>{r.comment}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ReviewCard({ submission, imageUrl, studentName, onReviewed }: {
  submission: Submission;
  imageUrl?: string;
  studentName: string;
  onReviewed: () => void;
}) {
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submitReview = async (result: ReviewResult) => {
    setSaving(true);
    setError('');
    const { error: reviewError } = await supabase.rpc('submit_review', {
      p_submission_id: submission.id,
      p_result: result,
      p_comment: comment.trim() || null,
    });
    if (reviewError) { setError('返却に失敗しました。'); setSaving(false); return; }
    setSaving(false);
    onReviewed();
  };

  return (
    <div style={cardStyle}>
      <h3 style={{ margin: '0 0 4px' }}>{submission.title}</h3>
      <p style={{ fontSize: '13px', color: '#666', margin: '0 0 8px' }}>{studentName}</p>
      {imageUrl && <img src={imageUrl} alt={submission.title} style={{ maxWidth: '100%', borderRadius: '6px', marginBottom: '8px' }} />}
      {submission.comment && <p style={{ fontSize: '14px', color: '#666' }}>生徒: {submission.comment}</p>}

      {error && <p style={{ color: 'red', fontSize: '13px' }}>{error}</p>}
      <textarea
        placeholder="コメント（任意）"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        style={{ ...inputStyle, minHeight: '50px' }}
      />
      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={() => submitReview('approved')} disabled={saving}
          style={{ ...btnStyle, backgroundColor: '#28a745' }}>
          ✅ 承認して返却
        </button>
        <button onClick={() => submitReview('needs_revision')} disabled={saving}
          style={{ ...btnStyle, backgroundColor: '#d9534f' }}>
          📝 直しで返却
        </button>
      </div>
    </div>
  );
}
