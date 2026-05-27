// src/mockApi.ts
// src/api.ts
// ※フロントエンドからバックエンド（サーバー）へリクエストを送るためのファイルです

declare var process: {
  env: {
    NEXT_PUBLIC_API_URL?: string;
    [key: string]: string | undefined;
  };
};

export type TaskStatus = 'pending' | 'submitted' | 'approved';
export interface Task {
  id: string;
  title: string;
  dueDate: string;
  status: TaskStatus;
}

// 本番環境のバックエンドURLを環境変数から取得（なければローカル開発用）
// 実行時に process がない環境での ReferenceError を防ぐ
const API_BASE_URL = (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL) 
  ? process.env.NEXT_PUBLIC_API_URL 
  : 'http://localhost:8000/api';

// 1. OTPリクエスト（本番用）
// ...existing code...

// 1. OTPリクエスト（本番用）
export async function requestOtp(email: string): Promise<boolean> {
  const response = await fetch(`${API_BASE_URL}/auth/request-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  
  if (!response.ok) {
    throw new Error('OTPの送信に失敗しました');
  }
  return true;
}

// 2. OTP検証（本番用）
export async function verifyOtp(email: string, otp: string): Promise<string | null> {
  const response = await fetch(`${API_BASE_URL}/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, otp }),
  });
  
  if (!response.ok) {
    return null; // 認証失敗時はnullを返す
  }
  
  const data = await response.json();
  return data.token; // バックエンドが発行したJWTなどを返す
}

// 3. 宿題一覧取得（本番用）
// ※誰の宿題か特定するために、ログイン時に取得したtokenを受け取るように変更
export async function fetchTasks(token: string): Promise<Task[]> {
  const response = await fetch(`${API_BASE_URL}/tasks`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error('タスクの取得に失敗しました');
  }
  
  return await response.json();
}

// 4. 画像アップロード＆完了報告（本番用）
// ※画像ファイルはJSONに含められないため、FormDataを使用します
export async function submitTask(taskId: string, file: File, token: string): Promise<boolean> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/tasks/${taskId}/submit`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      // 注意: FormDataを送る際は 'Content-Type' を手動で指定しません（ブラウザが自動で設定します）
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error('画像のアップロードに失敗しました');
  }
  return true;
}