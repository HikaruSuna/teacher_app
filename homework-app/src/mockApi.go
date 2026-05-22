package mockapi

import (
	"fmt"
	"time"
)

// TaskStatus は宿題のステータスを表す独自型
type TaskStatus string

const (
	StatusPending   TaskStatus = "pending"
	StatusSubmitted TaskStatus = "submitted"
	StatusApproved  TaskStatus = "approved"
)

// Task は宿題の型定義
type Task struct {
	ID      string     `json:"id"`
	Title   string     `json:"title"`
	DueDate string     `json:"dueDate"`
	Status  TaskStatus `json:"status"`
}

// File はブラウザの File オブジェクトの代わりとなるモック構造体
type File struct {
	Name string
	Size int64
}

// 1. OTPリクエスト（ダミー）
func RequestOTP(email string) (bool, error) {
	fmt.Printf("[API Mock] %s 宛にOTPを送信しました。ダミーOTPは「123456」です。\n", email)
	time.Sleep(1 * time.Second)

	return true, nil
}

// 2. OTP検証（ダミー）
func VerifyOTP(email string, otp string) (string, error) {
	time.Sleep(1 * time.Second)

	if otp == "123456" {
		return "dummy-jwt-token", nil
	}

	// 不正なOTPの場合は空文字（またはエラー）を返す
	return "", fmt.Errorf("無効なOTPです")
}

// 3. 宿題一覧取得（ダミー）
func FetchTasks() ([]Task, error) {
	time.Sleep(500 * time.Millisecond)

	tasks := []Task{
		{ID: "1", Title: "青チャート P.50〜55", DueDate: "2026-05-20", Status: StatusPending},
		{ID: "2", Title: "英単語ターゲット 1-100", DueDate: "2026-05-21", Status: StatusPending},
		{ID: "3", Title: "物理のエッセンス 力学", DueDate: "2026-05-18", Status: StatusSubmitted},
	}

	return tasks, nil
}

// 4. 画像アップロード＆完了報告（ダミー）
func SubmitTask(taskID string, file File) (bool, error) {
	fmt.Printf("[API Mock] タスク %s に画像 %s をアップロード（Signed URL経由を想定）\n", taskID, file.Name)
	time.Sleep(1500 * time.Millisecond)

	return true, nil
}
