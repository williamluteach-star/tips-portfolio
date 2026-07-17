/**
 * TIPS 學習歷程平台 — LINE 彙整式提醒
 *
 * 成本設計：每月至多 4 次推播（50 位學生 × 4 = 200 則，落在 LINE 官方帳號輕用量免費額度內）。
 * 建議觸發器設定（觸發條件 > 時間驅動 > 月計時器）：
 *   每月 1 日執行 sendMonthlyDigest() — 本月時程總覽
 *   另可加「每週一」執行 sendWeeklyDigestIfNeeded() — 僅在 7 天內有截止日時發送
 *
 * 注意：sendWeeklyDigestIfNeeded 最多讓單月推播達 4-5 次，若學生數成長請重新試算則數。
 */

function sendMonthlyDigest() {
  sendDigest_(31);
}

function sendWeeklyDigestIfNeeded() {
  sendDigest_(7);
}

/**
 * 共用彙整發送核心：daysAhead=31 月報、7 週報。
 * 回傳實際發送則數（供老師後台「一鍵補發」顯示）。
 */
function sendDigest_(daysAhead) {
  const students = readAll_(CONFIG.SHEETS.students)
    .filter(function (s) { return s.status === 'active' && s.line_user_id; });

  let sent = 0;
  students.forEach(function (student) {
    const deadlines = upcomingDeadlines_(student, daysAhead);
    if (!deadlines.length) return;
    let text;
    if (daysAhead > 7) {
      const lines = deadlines.map(function (d) {
        return '▸ ' + formatDate_(d.due_at) + '　' + d.title;
      });
      text = '📚 ' + student.name + ' 同學，本月學習歷程重要時程：\n\n' +
        lines.join('\n') +
        '\n\n📌 打開平台查看細節與你的素材進度。錯過勾選截止日，資料將無法送交審查，請務必留意！';
    } else {
      const lines = deadlines.map(function (d) {
        return '⏰ ' + formatDate_(d.due_at) + '　' + d.title;
      });
      text = '❗ 一週內截止提醒\n\n' + lines.join('\n') + '\n\n還沒完成的項目請把握時間！';
    }
    const ok = pushLine_(student.line_user_id, text);
    logReminder_(student.student_id, deadlines[0].deadline_id, daysAhead > 7 ? 30 : 7, ok);
    if (ok) sent++;
  });
  return sent;
}

function pushLine_(lineUserId, text) {
  if (!CONFIG.LINE_CHANNEL_ACCESS_TOKEN) {
    Logger.log('未設定 LINE_TOKEN，略過推播');
    return false;
  }
  try {
    UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + CONFIG.LINE_CHANNEL_ACCESS_TOKEN },
      payload: JSON.stringify({ to: lineUserId, messages: [{ type: 'text', text: text }] }),
      muteHttpExceptions: true,
    });
    return true;
  } catch (err) {
    Logger.log('LINE 推播失敗：' + err);
    return false;
  }
}

function logReminder_(studentId, deadlineId, offsetDays, ok) {
  getSheet_(CONFIG.SHEETS.reminders_log).appendRow([
    shortId_('L'), studentId, deadlineId, offsetDays, 'line', nowIso_(), ok ? 'sent' : 'failed',
  ]);
}

function formatDate_(iso) {
  const d = new Date(iso);
  return (d.getMonth() + 1) + '/' + d.getDate() + '（' + '日一二三四五六'.charAt(d.getDay()) + '）';
}


/* ---------------- W4：LINE Webhook（綁定＋查詢時程） ---------------- */

/**
 * LINE Webhook 事件處理（由 api.gs 的 doPost 分流進來）。
 * 【合併模式 2026-07-17】LINE 的 Webhook URL 指向 tips-notify（Railway），
 * tips-notify 收到事件後原封轉發一份到本 /exec（見 tips-notify/server.js 的 PORTFOLIO_WEBHOOK_URL）。
 * 本系統只回應三種明確指令，其餘保持沉默，避免與 tips-notify／OA 自動回應搶 replyToken。
 * 綁定：學生傳「學號 登入代碼」（例：S000123 ABCD2345）→ 自動記錄 line_user_id。
 * 指令：「我的時程」查 90 天內截止日；「解除綁定」清除連結。
 */
function handleLineWebhook_(body) {
  (body.events || []).forEach(function (ev) {
    try {
      if (ev.type === 'follow') {
        // 合併模式：加好友歡迎由 tips-notify／OA 官方後台處理，這裡不回覆（避免搶 replyToken）
      } else if (ev.type === 'message' && ev.message && ev.message.type === 'text') {
        handleLineText_(ev);
      }
    } catch (err) {
      Logger.log('LINE webhook 事件錯誤：' + err);
    }
  });
  return json_({ ok: true });
}

function welcomeText_() {
  return '歡迎加入 TIPS 學習歷程平台 📚\n\n請輸入「學號 登入代碼」完成綁定（中間空一格），例如：\nS000123 ABCD2345\n\n綁定後重要截止日會自動提醒你，也可以隨時輸入「我的時程」查詢。';
}

function handleLineText_(ev) {
  const uid = ev.source && ev.source.userId;
  const raw = String(ev.message.text || '').trim();
  const text = raw.toUpperCase();

  // 1) 綁定：「學號 代碼」
  const m = text.match(/^(S\d{6})[\s,，]+([A-Z0-9]{8})$/);
  if (m) return replyLine_(ev.replyToken, bindLine_(uid, m[1], m[2]));

  // 只給學號沒給代碼
  if (/^S\d{6}$/.test(text)) {
    return replyLine_(ev.replyToken, '還差一步！請把學號和登入代碼一起傳（中間空一格），例如：\n' + text + ' ABCD2345');
  }

  // 2) 查詢時程
  if (raw.indexOf('時程') >= 0) {
    return replyLine_(ev.replyToken, scheduleText_(uid));
  }

  // 3) 解除綁定
  if (raw.indexOf('解除綁定') >= 0) {
    return replyLine_(ev.replyToken, unbindLine_(uid));
  }

  // 4) 社群連結（圖文選單 FB+IG 格）
  if (raw.indexOf('社群') >= 0) {
    return replyLine_(ev.replyToken, 'TIPS 英典教育社群 👇\n\nFacebook：\nhttps://www.facebook.com/tipsedu2022\n\nInstagram：\nhttps://www.instagram.com/tipsedu2022');
  }

  // 5) 其他文字：保持沉默 — 交給 tips-notify（家長配對、查詢作業）與 OA 自動回應處理
}

function bindLine_(uid, studentId, code) {
  if (!uid) return '無法取得你的 LINE 識別碼，請稍後再試。';
  const loc = locateRow_(CONFIG.SHEETS.students, 'student_id', studentId);
  if (!loc || String(loc.record.login_code).toUpperCase() !== code) return '學號或登入代碼錯誤，請再確認一次。';
  const sh = getSheet_(CONFIG.SHEETS.students);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  sh.getRange(loc.rowIndex, headers.indexOf('line_user_id') + 1).setValue(uid);
  sh.getRange(loc.rowIndex, headers.indexOf('updated_at') + 1).setValue(nowIso_());
  return '綁定成功 🎉 ' + loc.record.name + ' 同學，之後重要截止日會自動提醒你。\n\n隨時輸入「我的時程」查看接下來的重要日期。';
}

function unbindLine_(uid) {
  const loc = uid ? locateRow_(CONFIG.SHEETS.students, 'line_user_id', uid) : null;
  if (!loc) return '你目前沒有綁定任何帳號。';
  const sh = getSheet_(CONFIG.SHEETS.students);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  sh.getRange(loc.rowIndex, headers.indexOf('line_user_id') + 1).setValue('');
  return '已解除綁定。想重新綁定時，再傳「學號 登入代碼」即可。';
}

function scheduleText_(uid) {
  const student = uid ? findRow_(CONFIG.SHEETS.students, 'line_user_id', uid) : null;
  if (!student) return '你還沒完成綁定～請先傳「學號 登入代碼」（中間空一格），例如：S000123 ABCD2345';
  const deadlines = upcomingDeadlines_(student, 90);
  if (!deadlines.length) return '接下來 90 天沒有截止日，可以安心累積素材 ✍️';
  const lines = deadlines.map(function (d) { return '▸ ' + formatDate_(d.due_at) + '　' + d.title; });
  return '📅 ' + student.name + ' 同學，接下來 90 天的重要時程：\n\n' + lines.join('\n') + '\n\n細節請到平台查看：https://portfolio.tips-edu.com';
}

/** Reply API（免費，不計推播額度） */
function replyLine_(replyToken, text) {
  if (!CONFIG.LINE_CHANNEL_ACCESS_TOKEN || !replyToken) return;
  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + CONFIG.LINE_CHANNEL_ACCESS_TOKEN },
    payload: JSON.stringify({ replyToken: replyToken, messages: [{ type: 'text', text: String(text) }] }),
    muteHttpExceptions: true,
  });
}

/* ---------------- W4：圖文選單 ---------------- */

/**
 * ⚠️【已停用 2026-07-17】圖文選單改由 OA Manager 後台管理（「20260717學習歷程版」，
 * 沿用 William 原本的六格選單，下左＝傳「我的時程」、下右＝傳「社群連結」）。
 * 執行本函式會用 API 選單蓋掉 OA Manager 的選單——任何圖文選單變更都必須先經 William 確認！
 */
function setupRichMenu() {
  const token = CONFIG.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error('尚未設定 LINE_TOKEN');

  const menu = {
    size: { width: 2500, height: 843 },
    selected: true,
    name: 'TIPS 主選單',
    chatBarText: '功能選單',
    areas: [
      { bounds: { x: 0, y: 0, width: 1250, height: 843 }, action: { type: 'message', text: '我的時程' } },
      { bounds: { x: 1250, y: 0, width: 1250, height: 843 }, action: { type: 'uri', uri: 'https://portfolio.tips-edu.com' } },
    ],
  };
  const created = JSON.parse(UrlFetchApp.fetch('https://api.line.me/v2/bot/richmenu', {
    method: 'post', contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify(menu),
  }).getContentText());
  const menuId = created.richMenuId;
  Logger.log('已建立圖文選單：' + menuId);

  const img = UrlFetchApp.fetch('https://portfolio.tips-edu.com/richmenu.png').getBlob();
  UrlFetchApp.fetch('https://api-data.line.me/v2/bot/richmenu/' + menuId + '/content', {
    method: 'post', contentType: 'image/png',
    headers: { Authorization: 'Bearer ' + token },
    payload: img,
  });
  Logger.log('圖片上傳完成');

  UrlFetchApp.fetch('https://api.line.me/v2/bot/user/all/richmenu/' + menuId, {
    method: 'post', headers: { Authorization: 'Bearer ' + token },
  });
  Logger.log('✅ 圖文選單已設為所有好友的預設選單。');
}

/**
 * 還原原本的圖文選單：解除 API 預設選單綁定並刪除所有 API 建立的選單，
 * 讓 OA Manager 後台設定的選單重新顯示。
 * 【規則】任何圖文選單變更都必須先經 William 確認才能執行。
 */
function removeRichMenu() {
  const token = CONFIG.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error('尚未設定 LINE_TOKEN');
  const opt = function (method) {
    return { method: method, headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true };
  };
  // 1) 解除「所有好友預設選單」綁定
  const r1 = UrlFetchApp.fetch('https://api.line.me/v2/bot/user/all/richmenu', opt('delete'));
  Logger.log('解除預設綁定：HTTP ' + r1.getResponseCode());
  // 2) 刪除所有由 API 建立的圖文選單（OA Manager 後台做的選單不在此清單，不受影響）
  const list = JSON.parse(UrlFetchApp.fetch('https://api.line.me/v2/bot/richmenu/list', opt('get')).getContentText());
  (list.richmenus || []).forEach(function (m) {
    const r = UrlFetchApp.fetch('https://api.line.me/v2/bot/richmenu/' + m.richMenuId, opt('delete'));
    Logger.log('刪除 ' + m.richMenuId + '（' + m.name + '）：HTTP ' + r.getResponseCode());
  });
  // 3) 確認清空
  const after = UrlFetchApp.fetch('https://api.line.me/v2/bot/richmenu/list', opt('get')).getContentText();
  Logger.log('剩餘 API 選單：' + after);
  Logger.log('✅ 完成。OA Manager 後台的原始圖文選單將重新顯示（手機端可能需重開聊天室）。');
}
