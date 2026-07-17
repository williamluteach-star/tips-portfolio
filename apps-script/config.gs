/**
 * TIPS 學習歷程平台 — 全域設定
 * 部署前請依 README 修改以下常數。
 */
const CONFIG = {
  // 試算表 ID（執行 setupDatabase() 後自動填入 Script Properties，也可手動指定）
  SPREADSHEET_ID: PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') || '',

  // TIPS Drive 中存放學生素材的根資料夾 ID
  DRIVE_ROOT_FOLDER_ID: PropertiesService.getScriptProperties().getProperty('DRIVE_ROOT_FOLDER_ID') || '',

  // LINE 官方帳號 Messaging API Channel Access Token
  LINE_CHANNEL_ACCESS_TOKEN: PropertiesService.getScriptProperties().getProperty('LINE_TOKEN') || '',

  // 老師後台白名單（Google 帳號 email）
  TEACHER_EMAILS: ['williamluteach@gmail.com'],

  // 登入 token 有效時間（秒）
  TOKEN_TTL_SECONDS: 6 * 60 * 60,

  // 檔案容量上限（MB）— 對齊中央資料庫規範
  MAX_DOC_MB: 4,
  MAX_VIDEO_MB: 10,

  // 資料表分頁名稱
  SHEETS: {
    students: 'students',
    teachers: 'teachers',
    artifacts: 'artifacts',
    deadlines: 'deadlines',
    reminders_log: 'reminders_log',
    applications: 'applications',
    ai_sessions: 'ai_sessions',
  },
};

/** 取得資料庫試算表 */
function getDb_() {
  if (!CONFIG.SPREADSHEET_ID) throw new Error('尚未設定 SPREADSHEET_ID，請先執行 setupDatabase()');
  return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
}

/** 取得指定分頁 */
function getSheet_(name) {
  const sh = getDb_().getSheetByName(name);
  if (!sh) throw new Error('找不到資料表分頁：' + name);
  return sh;
}

/** ISO 時間字串 */
function nowIso_() {
  return new Date().toISOString();
}

/** 產生短 ID */
function shortId_(prefix) {
  return prefix + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase();
}
