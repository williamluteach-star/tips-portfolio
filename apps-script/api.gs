/**
 * TIPS 學習歷程平台 — Web App API
 * 部署方式：部署 > 新增部署作業 > 網頁應用程式
 *   執行身分：我（帳號擁有者）
 *   誰可以存取：任何人
 *
 * 前端以 POST（Content-Type: text/plain 避免 CORS preflight）傳送 JSON：
 *   { action: 'login' | 'me' | 'listArtifacts' | 'createArtifact' | 'updateArtifact'
 *            | 'deleteArtifact' | 'uploadFile' | 'listDeadlines' | 'dashboard',
 *     token: '...', payload: {...} }
 */

function doPost(e) {
  let req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: '請求格式錯誤' });
  }

  // LINE Webhook 事件（body 帶 events 陣列，與平台 API 分流）
  if (req && Array.isArray(req.events)) {
    return handleLineWebhook_(req);
  }

  try {
    switch (req.action) {
      case 'login':          return json_(login_(req.payload));
      default: {
        const user = auth_(req.token);
        // 老師端點
        if (String(req.action).indexOf('teacher') === 0 || ['saveDeadline', 'removeDeadline', 'resendReminder'].indexOf(req.action) >= 0) {
          if (user.role !== 'teacher') return json_({ ok: false, error: '此功能僅限老師使用' });
          switch (req.action) {
            case 'teacherOverview':   return json_(teacherOverview_());
            case 'teacherDeadlines':  return json_(teacherDeadlines_());
            case 'saveDeadline':      return json_(saveDeadline_(req.payload));
            case 'removeDeadline':    return json_(removeDeadline_(req.payload));
            case 'resendReminder':    return json_(resendReminder_(req.payload));
            default: return json_({ ok: false, error: '未知的 action：' + req.action });
          }
        }
        // 學生端點
        if (user.role !== 'student') return json_({ ok: false, error: '此功能僅限學生使用' });
        const student = user;
        switch (req.action) {
          case 'me':             return json_({ ok: true, data: student });
          case 'dashboard':      return json_(dashboard_(student));
          case 'listArtifacts':  return json_(listArtifacts_(student));
          case 'createArtifact': return json_(createArtifact_(student, req.payload));
          case 'updateArtifact': return json_(updateArtifact_(student, req.payload));
          case 'deleteArtifact': return json_(deleteArtifact_(student, req.payload));
          case 'uploadFile':     return json_(uploadFile_(student, req.payload));
          case 'listDeadlines':  return json_(listDeadlines_(student));
          default: return json_({ ok: false, error: '未知的 action：' + req.action });
        }
      }
    }
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function doGet() {
  return json_({ ok: true, service: 'TIPS 學習歷程平台 API', time: nowIso_() });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------------- 驗證 ---------------- */

function login_(payload) {
  const { studentId, loginCode } = payload || {};
  if (!studentId || !loginCode) return { ok: false, error: '請輸入學號與登入代碼' };
  const id = String(studentId).trim().toUpperCase();
  const code = String(loginCode).trim().toUpperCase();

  // 老師：T 開頭帳號
  if (id.charAt(0) === 'T') {
    const teacher = findRow_(CONFIG.SHEETS.teachers, 'teacher_id', id);
    if (!teacher || String(teacher.login_code) !== code) return { ok: false, error: '帳號或登入代碼錯誤' };
    if (teacher.status !== 'active') return { ok: false, error: '此帳號目前停用' };
    const token = Utilities.getUuid();
    CacheService.getScriptCache().put('tok_' + token, 'T:' + teacher.teacher_id, CONFIG.TOKEN_TTL_SECONDS);
    delete teacher.login_code;
    teacher.role = 'teacher';
    return { ok: true, data: { token: token, student: teacher } };
  }

  const student = findRow_(CONFIG.SHEETS.students, 'student_id', id);
  if (!student || String(student.login_code) !== code) {
    return { ok: false, error: '學號或登入代碼錯誤' };
  }
  if (student.status !== 'active') return { ok: false, error: '此帳號目前停用，請聯絡老師' };
  const token = Utilities.getUuid();
  CacheService.getScriptCache().put('tok_' + token, 'S:' + student.student_id, CONFIG.TOKEN_TTL_SECONDS);
  delete student.login_code;
  student.role = 'student';
  return { ok: true, data: { token: token, student: student } };
}

function auth_(token) {
  if (!token) throw new Error('未登入');
  const val = CacheService.getScriptCache().get('tok_' + token);
  if (!val) throw new Error('登入已過期，請重新登入');

  // 新格式 'T:xxx' / 'S:xxx'；相容舊格式（純 student_id）
  let role = 'student', id = val;
  if (val.indexOf('T:') === 0) { role = 'teacher'; id = val.slice(2); }
  else if (val.indexOf('S:') === 0) { id = val.slice(2); }

  if (role === 'teacher') {
    const teacher = findRow_(CONFIG.SHEETS.teachers, 'teacher_id', id);
    if (!teacher) throw new Error('帳號不存在');
    delete teacher.login_code;
    teacher.role = 'teacher';
    return teacher;
  }
  const student = findRow_(CONFIG.SHEETS.students, 'student_id', id);
  if (!student) throw new Error('帳號不存在');
  delete student.login_code;
  student.role = 'student';
  return student;
}

/* ---------------- 老師後台 ---------------- */

/** 學生進度總表：每位學生的素材統計與最近上傳 */
function teacherOverview_() {
  const students = readAll_(CONFIG.SHEETS.students);
  const artifacts = readAll_(CONFIG.SHEETS.artifacts).filter(function (a) { return !a.deleted_at; });

  const byStudent = {};
  artifacts.forEach(function (a) {
    if (!byStudent[a.student_id]) byStudent[a.student_id] = { course: 0, diverse: 0, last: '' };
    const b = byStudent[a.student_id];
    if (a.category === 'course_result') b.course++; else b.diverse++;
    if (String(a.created_at) > String(b.last)) b.last = a.created_at;
  });

  const rows = students.map(function (s) {
    const b = byStudent[s.student_id] || { course: 0, diverse: 0, last: '' };
    return {
      student_id: s.student_id, name: s.name, school_type: s.school_type,
      school_name: s.school_name, grade: s.grade, class_group: s.class_group,
      status: s.status, has_line: !!s.line_user_id,
      course: b.course, diverse: b.diverse, total: b.course + b.diverse,
      last_created_at: b.last,
    };
  });
  return { ok: true, data: rows };
}

/** 全部截止日（含過期，供維護） */
function teacherDeadlines_() {
  const rows = readAll_(CONFIG.SHEETS.deadlines)
    .sort(function (a, b) { return String(a.due_at).localeCompare(String(b.due_at)); });
  return { ok: true, data: rows };
}

/** 新增或更新截止日 */
function saveDeadline_(p) {
  if (!p || !p.title || !p.due_at) return { ok: false, error: '標題與截止時間為必填' };
  const now = nowIso_();
  const sh = getSheet_(CONFIG.SHEETS.deadlines);
  const record = [
    p.scope || 'global', p.school_name || '', p.school_type || 'all',
    Number(p.grade) || 0, p.semester || '', p.task_type || 'other',
    p.title, p.due_at, p.note || '',
  ];
  if (p.deadline_id) {
    const loc = locateRow_(CONFIG.SHEETS.deadlines, 'deadline_id', p.deadline_id);
    if (!loc) return { ok: false, error: '找不到這筆截止日' };
    sh.getRange(loc.rowIndex, 2, 1, record.length).setValues([record]);
    sh.getRange(loc.rowIndex, 12).setValue(now); // updated_at
    return { ok: true, data: { deadline_id: p.deadline_id } };
  }
  const id = shortId_('D');
  sh.appendRow([id].concat(record, [now, now]));
  return { ok: true, data: { deadline_id: id } };
}

/** 刪除截止日 */
function removeDeadline_(p) {
  if (!p || !p.deadline_id) return { ok: false, error: '缺少 deadline_id' };
  const loc = locateRow_(CONFIG.SHEETS.deadlines, 'deadline_id', p.deadline_id);
  if (!loc) return { ok: false, error: '找不到這筆截止日' };
  getSheet_(CONFIG.SHEETS.deadlines).deleteRow(loc.rowIndex);
  return { ok: true };
}

/** 一鍵補發提醒：days=7 補發週報、days=31 補發月報 */
function resendReminder_(p) {
  const days = Number(p && p.days) || 7;
  const sent = sendDigest_(days);
  return { ok: true, data: { sent: sent } };
}

/* ---------------- 儀表板 ---------------- */

function dashboard_(student) {
  const artifacts = readAll_(CONFIG.SHEETS.artifacts)
    .filter(function (a) { return a.student_id === student.student_id && !a.deleted_at; });

  // 三年學期格子：統計每學期件數
  const bySemester = {};
  artifacts.forEach(function (a) {
    if (!bySemester[a.semester]) bySemester[a.semester] = { course: 0, diverse: 0 };
    if (a.category === 'course_result') bySemester[a.semester].course++;
    else bySemester[a.semester].diverse++;
  });

  const deadlines = upcomingDeadlines_(student, 90);
  return { ok: true, data: { bySemester: bySemester, total: artifacts.length, upcoming: deadlines } };
}

/* ---------------- 素材 ---------------- */

function listArtifacts_(student) {
  const rows = readAll_(CONFIG.SHEETS.artifacts)
    .filter(function (a) { return a.student_id === student.student_id && !a.deleted_at; })
    .sort(function (a, b) { return String(b.created_at).localeCompare(String(a.created_at)); });
  return { ok: true, data: rows };
}

function createArtifact_(student, p) {
  if (!p || !p.title || !p.category || !p.semester) return { ok: false, error: '名稱、類別、學期為必填' };
  const now = nowIso_();
  const id = shortId_('A');
  const sh = getSheet_(CONFIG.SHEETS.artifacts);
  sh.appendRow([
    id, student.student_id, p.title, p.category, p.subcategory || '', p.semester,
    p.subject_or_event || '', p.file_url || '', p.file_type || '', p.file_size_mb || '',
    p.quick_note || '', '', '', false, false, false, '', now, now,
  ]);
  return { ok: true, data: { artifact_id: id } };
}

function updateArtifact_(student, p) {
  if (!p || !p.artifact_id) return { ok: false, error: '缺少 artifact_id' };
  const loc = locateRow_(CONFIG.SHEETS.artifacts, 'artifact_id', p.artifact_id);
  if (!loc || loc.record.student_id !== student.student_id) return { ok: false, error: '找不到素材' };

  const editable = ['title', 'subcategory', 'semester', 'subject_or_event', 'file_url', 'file_type',
    'file_size_mb', 'quick_note', 'summary_100', 'is_uploaded_to_school', 'is_checked_to_central'];
  const sh = getSheet_(CONFIG.SHEETS.artifacts);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  editable.forEach(function (field) {
    if (p[field] !== undefined) {
      sh.getRange(loc.rowIndex, headers.indexOf(field) + 1).setValue(p[field]);
    }
  });
  sh.getRange(loc.rowIndex, headers.indexOf('updated_at') + 1).setValue(nowIso_());
  return { ok: true };
}

function deleteArtifact_(student, p) {
  const loc = locateRow_(CONFIG.SHEETS.artifacts, 'artifact_id', p && p.artifact_id);
  if (!loc || loc.record.student_id !== student.student_id) return { ok: false, error: '找不到素材' };
  const sh = getSheet_(CONFIG.SHEETS.artifacts);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  sh.getRange(loc.rowIndex, headers.indexOf('deleted_at') + 1).setValue(nowIso_()); // 軟刪除
  return { ok: true };
}

/* ---------------- 檔案上傳（base64 → TIPS Drive） ---------------- */

function uploadFile_(student, p) {
  if (!p || !p.base64 || !p.filename || !p.mimeType) return { ok: false, error: '檔案資料不完整' };
  const bytes = Utilities.base64Decode(p.base64);
  const sizeMb = bytes.length / (1024 * 1024);
  const isVideo = /^video\//.test(p.mimeType);
  const limit = isVideo ? CONFIG.MAX_VIDEO_MB : CONFIG.MAX_DOC_MB;
  if (sizeMb > limit) {
    return { ok: false, error: '檔案 ' + sizeMb.toFixed(1) + 'MB 超過上限 ' + limit + 'MB（中央資料庫規範），請壓縮後再上傳' };
  }
  const root = DriveApp.getFolderById(CONFIG.DRIVE_ROOT_FOLDER_ID);
  const folders = root.getFoldersByName(student.student_id);
  const folder = folders.hasNext() ? folders.next() : root.createFolder(student.student_id);
  const blob = Utilities.newBlob(bytes, p.mimeType, p.filename);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { ok: true, data: { file_url: file.getUrl(), file_size_mb: Number(sizeMb.toFixed(2)) } };
}

/* ---------------- 時程 ---------------- */

function listDeadlines_(student) {
  return { ok: true, data: upcomingDeadlines_(student, 365) };
}

function upcomingDeadlines_(student, daysAhead) {
  const now = new Date();
  const horizon = new Date(now.getTime() + daysAhead * 86400000);
  return readAll_(CONFIG.SHEETS.deadlines)
    .filter(function (d) {
      const due = new Date(d.due_at);
      if (isNaN(due) || due < now || due > horizon) return false;
      if (d.school_type !== 'all' && d.school_type !== student.school_type) return false;
      if (Number(d.grade) !== 0 && Number(d.grade) !== Number(student.grade)) return false;
      if (d.scope === 'school' && d.school_name !== student.school_name) return false;
      return true;
    })
    .sort(function (a, b) { return String(a.due_at).localeCompare(String(b.due_at)); });
}

/* ---------------- Sheet 工具（批次讀取） ---------------- */

function readAll_(sheetName) {
  const sh = getSheet_(sheetName);
  const values = sh.getDataRange().getValues();
  const headers = values[0];
  return values.slice(1).map(function (row) {
    const obj = {};
    headers.forEach(function (h, i) { obj[h] = row[i]; });
    return obj;
  }).filter(function (o) { return o[headers[0]] !== ''; });
}

function findRow_(sheetName, key, value) {
  const loc = locateRow_(sheetName, key, value);
  return loc ? loc.record : null;
}

function locateRow_(sheetName, key, value) {
  const sh = getSheet_(sheetName);
  const values = sh.getDataRange().getValues();
  const headers = values[0];
  const col = headers.indexOf(key);
  if (col < 0) return null;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][col]) === String(value)) {
      const record = {};
      headers.forEach(function (h, j) { record[h] = values[i][j]; });
      return { rowIndex: i + 1, record: record };
    }
  }
  return null;
}
