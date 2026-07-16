import { useEffect, useMemo, useState } from 'react';
import { api, setToken, fileToBase64 } from './api.js';

/* ============ 常數 ============ */

const SUBCATS = {
  course_result: ['書面報告', '實作作品', '探究與實作', '學習單', '專題製作', '專業實習報告'],
  diverse: ['自主學習', '社團參與', '幹部經歷', '志工服務', '競賽表現', '檢定證照', '彈性學習', '其他活動'],
};

/** 由年級推算學生的六個學期代碼（例：11年級、115學年 → 114-1 起共六格） */
function semestersFor(grade) {
  // 目前學年：2026-07 → 115 學年即將開始；以入學學年回推
  const currentAcademicYear = 115;
  const entryYear = currentAcademicYear - (Number(grade) - 10);
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

  if (!student) return <Login onDone={setStudent} />;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          TIPS 學習歷程<small>{student.name}</small>
        </div>
        <button onClick={() => { setToken(null); setStudent(null); }}>登出</button>
      </header>

      {tab === 'dashboard' && <Dashboard student={student} />}
      {tab === 'artifacts' && <Artifacts student={student} />}
      {tab === 'timeline' && <Timeline />}

      <nav className="tabbar">
        {[
          ['dashboard', '總覽'],
          ['artifacts', '素材倉庫'],
          ['timeline', '時程'],
        ].map(([key, label]) => (
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

      <h2>90 天內的截止日</h2>
      <DeadlineList items={data.upcoming} emptyText="接下來 90 天沒有截止日，可以安心累積素材。" />
    </>
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
