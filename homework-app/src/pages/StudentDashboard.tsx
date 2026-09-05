import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../auth';
import { btnStyle, cardStyle, inputStyle, secondaryBtnStyle } from '../ui';
import type { Review, Submission } from '../types';

type SubmissionWithReview = Submission & { reviews: Review[] };

const BUCKET = 'task-submissions';

export default function StudentDashboard() {
  const { profile, signOut } = useAuth();
  const [items, setItems] = useState<SubmissionWithReview[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('submissions')
      .select('*, reviews(*)')
      .order('created_at', { ascending: false });

    if (error) {
      setErrorMsg('提出物の取得に失敗しました。');
      setLoading(false);
      return;
    }
    const list = (data as SubmissionWithReview[]) ?? [];
    setItems(list);

    // 画像の署名付きURLを取得
    const entries = await Promise.all(
      list.map(async (s) => {
        const { data: signed } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(s.file_path, 3600);
        return [s.id, signed?.signedUrl ?? ''] as const;
      }),
    );
    setUrls(Object.fromEntries(entries));
    setLoading(false);
  }, []);

  // マウント時の一度きりのデータ取得（setState は await 後なのでカスケードしない）
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const handleSubmit = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!profile?.teacher_id) { setErrorMsg('担当の先生が設定されていません。'); return; }
    if (!title.trim()) { setErrorMsg('タイトルを入力してください。'); return; }
    if (!file) { setErrorMsg('提出する画像を選んでください。'); return; }

    setSubmitting(true);
    setErrorMsg('');

    const ext = file.name.includes('.') ? file.name.split('.').pop() : 'jpg';
    const path = `${profile.teacher_id}/${profile.id}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file);
    if (uploadError) {
      setErrorMsg('画像のアップロードに失敗しました。');
      setSubmitting(false);
      return;
    }

    const { error: insertError } = await supabase.from('submissions').insert({
      student_id: profile.id,
      teacher_id: profile.teacher_id,
      title: title.trim(),
      comment: comment.trim() || null,
      file_path: path,
    });

    setSubmitting(false);
    if (insertError) {
      // DB登録に失敗した場合は、先にアップロードした孤立ファイルを片付ける。
      await supabase.storage.from(BUCKET).remove([path]);
      setErrorMsg('提出の登録に失敗しました。');
      return;
    }

    setTitle('');
    setComment('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    await load();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>宿題を提出</h2>
        <button onClick={signOut} style={{ ...secondaryBtnStyle, width: 'auto', padding: '5px 10px' }}>
          ログアウト
        </button>
      </div>

      {errorMsg && <p style={{ color: 'red', fontSize: '14px' }}>{errorMsg}</p>}

      <div style={{ ...cardStyle, marginBottom: '24px' }}>
        <input
          type="text"
          placeholder="タイトル（例: 算数プリント p.12）"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={inputStyle}
        />
        <textarea
          placeholder="先生へのひとこと（任意）"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          style={{ ...inputStyle, minHeight: '60px' }}
        />
        <input ref={fileInputRef} type="file" accept="image/*" style={{ marginBottom: '10px' }} />
        <button onClick={handleSubmit} disabled={submitting} style={btnStyle}>
          {submitting ? '提出中...' : '提出する'}
        </button>
      </div>

      <h2>提出した宿題</h2>
      {loading ? (
        <p>読み込み中...</p>
      ) : items.length === 0 ? (
        <p style={{ color: '#666' }}>まだ提出はありません。</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {items.map((s) => {
            const review = s.reviews?.[0];
            return (
              <div key={s.id} style={cardStyle}>
                <h3 style={{ margin: '0 0 8px 0' }}>{s.title}</h3>
                {urls[s.id] && (
                  <img src={urls[s.id]} alt={s.title} style={{ maxWidth: '100%', borderRadius: '6px', marginBottom: '8px' }} />
                )}
                {s.comment && <p style={{ fontSize: '14px', color: '#666', margin: '0 0 8px' }}>あなた: {s.comment}</p>}
                {review ? (
                  <div style={{
                    borderTop: '1px solid #eee', paddingTop: '8px',
                    color: review.result === 'approved' ? 'green' : '#d9534f',
                  }}>
                    <strong>{review.result === 'approved' ? '✅ 承認' : '📝 直しあり'}</strong>
                    {review.comment && <p style={{ margin: '4px 0 0', color: '#333' }}>{review.comment}</p>}
                  </div>
                ) : (
                  <div style={{ color: '#888', fontWeight: 'bold' }}>先生の確認待ち</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
