import { useAuth } from '../auth';
import { btnStyle } from '../ui';

export default function Login() {
  const { signInWithGoogle } = useAuth();

  return (
    <div>
      <h2>ログイン</h2>
      <p style={{ color: '#666', fontSize: '14px' }}>
        先生の方はそのままログインしてください。生徒の方は先生から受け取った招待リンクを開いてください。
      </p>
      <button onClick={() => signInWithGoogle('/')} style={btnStyle}>
        Googleでログイン
      </button>
    </div>
  );
}
