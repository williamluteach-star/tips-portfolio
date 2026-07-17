/**
 * TIPS 學習歷程平台 — 資料庫初始化
 * 在 Apps Script 編輯器中執行 setupDatabase() 一次即可。
 * 會建立新的 Google 試算表、所有資料分頁、Drive 根資料夾，並寫入示範資料。
 */

const SCHEMA = {
  students: [
    'student_id', 'name', 'school_type', 'school_name', 'grade', 'class_group',
    'line_user_id', 'login_code', 'target_majors', 'status', 'created_at', 'updated_at',
  ],
  teachers: [
    'teacher_id', 'name', 'email', 'login_code', 'status', 'created_at', 'updated_at',
  ],
  artifacts: [
    'artifact_id', 'student_id', 'title', 'category', 'subcategory', 'semester',
    'subject_or_event', 'file_url', 'file_type', 'file_size_mb', 'quick_note',
    'draft_content', 'summary_100', 'ai_assisted', 'is_uploaded_to_school',
    'is_checked_to_central', 'deleted_at', 'created_at', 'updated_at',
  ],
  deadlines: [
    'deadline_id', 'scope', 'school_name', 'school_type', 'grade', 'semester',
    'task_type', 'title', 'due_at', 'note', 'created_at', 'updated_at',
  ],
  reminders_log: [
    'log_id', 'student_id', 'deadline_id', 'offset_days', 'channel', 'sent_at', 'status',
  ],
  applications: [
    'application_id', 'student_id', 'target_school', 'target_major', 'channel',
    'selected_course_results', 'selected_diverse', 'self_statement_draft',
    'synthesis_draft', 'checklist_status', 'created_at', 'updated_at',
  ],
  ai_sessions: [
    'session_id', 'student_id', 'artifact_id', 'tool', 'transcript', 'tokens_used', 'created_at',
  ],
};

function setupDatabase() {
  const props = PropertiesService.getScriptProperties();

  // 1. 建立試算表
  let ss;
  const existingId = props.getProperty('SPREADSHEET_ID');
  if (existingId) {
    ss = SpreadsheetApp.openById(existingId);
    Logger.log('使用既有試算表：' + ss.getUrl());
  } else {
    ss = SpreadsheetApp.create('TIPS 學習歷程平台資料庫');
    props.setProperty('SPREADSHEET_ID', ss.getId());
    Logger.log('已建立試算表：' + ss.getUrl());
  }

  // 2. 建立各分頁與標題列
  Object.keys(SCHEMA).forEach(function (name) {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, SCHEMA[name].length).setValues([SCHEMA[name]]).setFontWeight('bold');
    sh.setFrozenRows(1);
  });
  const defaultSheet = ss.getSheetByName('工作表1') || ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 1) ss.deleteSheet(defaultSheet);

  // 3. 建立 Drive 根資料夾
  if (!props.getProperty('DRIVE_ROOT_FOLDER_ID')) {
    const folder = DriveApp.createFolder('TIPS 學習歷程素材庫');
    props.setProperty('DRIVE_ROOT_FOLDER_ID', folder.getId());
    Logger.log('已建立 Drive 根資料夾：' + folder.getUrl());
  }

  // 4. 寫入示範截止日（114學年第2學期範例，請依實際學校公告修改）
  seedDeadlines_(ss);

  Logger.log('✅ 初始化完成。下一步：執行 addStudentsFromSheet() 或在 students 分頁手動加入學生。');
}

function seedDeadlines_(ss) {
  const sh = ss.getSheetByName(CONFIG.SHEETS.deadlines);
  if (sh.getLastRow() > 1) return; // 已有資料則跳過
  const now = nowIso_();
  const rows = [
    [shortId_('D'), 'global', '', 'all', 0, '115-1', 'upload_course_result',
      '課程學習成果上傳＋送出認證截止', '2027-02-02T17:00:00+08:00', '實際日期依各校公告，請至老師後台修改', now, now],
    [shortId_('D'), 'global', '', 'all', 0, '115-1', 'check_to_central',
      '勾選課程學習成果／多元表現至中央資料庫', '2027-02-26T17:00:00+08:00', '課程成果每學年至多3件、多元表現至多10件', now, now],
  ];
  sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
}

/**
 * 批次匯入學生：從另一張 Google Sheet（欄位：姓名/學制/學校/年級/班別/LINE userId）匯入，
 * 自動產生 student_id 與 8 碼登入代碼。
 * 用法：addStudentsFromSheet('來源試算表ID', '分頁名稱')
 */
function addStudentsFromSheet(srcSpreadsheetId, srcSheetName) {
  const srcSs = SpreadsheetApp.openById(srcSpreadsheetId);
  const src = srcSheetName ? srcSs.getSheetByName(srcSheetName) : srcSs.getSheets()[0];
  if (!src) throw new Error('找不到來源分頁：' + srcSheetName);
  const data = src.getDataRange().getValues();
  const sh = getSheet_(CONFIG.SHEETS.students);
  const startRow = sh.getLastRow() + 1;
  const now = nowIso_();
  const out = [];
  for (let i = 1; i < data.length; i++) {
    const [name, schoolType, schoolName, grade, classGroup, lineUserId] = data[i];
    if (!name) continue;
    out.push([
      'S' + String(startRow + out.length - 1).padStart(6, '0'),
      name,
      normalizeSchoolType_(schoolType),
      schoolName || '',
      grade || 10,
      classGroup || '',
      lineUserId || '',
      genLoginCode_(),
      '[]',
      'active',
      now, now,
    ]);
  }
  if (out.length) sh.getRange(startRow, 1, out.length, out[0].length).setValues(out);
  Logger.log('已匯入 ' + out.length + ' 位學生。登入代碼請見 students 分頁 login_code 欄。');
}

/** 學制正規化：中文或英文輸入 → general / vocational */
function normalizeSchoolType_(v) {
  const s = String(v || '').trim().toLowerCase();
  if (s === 'vocational' || s === '高職' || s === '技高' || s === '技術型' || s === '技術型高中') return 'vocational';
  return 'general';
}

/** 一鍵匯入：William 的「高中生名單」試算表 */
function importStudents_20260716() {
  addStudentsFromSheet('12ArqUOLDCtf4uG3qinpttjEL9KoIVvhP2d5PYgJReCQ');
}

/**
 * 新增老師帳號（W3 老師後台）。
 * 用法：在編輯器執行 addTeacher()（預設 William），或改參數後執行。
 * 老師以 teacher_id（T 開頭）＋登入代碼登入前端，自動進入老師後台。
 */
function addTeacher(name, email) {
  name = name || 'William';
  email = email || 'williamluteach@gmail.com';
  const sh = getSheet_(CONFIG.SHEETS.teachers);
  const now = nowIso_();
  const id = 'T' + String(sh.getLastRow()).padStart(6, '0');
  const code = genLoginCode_();
  sh.appendRow([id, name, email, code, 'active', now, now]);
  Logger.log('老師帳號建立完成 → teacher_id: ' + id + '，login_code: ' + code);
}

/** 手動快速新增單一學生（測試用） */
function addTestStudent() {
  const sh = getSheet_(CONFIG.SHEETS.students);
  const now = nowIso_();
  const id = 'S' + String(sh.getLastRow()).padStart(6, '0');
  const code = genLoginCode_();
  sh.appendRow([id, '測試學生', 'vocational', '台中高工', 11, '技高A班', '', code, '["台科大資工"]', 'active', now, now]);
  Logger.log('測試學生建立完成 → student_id: ' + id + '，login_code: ' + code);
}

function genLoginCode_() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 去除易混淆字元
  let s = '';
  for (let i = 0; i < 8; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}
