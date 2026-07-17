import { useEffect, useMemo, useState } from 'react';
import { api, setToken, fileToBase64 } from './api.js';

/* ============ 常數 ============ */

const SUBCATS = {
  course_result: ['書面報告', '實作作品', '探究與實作', '學習單', '專題製作', '專業實習報告'],
  diverse: ['自主學習', '社團參與', '幹部經歷', '志工服務', '競賽表現', '檢定證照', '彈性學習', '其他活動'],
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

function daysUntil(iso) {
  return Math.ceil((new Date(iso) - new Date()) / 86400000);
}

/* ============ App ============ */

export default function App() {
  const [student, setStudent] = useState(null);
  const [tab, setTab] = useState('dashboard');

  if (!student) return <Login onDone={(u) => { setStudent(u); setTab(u.role === 'teacher' ? 'students' : 'dashboard'); }} />;

  const isTeacher = student.role === 'teacher';
  const tabs = isTeacher
    ? [['students', '學生總表'], ['deadlines', '時程管理'], ['reminders', '提醒']]
    : [['dashboard', '總覽'], ['artifacts', '素材倉庫'], ['timeline', '時程']];

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          TIPS 學習歷程<small>{student.name}{isTeacher ? '（老師）' : ''}</small>
        </div>
        <button onClick={() => { setToken(null); setStudent(null); }}>登出</button>
      </header>

      {!isTeacher && tab === 'dashboard' && <Dashboard student={student} />}
      {!isTeacher && tab === 'artifacts' && <Artifacts student={student} />}
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

/* ============ 登入 ============ */

function Login({ onDone }) {
  const [studentId, setStudentId] = useState('');
  const [loginCode, setLoginCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit() {
    setBusy(true); setErr('');
    try {
      const data = await api('login', { studentId, loginCode });
      setToken(data.token);
      onDone(data.student);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>把三年的努力，<br /><span className="hl">一格一格存下來</span></h1>
        <p className="sub">TIPS 學習歷程平台 — 素材隨手存，備審不慌張</p>
        <label htmlFor="sid">學號</label>
        <input id="sid" value={studentId} onChange={(e) => setStudentId(e.target.value)} placeholder="S000123" autoComplete="username" />
        <label htmlFor="code">登入代碼</label>
        <input id="code" value={loginCode} onChange={(e) => setLoginCode(e.target.value)} placeholder="老師發給你的 8 碼代碼" autoComplete="current-password" />
        <button className="btn" onClick={submit} disabled={busy}>{busy ? '登入中…' : '登入'}</button>
        {err && <p className="err">{err}</p>}
      </div>
    </div>
  );
}

/* ============ 總覽：三年學期格子 ============ */

function Dashboard({ student }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const semesters = useMemo(() => semestersFor(student.grade), [student.grade]);

  useEffect(() => {
    api('dashboard').then(setData).catch((e) => setErr(e.message));
  }, []);

  if (err) return <p className="err">{err}</p>;
  if (!data) return <p className="empty-hint">載入中…</p>;

  return (
    <>
      <h2>三年進度 <span className="hl">共 {data.total} 件素材</span></h2>
      <div className="sem-grid">
        {semesters.map((sem) => {
          const c = data.bySemester[sem];
          const total = c ? c.course + c.diverse : 0;
          return (
            <div key={sem} className={`sem-cell ${total === 0 ? 'empty' : ''} ${total === 0 ? 'warn' : ''}`}>
              <div className="sem-name">{sem}</div>
              <div className="sem-count">{total}<small>件</small></div>
              {c && <div className="sem-split">成果 {c.course}・多元 {c.diverse}</div>}
            </div>
          );
        })}
      </div>
      <p className="hint">空格＝該學期還沒有素材。事後無法補件，養成隨手存的習慣最重要。</p>

      <SemesterGuide schoolType={student.school_type} />

      <h2>90 天內的截止日</h2>
      <DeadlineList items={data.upcoming} emptyText="接下來 90 天沒有截止日，可以安心累積素材。" />
    </>
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

/* ============ 素材倉庫 ============ */

function Artifacts({ student }) {
  const [list, setList] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [err, setErr] = useState('');

  function reload() {
    api('listArtifacts').then(setList).catch((e) => setErr(e.message));
  }
  useEffect(reload, []);

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
      {showForm && <ArtifactForm student={student} onSaved={() => { setShowForm(false); reload(); }} />}
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
          <ArtifactCoach artifact={a} />
          <button className="a-del" onClick={() => remove(a.artifact_id)}>刪除</button>
        </article>
      ))}
    </>
  );
}

function ArtifactForm({ student, onSaved }) {
  const semesters = useMemo(() => semestersFor(student.grade), [student.grade]);
  const [form, setForm] = useState({
    title: '', category: 'course_result', subcategory: SUBCATS.course_result[0],
    semester: semesters[0], subject_or_event: '', quick_note: '',
  });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v, ...(k === 'category' ? { subcategory: SUBCATS[v][0] } : {}) }));
  }

  async function submit() {
    if (!form.title) { setErr('請輸入素材名稱'); return; }
    setBusy(true); setErr(''); setMsg('');
    try {
      let filePart = {};
      if (file) {
        const isVideo = file.type.startsWith('video/');
        const limit = isVideo ? 10 : 4;
        if (file.size / 1048576 > limit) {
          throw new Error(`檔案超過 ${limit}MB 上限（中央資料庫規範），請先壓縮`);
        }
        setMsg('檔案上傳中…');
        const base64 = await fileToBase64(file);
        const up = await api('uploadFile', { base64, filename: file.name, mimeType: file.type });
        filePart = { file_url: up.file_url, file_size_mb: up.file_size_mb, file_type: isVideo ? 'video_link' : (file.type === 'application/pdf' ? 'pdf' : 'image') };
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
      <label htmlFor="f-title">素材名稱</label>
      <input id="f-title" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="例：專題製作期中成果" />

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

      <label htmlFor="f-subj">科目／活動名稱</label>
      <input id="f-subj" value={form.subject_or_event} onChange={(e) => set('subject_or_event', e.target.value)} placeholder="例：電子學實習、校慶園遊會" />

      <label htmlFor="f-note">當下心得速記（之後寫反思會感謝現在的自己）</label>
      <textarea id="f-note" rows="3" value={form.quick_note} onChange={(e) => set('quick_note', e.target.value)} placeholder="今天做了什麼？卡在哪裡？學到什麼？" />

      <label htmlFor="f-file">附件（文件 ≤4MB／影音 ≤10MB）</label>
      <input id="f-file" type="file" onChange={(e) => setFile(e.target.files[0] || null)} />

      <button className="btn" onClick={submit} disabled={busy}>{busy ? '儲存中…' : '儲存素材'}</button>
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
              <th>成果</th><th>多元</th><th>合計</th><th>最近上傳</th><th>LINE</th>
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
