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
  const students = readAll_(CONFIG.SHEETS.students)
    .filter(function (s) { return s.status === 'active' && s.line_user_id; });

  students.forEach(function (student) {
    const deadlines = upcomingDeadlines_(student, 31);
    if (!deadlines.length) return;
    const lines = deadlines.map(function (d) {
      return '▸ ' + formatDate_(d.due_at) + '　' + d.title;
    });
    const text = '📚 ' + student.name + ' 同學，本月學習歷程重要時程：\n\n' +
      lines.join('\n') +
      '\n\n📌 打開平台查看細節與你的素材進度。錯過勾選截止日，資料將無法送交審查，請務必留意！';
    const ok = pushLine_(student.line_user_id, text);
    logReminder_(student.student_id, deadlines[0].deadline_id, 30, ok);
  });
}

function sendWeeklyDigestIfNeeded() {
  const students = readAll_(CONFIG.SHEETS.students)
    .filter(function (s) { return s.status === 'active' && s.line_user_id; });

  students.forEach(function (student) {
    const deadlines = upcomingDeadlines_(student, 7);
    if (!deadlines.length) return;
    const lines = deadlines.map(function (d) {
      return '⏰ ' + formatDate_(d.due_at) + '　' + d.title;
    });
    const text = '❗ 一週內截止提醒\n\n' + lines.join('\n') + '\n\n還沒完成的項目請把握時間！';
    const ok = pushLine_(student.line_user_id, text);
    logReminder_(student.student_id, deadlines[0].deadline_id, 7, ok);
  });
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
