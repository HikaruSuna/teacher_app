// src/mockApi.ts
export type TaskStatus = 'pending' | 'submitted' | 'approved';

export interface Task {
  id: string;
  title: string;
  dueDate: string;
  status: TaskStatus;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 1. OTPリクエスト（ダミー）
export async function requestOtp(email: string): Promise<boolean> {
  console.log(`[API Mock] ${email} 宛にOTPを送信しました。ダミーOTPは「123456」です。`);
  await sleep(1000);
  return true;
}

// 2. OTP検証（ダミー）
export async function verifyOtp(_email: string, otp: string): Promise<string | null> {
  await sleep(1000);
  if (otp === '123456') {
    return 'dummy-jwt-token';
  }
  return null;
}

// 3. 宿題一覧取得（ダミー）
export async function fetchTasks(): Promise<Task[]> {
  await sleep(500);
  return [
    { id: '1', title: '青チャート P.50〜55', dueDate: '2026-05-20', status: 'pending' },
    { id: '2', title: '英単語ターゲット 1-100', dueDate: '2026-05-21', status: 'pending' },
    { id: '3', title: '物理のエッセンス 力学', dueDate: '2026-05-18', status: 'submitted' },
  ];
}

// 4. 画像アップロード＆完了報告（ダミー）
export async function submitTask(taskId: string, file: File): Promise<boolean> {
  console.log(`[API Mock] タスク ${taskId} に画像 ${file.name} をアップロード（Signed URL経由を想定）`);
  await sleep(1500);
  return true;
}
