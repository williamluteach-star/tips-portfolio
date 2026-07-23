// 部署 Apps Script Web App 後，把網址貼到這裡（結尾是 /exec）
export const API_URL = 'https://script.google.com/macros/s/AKfycbyQBIQCqtfJL0SjwBlwAsFKfHzIaAUWk5hAZ5w_hOEd65pDpcOqpNsYjAbv5NfRwExA/exec';

let token = null;
export function setToken(t) { token = t; window.__tok = t;}
export function getToken() { return token; }

/**
 * 呼叫後端 API。
 * 使用 text/plain 傳送 JSON，避免瀏覽器對 Apps Script 發出 CORS preflight。
 */
export async function api(action, payload = {}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, token, payload }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || '發生未知錯誤');
  return data.data;
}

/** 把 File 轉成 base64（去掉 data: 前綴） */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(new Error('檔案讀取失敗'));
    r.readAsDataURL(file);
  });
}
