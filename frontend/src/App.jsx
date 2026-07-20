import { useEffect, useMemo, useState } from 'react';
import { api, setToken, fileToBase64 } from './api.js';

/* ============ 常數 ============ */

const SUBCATS = {
  course_result: ['書面報告', '實作作品', '探究與實作成果', '專題實作（技高B-1）', '實習科目成果（技高B-1）', '學習單整理', '其他課程成果'],
  diverse: ['自主學習', '特殊優良表現', '社團活動', '競賽表現', '檢定證照', '服務學習/志工', '幹部經歷', '非修課成果作品', '彈性學習', '其他'],
};

/**
 * 多元表現官方八項＋全國校系採計率（高點EDC彙整個申資料，2026-07 查證）。
 * 給孩子「明確指令」：照採計率排序，先存最多校系要看的。
 */
const DIVERSE_PRIORITY = [
  ['自主學習計畫與成果', '87%', '最重要！近九成校系採計。主題不用大，「自己想學＋有紀錄＋有成果」就成立'],
  ['特殊優良表現證明', '48%', '獎狀、入選、發表——任何「被肯定」的證明都算'],
  ['社團活動經驗', '45%', '重點寫你的角色與貢獻，不是社團名稱'],
  ['競賽表現', '34%', '校內外都算，名次不是重點，過程反思才是'],
  ['檢定證照', '27%', '英檢、乙丙級證照——考到當學期就存'],
  ['服務學習經驗', '23%', '持續性勝過次數，寫你觀察到什麼'],
  ['擔任幹部經驗', '20%', '具體做了什麼決定、解決什麼問題'],
  ['非修課紀錄之成果作品', '20%', '課外自己做的作品：程式、影片、手作都算'],
];

const COURSE_TYPES = {
  general: [
    ['書面報告', '課堂報告、小論文——開頭放摘要，寫清楚哪門課、為什麼做'],
    ['實作作品', '作品照片＋製作過程＋你的取捨判斷'],
    ['自然科學領域探究與實作成果', '普高必修，個申常客——卡關與修正過程最有價值'],
    ['社會領域探究活動成果', '議題探究、訪查報告'],
  ],
  vocational: [
    ['專題實作（B-1）', '四技甄選多數系必採！每個階段都留紀錄：構想→製作→除錯→成品'],
    ['實習科目學習成果（B-1）', '實習課的實作照片＋操作步驟外「你的判斷與調整」'],
    ['其他課程學習成果（B-2）', '專業科目報告、學科報告'],
  ],
};

/**
 * 每學期建議累積的素材 — 依 108 課綱審查趨勢整理
 * （招聯會「三重二不」、作伙學審議計畫、大學教授訪談彙整；詳見專案研究報告）
 */
const GUIDE = {
  general: {
    course: [
      '課堂書面報告、小論文：開頭放摘要，寫清楚「哪門課、為什麼做」',
      '探究與實作紀錄：卡住的地方＋怎麼解決，過程比完美結果更加分',
      '學習單別直接掃描上傳——加上自己的整理與反思，才算「成果」',
    ],
    diverse: [
      '自主學習計畫與成果：教授最重視的熱忱證明',
      '社團／幹部／志工：挑「有你的角色與成長」的，避免人人都有的制式證明',
      '從日常生活長出來的探究（自製作品、幫家裡解決問題）勝過昂貴營隊',
    ],
    tip: '存之前問自己：「如果不放備審，我還想不想做這件事？」——想，就值得存。',
  },
  vocational: {
    course: [
      '專題製作＋實習報告：四技甄選必採核心（B-1），每個階段都留紀錄',
      '實習課實作照片＋解決問題的過程：失敗再修正的紀錄最有價值',
      '專業科目報告：寫下操作步驟之外「你的判斷與調整」',
    ],
    diverse: [
      '檢定證照（乙級尤佳）與技藝競賽：甄選可直接加分，考到就存',
      '自主學習、社團與幹部經歷、校內活動',
      '業界參訪／校外實習心得：連結你的科別與升學志向',
    ],
    tip: '每學期存 2–3 件就很夠。備審是「挑」出來的，重點是反思，不是塞好塞滿。',
  },
};

/**
 * 目前學年（民國學年度），由日期自動計算。
 * 每年 7/1 切換到新學年 — 配合暑假維護名單的節奏：
 * 每年 7 月請把 students 分頁的 grade 全部 +1（畢業生把 status 改 inactive）。
 */
function currentAcademicYear() {
  const now = new Date();
  const roc = now.getFullYear() - 1911;
  return now.getMonth() + 1 >= 7 ? roc : roc - 1;
}

/** 由年級推算學生的六個學期代碼（例：11年級、115學年 → 114-1 起共六格） */
function semestersFor(grade) {
  const entryYear = currentAcademicYear() - (Number(grade) - 10);
  const list = [];
  for (let y = 0; y < 3; y++) for (let s = 1; s <= 2; s++) list.push(`${entryYear + y}-${s}`);
  return list;
}

/** 目前學期代碼（例：115-1）。7 月起視為新學年第 1 學期、2–6 月為第 2 學期 */
function currentSemester() {
  const m = new Date().getMonth() + 1;
  const sem = (m >= 7 || m === 1) ? 1 : 2;
  return `${currentAcademicYear()}-${sem}`;
}

/** 學期相對現在的狀態：past / now / future */
function semState(sem) {
  const [y, t] = String(sem).split('-').map(Number);
  const [cy, ct] = currentSemester().split('-').map(Number);
  const a = y * 2 + t, b = cy * 2 + ct;
  return a === b ? 'now' : a < b ? 'past' : 'future';
}

function daysUntil(iso) {
  return Math.ceil((new Date(iso) - new Date()) / 86400000);
}

/* ============ App ============ */

export default function App() {
  const [student, setStudent] = useState(null);
  const [tab, setTab] = useState('dashboard');
  const [quickAdd, setQuickAdd] = useState(null); // null | { semester }
  const [editAnchor, setEditAnchor] = useState(false);

  function goQuickAdd(semester) { setQuickAdd({ semester: semester || null }); setTab('artifacts'); }

  if (!student) return <Login onDone={(u) => { setStudent(u); setTab(u.role === 'teacher' ? 'students' : 'dashboard'); }} />;

  const isTeacher = student.role === 'teacher';
  if (!isTeacher && (!student.focus_anchor || editAnchor)) {
    return <Onboarding student={student} onDone={(u) => { setStudent(u); setEditAnchor(false); }} />;
  }
  const tabs = isTeacher
    ? [['students', '學生總表'], ['deadlines', '時程管理'], ['reminders', '提醒']]
    : [['dashboard', '總覽'], ['artifacts', '素材倉庫'], ['timeline', '時程']];

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          TIPS 學習歷程<small>{student.name}{isTeacher ? '（老師）' : ''}</small>
        </div>
        {!isTeacher && <button onClick={() => setEditAnchor(true)}>科別／組別</button>}
        <button onClick={() => { setToken(null); setStudent(null); }}>登出</button>
      </header>

      {!isTeacher && tab === 'dashboard' && <Dashboard student={student} onQuickAdd={goQuickAdd} />}
      {!isTeacher && tab === 'artifacts' && <Artifacts student={student} autoOpen={quickAdd} onAutoOpenDone={() => setQuickAdd(null)} />}
      {!isTeacher && tab === 'timeline' && <Timeline />}
      {isTeacher && tab === 'students' && <TeacherStudents />}
      {isTeacher && tab === 'deadlines' && <TeacherDeadlines />}
      {isTeacher && tab === 'reminders' && <TeacherReminders />}

      <nav className="tabbar">
        {tabs.map(([key, label]) => (
          <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

/* ============ 首次設定：主方向錨 ============ */
/* 技高常見科別（datalist 快選；學生也可自己打，任何科教練都吃得到） */
const VOC_COMMON = ['電機科','電子科','資訊科','控制科','冷凍空調科','機械科','模具科','製圖科','電腦機械製圖科','機電科','板金科','汽車科','飛機修護科','動力機械科','化工科','紡織科','土木科','建築科','消防工程科','商業經營科','資料處理科','會計事務科','國際貿易科','電子商務科','流通管理科','應用外語科','廣告設計科','室內設計科','美工科','圖文傳播科','多媒體設計科','農場經營科','園藝科','森林科','畜產保健科','食品加工科','烘焙科','水產食品科','家政科','服裝科','幼兒保育科','美容科','時尚模特兒科','觀光事業科','餐飲管理科','漁業科','水產養殖科','輪機科','航海科','音樂科','美術科','舞蹈科','戲劇科','表演藝術科','電影電視科','多媒體動畫科'];

function Onboarding({ student, onDone }) {
  const isUS = student.school_type === 'us';
  const isVoc = student.school_type === 'vocational';
  const [anchor, setAnchor] = useState(student.focus_anchor || '');
  const [rigor, setRigor] = useState(student.rigor_track || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    const focus = String(anchor || '').trim();
    if (!focus) { setErr(isVoc ? '請輸入或選擇你的科別' : '請先選一個'); return; }
    setBusy(true); setErr('');
    try {
      await api('saveProfile', { focus_anchor: focus, ...(isUS ? { rigor_track: rigor } : {}) });
      // 用本地選的值直接放行，不依賴後端回傳（避免卡在設定頁）
      onDone({ ...student, focus_anchor: focus, ...(isUS ? { rigor_track: rigor } : {}) });
    } catch (e) {
      setErr(e.message || '儲存失敗，請再試一次');
      setBusy(false);
    }
  }

  return (
    <div className="shell">
      <div className="login-card" style={{ maxWidth: 460, margin: '40px auto' }}>
        <h1>先設定一下 👋</h1>

        {isVoc && (
          <>
            <p className="sub">輸入你的科別，教練才知道該建議什麼專題、證照與實習成果。可以打字，或從常見清單挑。</p>
            <label htmlFor="ob-a">你的科別</label>
            <input id="ob-a" list="voc-list" value={anchor} onChange={(e) => setAnchor(e.target.value)} placeholder="例：電機科、汽車科、餐飲管理科" />
            <datalist id="voc-list">{VOC_COMMON.map((s) => <option key={s} value={s} />)}</datalist>
          </>
        )}

        {!isVoc && !isUS && (
          <>
            <p className="sub">高二才分組，高一可先選「未分組」。教練會依你的方向給建議。</p>
            <label htmlFor="ob-a">你的類組</label>
            <select id="ob-a" value={anchor} onChange={(e) => setAnchor(e.target.value)}>
              <option value="">請選擇…</option>
              <option value="science">自然組</option>
              <option value="social">社會組</option>
              <option value="undecided">高一 / 未分組</option>
            </select>
          </>
        )}

        {isUS && (
          <>
            <p className="sub">Pick the direction you lean toward — you can change it anytime.</p>
            <label htmlFor="ob-a">Intended focus</label>
            <select id="ob-a" value={anchor} onChange={(e) => setAnchor(e.target.value)}>
              <option value="">Select…</option>
              <option value="cs">CS / Engineering</option>
              <option value="premed">Life Sciences / Pre-med</option>
              <option value="biz">Business / Economics</option>
              <option value="hum">Humanities / Social Science</option>
              <option value="arts">Arts / Design</option>
              <option value="explore">Still exploring</option>
            </select>
            <label htmlFor="ob-r">Highest course rigor available（選填）</label>
            <select id="ob-r" value={rigor} onChange={(e) => setRigor(e.target.value)}>
              <option value="">—</option>
              <option value="honors">Honors</option>
              <option value="ap">AP</option>
              <option value="ib">IB</option>
              <option value="dual">Dual Enrollment</option>
              <option value="regular">Regular only</option>
            </select>
          </>
        )}

        {err && <p className="err">{err}</p>}
        <button className="btn cta-big" disabled={busy} onClick={save} style={{ marginTop: 16 }}>
          {busy ? '儲存中…' : '完成，開始使用'}
        </button>
      </div>
    </div>
  );
}

/* ============ 登入 ============ */

function Login({ onDone }) {
  const [mode, setMode] = useState('login'); // 'login' | 'signup' | 'created'
  const [studentId, setStudentId] = useState('');
  const [loginCode, setLoginCode] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [grade, setGrade] = useState('9');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [created, setCreated] = useState(null);

  async function submit() {
    setBusy(true); setErr('');
    try {
      const data = await api('login', { studentId, loginCode });
      setToken(data.token);
      onDone(data.student);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  async function signup() {
    if (!name.trim() || email.indexOf('@') < 1) { setErr('Please enter the student\'s name and a valid email.'); return; }
    setBusy(true); setErr('');
    try {
      const d = await api('signup', { name: name.trim(), email: email.trim(), grade });
      setCreated(d);
      setMode('created');
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  function enterApp() {
    setToken(created.token);
    onDone(created.student);
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        {mode === 'login' && (
          <>
            <h1>把三年的努力，<br /><span className="hl">一格一格存下來</span></h1>
            <p className="sub">TIPS 學習歷程平台 — 素材隨手存，備審不慌張</p>
            <label htmlFor="sid">學號 / Student ID</label>
            <input id="sid" value={studentId} onChange={(e) => setStudentId(e.target.value)} placeholder="S000123 / US000123" autoComplete="username" />
            <label htmlFor="code">登入代碼 / Login code</label>
            <input id="code" value={loginCode} onChange={(e) => setLoginCode(e.target.value)} placeholder="8 碼代碼 / 8-character code" autoComplete="current-password" />
            <button className="btn" onClick={submit} disabled={busy}>{busy ? '登入中… / Signing in…' : '登入 / Log in'}</button>
            {err && <p className="err">{err}</p>}
            <button className="btn-sm" style={{ marginTop: 14 }} onClick={() => { setErr(''); setMode('signup'); }}>New family? Sign up free →</button>
          </>
        )}

        {mode === 'signup' && (
          <>
            <h1>Start free 👋</h1>
            <p className="sub">Create your student account and capture the real work over four years. No credit card.</p>
            <label htmlFor="su-name">Student's name</label>
            <input id="su-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Maya Chen" />
            <label htmlFor="su-email">Parent or student email</label>
            <input id="su-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" autoComplete="email" />
            <label htmlFor="su-grade">Current grade</label>
            <select id="su-grade" value={grade} onChange={(e) => setGrade(e.target.value)}>
              <option value="9">Grade 9</option>
              <option value="10">Grade 10</option>
              <option value="11">Grade 11</option>
              <option value="12">Grade 12</option>
            </select>
            <button className="btn" style={{ marginTop: 14 }} onClick={signup} disabled={busy}>{busy ? 'Creating…' : 'Create free account'}</button>
            {err && <p className="err">{err}</p>}
            <button className="btn-sm" style={{ marginTop: 14 }} onClick={() => { setErr(''); setMode('login'); }}>← Already have an account? Log in</button>
          </>
        )}

        {mode === 'created' && created && (
          <>
            <h1>You're in 🎉</h1>
            <p className="sub">Save your login — you'll use it next time to sign in:</p>
            <div style={{ background: '#fff', border: '1.5px solid var(--ink)', borderRadius: 10, padding: '12px 14px', margin: '6px 0 14px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.95rem' }}>Student ID: <b>{created.studentId}</b></div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.95rem', marginTop: 4 }}>Login code: <b>{created.loginCode}</b></div>
            </div>
            <button className="btn" onClick={enterApp}>Continue →</button>
          </>
        )}
      </div>
    </div>
  );
}

/* ============ 總覽：三年學期格子 ============ */

function Dashboard({ student, onQuickAdd }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const semesters = useMemo(() => semestersFor(student.grade), [student.grade]);

  useEffect(() => {
    api('dashboard').then(setData).catch((e) => setErr(e.message));
  }, []);

  if (err) return <p className="err">{err}</p>;
  if (!data) return <p className="empty-hint">載入中…</p>;

  const voc = student.school_type === 'vocational';

  return (
    <>
      <button className="btn cta-big" onClick={() => onQuickAdd()}>📸 快拍存素材（存到本學期）</button>
      <p className="hint" style={{ marginTop: -8 }}>你的學制：<b className="hl">{voc ? '技術型高中（技高）' : '普通型高中（普高）'}</b>——本頁的額度、指引、按鈕都是你的學制專屬版本。</p>

      <h2>三年進度 <span className="hl">共 {data.total} 件素材</span></h2>
      {[0, 1, 2].map((y) => {
        const yearSems = semesters.slice(y * 2, y * 2 + 2);
        const ay = yearSems[0].split('-')[0];
        let yc = 0, yd = 0;
        yearSems.forEach((s) => { const b = data.bySemester[s]; if (b) { yc += b.course; yd += b.diverse; } });
        return (
          <div key={ay} className="year-block">
            <div className="year-head">
              <span className="year-name">高{['一', '二', '三'][y]}（{ay} 學年）</span>
              <span className="year-quota">課程成果 <b>{yc}</b>/6・多元 <b>{yd}</b>/10<small>　中央勾選額度</small></span>
            </div>
            <div className="sem-grid2">
              {yearSems.map((sem) => {
                const b = data.bySemester[sem] || { course: 0, diverse: 0 };
                const st = semState(sem);
                return (
                  <div key={sem} className={`sem-cell2 ${st}`}>
                    <div className="sem-name">{sem}{st === 'now' && <span className="now-badge">本學期</span>}</div>
                    <div className="sem-split2">課程成果 <b>{b.course}</b> 件・多元 <b>{b.diverse}</b> 件</div>
                    {st === 'future'
                      ? <span className="sem-lock">還沒開始</span>
                      : <button className="btn-sm sem-add" onClick={() => onQuickAdd(sem)}>＋ 存到這學期</button>}
                    {st === 'now' && b.course + b.diverse === 0 && (
                      <p className="cell-nudge">這學期還空著——先存 1 件，就贏過放棄學檔的那 40% 的人</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      <p className="hint"><span className="hl">課程學習成果只能在修課當學期上傳學校平台＋老師認證，逾期無法補件</span>（只在高一開的課，就只能在高一上傳）；多元表現可跨學年補傳，點過去學期的「＋」就能補。</p>

      <CategoryGuide schoolType={student.school_type} />

      <p className="hint">
        每個校系參採的項目都不一樣，挑素材前先查目標校系的公告：
        {voc
          ? <a href="https://gotech.ntust.edu.tw/" target="_blank" rel="noreferrer">四技二專備審資料準備指引平台</a>
          : <a href="https://collego.edu.tw/" target="_blank" rel="noreferrer">ColleGo! 大學校系參採查詢</a>}
        ；{voc ? '四技甄選各系件數自訂（B-1 至少 1 件）' : '個申各系至多參採 3＋10 件'}。
      </p>

      <SemesterGuide schoolType={student.school_type} />

      <h2>90 天內的截止日</h2>
      <DeadlineList items={data.upcoming} emptyText="接下來 90 天沒有截止日，可以安心累積素材。" />
    </>
  );
}

/** 該存什麼？官方類別＋全國採計率 — 給孩子最明確的指令 */
function CategoryGuide({ schoolType }) {
  const courses = COURSE_TYPES[schoolType] || COURSE_TYPES.general;
  return (
    <div className="cat-guide">
      <h2>該存什麼？<span className="hl">照這個清單存就對了</span></h2>

      <div className="cat-card">
        <h3>📘 課程學習成果 <small>每學年勾選上限 6 件・須老師認證</small></h3>
        <ul>
          {courses.map(([name, desc]) => (
            <li key={name}><b>{name}</b>：{desc}</li>
          ))}
        </ul>
      </div>

      <div className="cat-card">
        <h3>🌟 多元表現 <small>每學年勾選上限 10 件・免認證・可跨學年補傳</small></h3>
        <p className="hint" style={{ margin: '4px 0 8px' }}>右邊百分比＝全國有多少校系採計這一項。先存排前面的，CP 值最高：</p>
        <ul>
          {DIVERSE_PRIORITY.map(([name, pct, desc]) => (
            <li key={name}><span className="pct">{pct}</span><b>{name}</b>：{desc}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** 這學期可以存什麼 — 依學制顯示建議 */
function SemesterGuide({ schoolType }) {
  const guide = GUIDE[schoolType] || GUIDE.general;
  return (
    <>
      <h2>
        這學期可以存什麼 <span className="hl">{schoolType === 'vocational' ? '技高版' : '普高版'}</span>
      </h2>
      <div className="guide-grid">
        <div className="guide-card">
          <span className="tag course">課程學習成果</span>
          <ul>
            {guide.course.map((t) => <li key={t}>{t}</li>)}
          </ul>
        </div>
        <div className="guide-card">
          <span className="tag diverse">多元表現</span>
          <ul>
            {guide.diverse.map((t) => <li key={t}>{t}</li>)}
          </ul>
        </div>
      </div>
      <p className="hint">
        {guide.tip} 申請時大學至多參採 3 件課程成果＋10 件多元表現——重質不重量、重反思。
      </p>
    </>
  );
}

/** 本學年中央資料庫勾選額度提示（課程成果 6／多元 10） */
function QuotaBar({ bySemester, schoolType }) {
  const ay = currentAcademicYear();
  let course = 0, diverse = 0;
  Object.keys(bySemester || {}).forEach((sem) => {
    if (sem.startsWith(`${ay}-`)) {
      course += bySemester[sem].course || 0;
      diverse += bySemester[sem].diverse || 0;
    }
  });
  return (
    <p className="hint">
      本學年（{ay}）素材累積：課程成果 <b>{course}</b> 件・多元表現 <b>{diverse}</b> 件
      <br />提醒：每學年勾選中央資料庫上限＝課程成果 <b>6</b> 件、多元表現 <b>10</b> 件（上傳學校平台的數量依各校規定）。
      {schoolType === 'vocational'
        ? <>四技甄選第二階段的<b>件數由各系自訂（未必是 3＋10）</b>，專題實作 B-1 至少 1 件，請逐系查簡章與指引平台。</>
        : <>大學個人申請時各校系至多參採 3＋10 件，重點是挑出最好的，不是塞滿。</>}
    </p>
  );
}

/* ============ AI 反思教練（Phase 2） ============ */

function ArtifactCoach({ artifact }) {
  const [mode, setMode] = useState(null);
  const [draft, setDraft] = useState(artifact.summary_100 || '');
  const [out, setOut] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function ask(action, payload) {
    setBusy(true); setErr(''); setOut('');
    try { const d = await api(action, payload); setOut(d.text); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="coach">
      <div className="coach-btns">
        <button className="btn-sm" disabled={busy}
          onClick={() => { setMode('reflect'); ask('aiReflect', { artifact_id: artifact.artifact_id }); }}>
          🧑‍🏫 教練引導反思
        </button>
        <button className="btn-sm" disabled={busy}
          onClick={() => setMode(mode === 'summary' ? null : 'summary')}>
          ✍️ 百字簡述健檢
        </button>
      </div>
      {mode === 'summary' && (
        <div className="coach-draft">
          <textarea rows="3" value={draft} onChange={(e) => setDraft(e.target.value)}
            placeholder="先寫下你的 100 字簡述草稿（幾句話就好），教練才能給建議…" />
          <button className="btn-sm" disabled={busy || !draft.trim()}
            onClick={() => ask('aiSummary', { artifact_id: artifact.artifact_id, draft })}>
            送給教練檢查
          </button>
        </div>
      )}
      {busy && <p className="empty-hint">教練思考中…（約 10–20 秒）</p>}
      {err && <p className="err">{err}</p>}
      {out && (
        <div className="coach-out">
          <pre>{out}</pre>
          <button className="btn-sm" onClick={() => navigator.clipboard.writeText(out)}>複製教練回覆</button>
        </div>
      )}
    </div>
  );
}

function SynthesisCoach() {
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState('');
  const [out, setOut] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function run() {
    setBusy(true); setErr(''); setOut('');
    try { const d = await api('aiSynthesis', { focus }); setOut(d.text); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="coach coach-syn">
      <button className="btn-ghost" onClick={() => setOpen(!open)}>
        🎓 綜整心得教練{open ? '（收起）' : ''}
      </button>
      {open && (
        <div className="coach-draft">
          <p className="empty-hint">教練會讀你的整個素材倉庫，幫你找出主題軸線和段落架構（適合高三準備「多元表現綜整心得」，最多 800 字）。</p>
          <input value={focus} onChange={(e) => setFocus(e.target.value)}
            placeholder="想強調的方向（選填），例：程式能力的累積" />
          <button className="btn-sm" disabled={busy} onClick={run}>請教練規劃架構</button>
          {busy && <p className="empty-hint">教練整理你的三年素材中…（約 20–30 秒）</p>}
          {err && <p className="err">{err}</p>}
          {out && (
            <div className="coach-out">
              <pre>{out}</pre>
              <button className="btn-sm" onClick={() => navigator.clipboard.writeText(out)}>複製教練回覆</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ============ 校內平台狀態＋上傳包 ============ */

const SCHOOL_STATUS = [
  ['', '未上傳校內'],
  ['editing', '編輯中'],
  ['submitted', '已送認證'],
  ['certified', '認證成功'],
];

function ArtifactPack({ artifact, onChanged }) {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState(artifact.summary_100 || '');
  const [status, setStatus] = useState(artifact.is_uploaded_to_school || '');
  const [checked, setChecked] = useState(!!artifact.is_checked_to_central && artifact.is_checked_to_central !== 'false');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function save(patch, okMsg) {
    setBusy(true); setMsg('');
    try { await api('updateArtifact', { artifact_id: artifact.artifact_id, ...patch }); setMsg(okMsg); onChanged && onChanged(); }
    catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  const isCourse = artifact.category === 'course_result';

  return (
    <div className="pack">
      <div className="status-row">
        {SCHOOL_STATUS.map(([val, label]) => (
          <button key={val} disabled={busy}
            className={`chip ${status === val ? 'on' : ''} ${val === 'editing' && status === 'editing' ? 'warn' : ''}`}
            onClick={() => { setStatus(val); save({ is_uploaded_to_school: val }, '狀態已更新'); }}>
            {label}
          </button>
        ))}
        <label className="chip-check">
          <input type="checkbox" checked={checked} disabled={busy}
            onChange={(e) => { setChecked(e.target.checked); save({ is_checked_to_central: e.target.checked }, '已更新'); }} />
          已勾選中央
        </label>
      </div>
      {status === 'editing' && (
        <p className="err">⚠️ 停在「編輯中」老師收不到！到校內平台按下「送出認證」後，回來把狀態改成「已送認證」。</p>
      )}

      <button className="btn-sm" onClick={() => setOpen(!open)}>📦 上傳包{open ? '（收起）' : '——帶去校內平台 2 分鐘搞定'}</button>
      {open && (
        <div className="pack-body">
          <p><b>步驟 1・檔案</b>：{artifact.file_url
            ? <><a href={artifact.file_url} target="_blank" rel="noreferrer">開啟檔案</a>（下載後上傳到校內平台，已符合 4MB 規格）</>
            : '這件還沒有附件——可以先補上傳，或直接在校內平台貼文字。'}</p>
          <p style={{ marginBottom: 4 }}><b>步驟 2・100 字簡述</b>（{summary.length}/100 字）：</p>
          <textarea rows="3" value={summary} onChange={(e) => setSummary(e.target.value)}
            placeholder="還沒寫？先按上面的「百字簡述健檢」讓教練幫你。" />
          <div className="coach-btns">
            <button className="btn-sm" disabled={busy} onClick={() => save({ summary_100: summary }, '簡述已儲存')}>儲存簡述</button>
            <button className="btn-sm" disabled={!summary} onClick={() => { navigator.clipboard.writeText(summary); setMsg('已複製，去校內平台貼上！'); }}>複製簡述</button>
          </div>
          <p style={{ marginTop: 8 }}><b>步驟 3・{isCourse ? '按「送出認證」' : '送出'}</b>：{isCourse
            ? '上傳後一定要按「送出認證」！然後回來把上面狀態改成「已送認證」。'
            : '多元表現免認證，上傳完成後把狀態改成「已送認證」即可。'}</p>
          {msg && <p className="ok-msg">{msg}</p>}
        </div>
      )}
    </div>
  );
}

/* ============ 素材倉庫 ============ */

function Artifacts({ student, autoOpen, onAutoOpenDone }) {
  const [list, setList] = useState(null);
  const [showForm, setShowForm] = useState(!!autoOpen);
  const [initSem, setInitSem] = useState(autoOpen ? autoOpen.semester : null);
  const [err, setErr] = useState('');

  function reload() {
    api('listArtifacts').then(setList).catch((e) => setErr(e.message));
  }
  useEffect(reload, []);
  useEffect(() => {
    if (autoOpen) { setShowForm(true); setInitSem(autoOpen.semester); onAutoOpenDone && onAutoOpenDone(); }
  }, [autoOpen]);

  async function remove(id) {
    if (!confirm('確定要刪除這件素材嗎？（30 天內可請老師復原）')) return;
    try { await api('deleteArtifact', { artifact_id: id }); reload(); }
    catch (e) { setErr(e.message); }
  }

  return (
    <>
      <h2>素材倉庫</h2>
      <button className="btn" onClick={() => setShowForm(!showForm)}>
        {showForm ? '收起表單' : '＋ 新增素材'}
      </button>
      {showForm && <ArtifactForm key={initSem || 'now'} student={student} initialSemester={initSem} onSaved={() => { setShowForm(false); setInitSem(null); reload(); }} />}
      <SynthesisCoach />
      {err && <p className="err">{err}</p>}

      {list === null && <p className="empty-hint">載入中…</p>}
      {list && list.length === 0 && (
        <p className="empty-hint">還沒有素材。拍下今天的學習單或活動照片，就是第一步。</p>
      )}
      {list && list.map((a) => (
        <article key={a.artifact_id} className="artifact" style={{ marginTop: 14 }}>
          <div className="a-head">
            <span className="a-title">{a.title}</span>
            <span className={`tag ${a.category === 'course_result' ? 'course' : 'diverse'}`}>
              {a.category === 'course_result' ? '課程成果' : '多元表現'}
            </span>
          </div>
          <div className="a-meta">{a.semester}｜{a.subcategory}{a.subject_or_event ? `｜${a.subject_or_event}` : ''}</div>
          {a.quick_note && <p className="a-note">{a.quick_note}</p>}
          {a.file_url && <p className="a-note"><a href={a.file_url} target="_blank" rel="noreferrer">查看檔案</a>{a.file_size_mb ? `（${a.file_size_mb}MB）` : ''}</p>}
          <ArtifactPack artifact={a} />
          <ArtifactCoach artifact={a} />
          <button className="a-del" onClick={() => remove(a.artifact_id)}>刪除</button>
        </article>
      ))}
    </>
  );
}

/** 圖片自動壓縮到規格內（4MB）——研究實證「壓縮地獄」是學生一大痛點，平台代勞 */
async function compressImage(file, limitMB) {
  const bmp = await createImageBitmap(file);
  let scale = Math.min(1, Math.sqrt((limitMB * 1048576 * 0.9) / file.size));
  for (const q of [0.85, 0.75, 0.6, 0.5]) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bmp.width * scale));
    canvas.height = Math.max(1, Math.round(bmp.height * scale));
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', q));
    if (blob && blob.size <= limitMB * 1048576) {
      return new File([blob], file.name.replace(/\.(png|jpg|jpeg)$/i, '') + '.jpg', { type: 'image/jpeg' });
    }
    scale *= 0.8;
  }
  return null;
}

function ArtifactForm({ student, onSaved, initialSemester }) {
  const semesters = useMemo(() => semestersFor(student.grade), [student.grade]);
  const nowSem = currentSemester();
  const startSem = (initialSemester && semesters.includes(initialSemester)) ? initialSemester
    : (semesters.includes(nowSem) ? nowSem : semesters[0]);
  const isPastTarget = initialSemester && semState(initialSemester) === 'past';
  const [form, setForm] = useState({
    title: '', category: isPastTarget ? 'diverse' : 'course_result',
    subcategory: SUBCATS[isPastTarget ? 'diverse' : 'course_result'][0],
    semester: startSem, subject_or_event: '', quick_note: '',
  });
  const [file, setFile] = useState(null);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [sugg, setSugg] = useState(null);
  const [sBusy, setSBusy] = useState(false);

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v, ...(k === 'category' ? { subcategory: SUBCATS[v][0] } : {}) }));
  }

  async function askCoach() {
    setSBusy(true); setErr('');
    try {
      const d = await api('aiSuggest', { semester: form.semester });
      setSugg(d.suggestions || []);
    } catch (e) { setErr(e.message); }
    finally { setSBusy(false); }
  }
  function applySugg(s) {
    setForm((f) => {
      const category = (s.category === 'diverse' || s.category === 'course_result') ? s.category : f.category;
      const subs = SUBCATS[category] || [];
      const subcategory = subs.includes(s.subcategory) ? s.subcategory : subs[0];
      return { ...f, title: s.title || f.title, category, subcategory };
    });
    setSugg(null);
  }

  async function submit() {
    if (!form.title) { setErr('請輸入素材名稱'); return; }
    setBusy(true); setErr(''); setMsg('');
    try {
      let filePart = {};
      if (file) {
        let f = file;
        const fname0 = f.name.toLowerCase();
        const isMedia = /\.(mp3|mp4)$/.test(fname0);
        const isImage = /\.(jpg|jpeg|png)$/.test(fname0);
        const isDoc = isImage || fname0.endsWith('.pdf');
        if (!isDoc && !isMedia) {
          throw new Error('中央資料庫只收 PDF／JPG／PNG（文件）與 MP3／MP4（影音），請先轉檔再上傳（例：Word 請先另存成 PDF）');
        }
        const limit = isMedia ? 10 : 4;
        if (f.size / 1048576 > limit) {
          if (isImage) {
            setMsg('照片超過 4MB，自動壓縮中…');
            f = await compressImage(f, 4);
            if (!f) throw new Error('照片壓不進 4MB，請改用截圖或縮小後再傳');
          } else {
            throw new Error(`檔案超過 ${limit}MB 上限（中央資料庫規範），請先壓縮`);
          }
        }
        setMsg('檔案上傳中…');
        const base64 = await fileToBase64(f);
        const up = await api('uploadFile', { base64, filename: f.name, mimeType: f.type });
        filePart = { file_url: up.file_url, file_size_mb: up.file_size_mb, file_type: isMedia ? 'video_link' : (f.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'image') };
      }
      await api('createArtifact', { ...form, ...filePart });
      setMsg('已儲存！');
      onSaved();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <p className="hint" style={{ marginTop: 0 }}>只要<b>名稱＋照片</b>就能存，30 秒搞定。分類先用預設值，之後隨時可改。</p>

      <div style={{ margin: '4px 0 2px' }}>
        {!sugg && (
          <button className="btn-sm" disabled={sBusy} onClick={askCoach}>
            {sBusy ? '教練思考中…（約 10 秒）' : '✦ 不知道存什麼？問教練該存什麼'}
          </button>
        )}
        {sugg && (
          <div>
            <p className="hint" style={{ marginTop: 6 }}>教練建議這學期可以存這些（點一下帶入名稱）：</p>
            {sugg.length === 0 && <p className="empty-hint">教練暫時沒有建議，先自己存一件吧。</p>}
            {sugg.map((s, i) => (
              <button key={i} type="button" onClick={() => applySugg(s)} style={{ display: 'block', width: '100%', textAlign: 'left', border: '1.5px solid var(--rule)', borderRadius: 10, background: '#fff', padding: '9px 11px', marginBottom: 8, cursor: 'pointer' }}>
                <b style={{ display: 'block', fontSize: '0.9rem', color: 'var(--ink)' }}>{s.title}</b>
                <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--graphite)', marginTop: 2, lineHeight: 1.45 }}>{s.hint}</span>
                <span style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--ink)', marginTop: 5 }}>＋ 點我帶入名稱</span>
              </button>
            ))}
            <p className="hint" style={{ fontSize: '0.72rem' }}>教練只給方向與拍攝提示，內容與反思由你自己寫；作品會標記「曾用 AI 引導」。</p>
            <button className="btn-sm" type="button" onClick={() => setSugg(null)}>↺ 收起／重新問</button>
          </div>
        )}
      </div>

      <label htmlFor="f-title">這是什麼？</label>
      <input id="f-title" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="例：專題期中成果、英文小論文、園遊會擺攤" />

      <label htmlFor="f-file">拍照或選檔案（超過 4MB 的照片會自動幫你壓縮）</label>
      <input id="f-file" type="file" accept=".pdf,.jpg,.jpeg,.png,.mp3,.mp4" capture="environment" onChange={(e) => setFile(e.target.files[0] || null)} />

      <label htmlFor="f-note">一句話速記（選填，之後寫反思會感謝現在的自己）</label>
      <textarea id="f-note" rows="2" value={form.quick_note} onChange={(e) => set('quick_note', e.target.value)} placeholder="今天做了什麼？卡在哪裡？" />

      <button className="adv-toggle" onClick={() => setMore(!more)}>
        {more ? '▴ 收起進階設定' : `▾ 進階設定（目前：${form.category === 'course_result' ? '課程成果' : '多元表現'}・${form.subcategory}・${form.semester}）`}
      </button>

      {more && (
        <div className="adv-body">
          <label htmlFor="f-cat">類別</label>
          <select id="f-cat" value={form.category} onChange={(e) => set('category', e.target.value)}>
            <option value="course_result">課程學習成果</option>
            <option value="diverse">多元表現</option>
          </select>

          <label htmlFor="f-sub">子類</label>
          <select id="f-sub" value={form.subcategory} onChange={(e) => set('subcategory', e.target.value)}>
            {SUBCATS[form.category].map((s) => <option key={s}>{s}</option>)}
          </select>

          <label htmlFor="f-sem">學期</label>
          <select id="f-sem" value={form.semester} onChange={(e) => set('semester', e.target.value)}>
            {semesters.map((s) => <option key={s}>{s}</option>)}
          </select>
          {form.category === 'course_result' && form.semester !== currentSemester() && (
            <p className="err">⚠️ 課程學習成果須在<b>修課當學期</b>上傳學校平台＋老師認證，逾期無法補件。你選了非本學期（本學期是 {currentSemester()}），請確認當時已在校內平台完成認證，否則只能當自己的紀錄。</p>
          )}
          {form.category === 'diverse' && (
            <p className="hint">多元表現免教師認證、可跨學年補傳，別忘了每學年勾選中央上限 10 件。</p>
          )}

          <label htmlFor="f-subj">科目／活動名稱</label>
          <input id="f-subj" value={form.subject_or_event} onChange={(e) => set('subject_or_event', e.target.value)} placeholder="例：電子學實習、校慶園遊會" />
        </div>
      )}

      <button className="btn" onClick={submit} disabled={busy}>{busy ? '儲存中…' : '存進倉庫 ✓'}</button>
      {msg && <p className="ok-msg">{msg}</p>}
      {err && <p className="err">{err}</p>}
    </div>
  );
}

/* ============ 老師後台 ============ */

const TASK_TYPES = {
  upload_course_result: '課程成果上傳',
  check_to_central: '勾選中央資料庫',
  upload_diverse: '多元表現上傳',
  other: '其他',
};

function TeacherStudents() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api('teacherOverview').then(setRows).catch((e) => setErr(e.message));
  }, []);

  if (err) return <p className="err">{err}</p>;
  if (!rows) return <p className="empty-hint">載入中…</p>;

  const noLine = rows.filter((r) => !r.has_line && r.status === 'active').length;

  return (
    <>
      <h2>學生進度總表 <span className="hl">共 {rows.length} 位</span></h2>
      {noLine > 0 && (
        <p className="hint">⚠️ {noLine} 位學生尚未綁定 LINE（line_user_id 空白），提醒不會發送給他們。</p>
      )}
      <div className="t-scroll">
        <table className="t-table">
          <thead>
            <tr>
              <th>學號</th><th>姓名</th><th>學校</th><th>年級</th><th>學制</th>
              <th>成果</th><th>多元</th><th>合計</th><th>卡編輯中</th><th>最近上傳</th><th>LINE</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.student_id} className={r.total === 0 ? 'warn-row' : ''}>
                <td className="mono">{r.student_id}</td>
                <td>{r.name}</td>
                <td>{r.school_name}</td>
                <td>{r.grade}</td>
                <td>{r.school_type === 'vocational' ? '技高' : '普高'}</td>
                <td>{r.course}</td>
                <td>{r.diverse}</td>
                <td><strong>{r.total}</strong></td>
                <td>{r.editing ? <span className="err" style={{ margin: 0 }}>{r.editing}</span> : '—'}</td>
                <td className="mono">{r.last_created_at ? String(r.last_created_at).slice(0, 10) : '—'}</td>
                <td>{r.has_line ? '✓' : '✗'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">紅字列＝還沒有任何素材的學生，開學初多提醒他們「隨手存」。</p>
    </>
  );
}

function TeacherDeadlines() {
  const [rows, setRows] = useState(null);
  const [editing, setEditing] = useState(null); // null=收起, {}=新增, {...}=編輯
  const [err, setErr] = useState('');

  function reload() {
    api('teacherDeadlines').then(setRows).catch((e) => setErr(e.message));
  }
  useEffect(reload, []);

  async function remove(id) {
    if (!confirm('確定要刪除這筆截止日嗎？')) return;
    try { await api('removeDeadline', { deadline_id: id }); reload(); }
    catch (e) { setErr(e.message); }
  }

  if (err) return <p className="err">{err}</p>;
  if (!rows) return <p className="empty-hint">載入中…</p>;

  return (
    <>
      <h2>時程管理</h2>
      <button className="btn" onClick={() => setEditing(editing ? null : {})}>
        {editing ? '收起表單' : '＋ 新增截止日'}
      </button>
      {editing && (
        <DeadlineForm
          initial={editing}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}
      {rows.length === 0 && <p className="empty-hint">目前沒有截止日。</p>}
      {rows.map((d) => {
        const past = new Date(d.due_at) < new Date();
        return (
          <article key={d.deadline_id} className="artifact" style={{ marginTop: 14, opacity: past ? 0.55 : 1 }}>
            <div className="a-head">
              <span className="a-title">{d.title}</span>
              <span className={`tag ${past ? '' : 'course'}`}>{past ? '已過期' : TASK_TYPES[d.task_type] || d.task_type}</span>
            </div>
            <div className="a-meta">
              {String(d.due_at).slice(0, 16).replace('T', ' ')}｜
              {d.school_type === 'all' ? '全部學制' : (d.school_type === 'vocational' ? '技高' : '普高')}｜
              {Number(d.grade) === 0 ? '全年級' : `${d.grade} 年級`}
              {d.semester ? `｜${d.semester}` : ''}
            </div>
            {d.note && <p className="a-note">{d.note}</p>}
            <button className="a-del" onClick={() => setEditing(d)}>編輯</button>
            <button className="a-del" onClick={() => remove(d.deadline_id)}>刪除</button>
          </article>
        );
      })}
    </>
  );
}

function DeadlineForm({ initial, onSaved }) {
  const [form, setForm] = useState({
    deadline_id: initial.deadline_id || '',
    title: initial.title || '',
    due_at: initial.due_at ? String(initial.due_at).slice(0, 16) : '',
    task_type: initial.task_type || 'upload_course_result',
    school_type: initial.school_type || 'all',
    grade: initial.grade !== undefined && initial.grade !== '' ? String(initial.grade) : '0',
    semester: initial.semester || '',
    note: initial.note || '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function submit() {
    if (!form.title || !form.due_at) { setErr('標題與截止時間為必填'); return; }
    setBusy(true); setErr('');
    try {
      await api('saveDeadline', {
        ...form,
        grade: Number(form.grade),
        due_at: new Date(form.due_at).toISOString(),
        scope: 'global',
      });
      onSaved();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <label htmlFor="d-title">標題</label>
      <input id="d-title" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="例：課程學習成果上傳截止" />

      <label htmlFor="d-due">截止時間</label>
      <input id="d-due" type="datetime-local" value={form.due_at} onChange={(e) => set('due_at', e.target.value)} />

      <label htmlFor="d-type">類型</label>
      <select id="d-type" value={form.task_type} onChange={(e) => set('task_type', e.target.value)}>
        {Object.entries(TASK_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>

      <label htmlFor="d-st">適用學制</label>
      <select id="d-st" value={form.school_type} onChange={(e) => set('school_type', e.target.value)}>
        <option value="all">全部</option>
        <option value="general">普高</option>
        <option value="vocational">技高</option>
      </select>

      <label htmlFor="d-grade">適用年級</label>
      <select id="d-grade" value={form.grade} onChange={(e) => set('grade', e.target.value)}>
        <option value="0">全年級</option>
        <option value="10">10 年級</option>
        <option value="11">11 年級</option>
        <option value="12">12 年級</option>
      </select>

      <label htmlFor="d-sem">學期代碼（選填）</label>
      <input id="d-sem" value={form.semester} onChange={(e) => set('semester', e.target.value)} placeholder="例：115-1" />

      <label htmlFor="d-note">備註（選填）</label>
      <textarea id="d-note" rows="2" value={form.note} onChange={(e) => set('note', e.target.value)} />

      <button className="btn" onClick={submit} disabled={busy}>{busy ? '儲存中…' : (form.deadline_id ? '更新截止日' : '新增截止日')}</button>
      {err && <p className="err">{err}</p>}
    </div>
  );
}

function TeacherReminders() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  async function send(days, label) {
    if (!confirm(`確定要立刻補發「${label}」給所有已綁定 LINE 的學生嗎？`)) return;
    setBusy(true); setMsg(''); setErr('');
    try {
      const data = await api('resendReminder', { days });
      setMsg(`已發送 ${data.sent} 則。${data.sent === 0 ? '（沒有學生綁定 LINE，或該區間內沒有截止日）' : ''}`);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <h2>一鍵補發提醒</h2>
      <p className="hint">
        排程本來就會自動發（每月 1 日月報、每週一週報）。這裡用於臨時公告新截止日後立即補發。
        只有 students 分頁填了 line_user_id 的學生會收到。
      </p>
      <button className="btn" style={{ marginTop: 18 }} disabled={busy} onClick={() => send(7, '一週內截止提醒')}>
        補發：7 天內截止提醒（週報格式）
      </button>
      <button className="btn btn-ghost" style={{ marginTop: 12 }} disabled={busy} onClick={() => send(31, '本月時程總覽')}>
        補發：31 天內時程總覽（月報格式）
      </button>
      {msg && <p className="ok-msg">{msg}</p>}
      {err && <p className="err">{err}</p>}
      <p className="hint" style={{ marginTop: 24 }}>
        📊 LINE 免費額度：每月 200 則（50 人 × 4 次）。補發也會計入，請留意次數。
      </p>
    </>
  );
}

/* ============ 時程 ============ */

function Timeline() {
  const [items, setItems] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api('listDeadlines').then(setItems).catch((e) => setErr(e.message));
  }, []);

  if (err) return <p className="err">{err}</p>;
  if (!items) return <p className="empty-hint">載入中…</p>;

  return (
    <>
      <h2>未來一年的重要時程</h2>
      <DeadlineList items={items} emptyText="目前沒有排定的截止日。" />
      <p className="hint">錯過「勾選至中央資料庫」的截止日，該學年資料將無法送交大學審查。</p>
    </>
  );
}

function DeadlineList({ items, emptyText }) {
  if (!items.length) return <p className="empty-hint">{emptyText}</p>;
  return items.map((d) => {
    const days = daysUntil(d.due_at);
    return (
      <div key={d.deadline_id} className="deadline">
        <span className={`d-date ${days <= 7 ? 'soon' : ''}`}>
          {new Date(d.due_at).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
          {days <= 7 ? `（剩${days}天）` : ''}
        </span>
        <div>
          <div className="d-title">{d.title}</div>
          {d.note && <div className="d-note">{d.note}</div>}
        </div>
      </div>
    );
  });
}
