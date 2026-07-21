import { useEffect, useMemo, useState } from 'react';
import { api, setToken, fileToBase64 } from './api.js';

/* 市場完全分開：只看網址旗標，不碰 localStorage（避免污染／殘留）。
   美國入口＝?m=us（相容舊 ?lang=en）；台灣入口＝裸網址。 */
function resolveMarket() {
  try {
    var q = new URLSearchParams(window.location.search);
    if (q.get('m') === 'us' || q.get('lang') === 'en') return 'us';
  } catch (e) {}
  return 'tw';
}
const APP_MARKET = resolveMarket();

/* 台灣線再分兩條：高中（學測/個申，裸網址）與 技高（統測/四技二專，?track=vt）。
   一樣只看網址旗標、不碰 localStorage。美國線不受影響。 */
function resolveTrack() {
  try {
    var q = new URLSearchParams(window.location.search);
    if (q.get('track') === 'vt') return 'vt';
  } catch (e) {}
  return 'hs';
}
const APP_TRACK = resolveTrack();

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

/* ============ 選校 College Match（College Scorecard, CC-BY 需標註） ============ */
const CM_FOCI = [
  ['explore', '還在探索'], ['cs', '資訊 / 電腦科學'], ['premed', '醫預科 / 生物'],
  ['biz', '商學'], ['eng', '工程'], ['arts', '藝術 / 表演'], ['hum', '人文'],
];
const CM_FOCUS_FIELD = { cs: 'computer', premed: 'biological', biz: 'business_marketing', eng: 'engineering', arts: 'visual_performing', hum: 'humanities' };
const CM_STATES = ['', 'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'];
const CM_BTN = { background: '#16233b', color: '#f7f7f4', border: 'none', borderRadius: 10, padding: '11px 20px', fontWeight: 800, cursor: 'pointer' };
const CM_SAVE_OFF = { background: '#ffde59', color: '#16233b', border: 'none', borderRadius: 8, padding: '6px 12px', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' };
const CM_SAVE_ON = { background: '#15703c', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' };
function cmPct(x) { return x == null ? '—' : Math.round(x * 100) + '%'; }
function cmNum(x) { return x == null ? '—' : Number(x).toLocaleString(); }
function cmMoney(x) { return x == null ? '—' : '$' + Number(x).toLocaleString(); }

function CollegeMatch({ student, lang }) {
  const initFocus = CM_FOCUS_FIELD[student.focus_anchor] ? student.focus_anchor : 'explore';
  const [q, setQ] = useState('');
  const [stt, setStt] = useState('');
  const [sel, setSel] = useState('');
  const [size, setSize] = useState('');
  const [focus, setFocus] = useState(initFocus);
  const [results, setResults] = useState(null);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState([]);

  useEffect(() => { api('listColleges').then(setSaved).catch(() => {}); }, []);
  const savedIds = new Set(saved.map((s) => String(s.college_id)));
  const ff = CM_FOCUS_FIELD[focus];
  const EN = lang === 'en';
  const L = (zh, en) => (EN ? en : zh);
  const FOCI_L = [
    ['explore', L('還在探索', 'Still exploring')], ['cs', L('資訊 / 電腦科學', 'CS / Computer Science')],
    ['premed', L('醫預科 / 生物', 'Pre-med / Biology')], ['biz', L('商學', 'Business')],
    ['eng', L('工程', 'Engineering')], ['arts', L('藝術 / 表演', 'Arts / Performing')], ['hum', L('人文', 'Humanities')],
  ];

  async function doSearch() {
    setBusy(true); setErr('');
    try {
      const d = await api('collegeSearch', { q, state: stt, selectivity: sel, size, focus });
      setResults(d.results || []); setTotal(d.total || 0);
    } catch (e) { setErr(e.message); setResults([]); }
    setBusy(false);
  }
  async function toggleSave(c) {
    const id = String(c['id']);
    try {
      if (savedIds.has(id)) {
        await api('removeCollege', { college_id: id });
        setSaved(saved.filter((s) => String(s.college_id) !== id));
      } else {
        const rec = { college_id: id, name: c['school.name'], city: c['school.city'], state: c['school.state'], url: c['school.school_url'] };
        await api('saveCollege', rec);
        setSaved(saved.concat([rec]));
      }
    } catch (e) { setErr(e.message); }
  }

  return (
    <div className="pane collegematch" style={{ padding: '12px 4px 90px' }}>
      <h2 style={{ margin: '4px 0' }}>{L('選校 · College Match', 'College Match')}</h2>
      <p style={{ color: '#5a6378', fontSize: '.9rem', margin: '0 0 12px' }}>
        {L('選你的焦點方向，把「這個領域強」的學校排前面——把聚焦延伸到聚焦選校。', 'Pick your focus and we surface schools strong in that area — turning your focus into a focused college list.')}
      </p>

      <div style={{ display: 'grid', gap: 8 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={L('學校名稱（可留空）e.g. Berkeley', 'School name (optional) e.g. Berkeley')} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <select value={stt} onChange={(e) => setStt(e.target.value)}>
            {CM_STATES.map((s) => <option key={s} value={s}>{s || L('所有州 State', 'All states')}</option>)}
          </select>
          <select value={sel} onChange={(e) => setSel(e.target.value)}>
            <option value="">{L('錄取難度：不限', 'Selectivity: any')}</option>
            <option value="0..0.25">{L('最競爭（<25%）', 'Most selective (<25%)')}</option>
            <option value="0.25..0.5">{L('競爭（25–50%）', 'Selective (25–50%)')}</option>
            <option value="0.5..1">{L('較好上（>50%）', 'Less selective (>50%)')}</option>
          </select>
          <select value={size} onChange={(e) => setSize(e.target.value)}>
            <option value="">{L('規模：不限', 'Size: any')}</option>
            <option value="0..2500">{L('小型（<2,500）', 'Small (<2,500)')}</option>
            <option value="2500..15000">{L('中型', 'Medium')}</option>
            <option value="15000..">{L('大型（>15,000）', 'Large (>15,000)')}</option>
          </select>
          <select value={focus} onChange={(e) => setFocus(e.target.value)}>
            {FOCI_L.map(([v, l]) => <option key={v} value={v}>{L('焦點：', 'Focus: ')}{l}</option>)}
          </select>
        </div>
        <button onClick={doSearch} disabled={busy} style={CM_BTN}>{busy ? L('搜尋中…', 'Searching…') : L('搜尋學校', 'Search schools')}</button>
      </div>

      {err && <p style={{ color: '#b3261e', fontSize: '.9rem' }}>{L('讀取失敗：', 'Error: ')}{err}</p>}

      {saved.length > 0 && (
        <div style={{ margin: '16px 0', padding: '12px 14px', background: '#fff', border: '2px solid #16233b', borderRadius: 12 }}>
          <b>{L('我的選校清單', 'My college list')}（{saved.length}）</b>
          {saved.map((s) => (
            <div key={s.college_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '6px 0', borderTop: '1px solid #eee', fontSize: '.9rem' }}>
              <span>{s.name} <span style={{ color: '#5a6378' }}>· {s.city}, {s.state}</span></span>
              <button onClick={() => toggleSave({ id: s.college_id })} style={{ color: '#b3261e', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 800 }}>{L('移除', 'Remove')}</button>
            </div>
          ))}
        </div>
      )}

      {results && results.map((c) => {
        const id = String(c['id']);
        const fitv = ff ? c['latest.academics.program_percentage.' + ff] : null;
        const url = c['school.school_url'];
        return (
          <div key={id} style={{ background: '#fff', border: '1.5px solid #d9d9d2', borderRadius: 12, padding: '12px 14px', margin: '10px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <div>
                <div style={{ fontWeight: 800 }}>{c['school.name']}</div>
                <div style={{ color: '#5a6378', fontSize: '.85rem' }}>{c['school.city']}, {c['school.state']}</div>
              </div>
              <button onClick={() => toggleSave(c)} style={savedIds.has(id) ? CM_SAVE_ON : CM_SAVE_OFF}>
                {savedIds.has(id) ? L('✓ 已收藏', '✓ Saved') : L('＋ 收藏', '＋ Save')}
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', margin: '8px 0 2px', fontSize: '.84rem' }}>
              <span><span style={{ color: '#5a6378' }}>{L('錄取率 ', 'Admit ')}</span><b>{cmPct(c['latest.admissions.admission_rate.overall'])}</b></span>
              <span><span style={{ color: '#5a6378' }}>{L('SAT 平均 ', 'Avg SAT ')}</span><b>{c['latest.admissions.sat_scores.average.overall'] || '—'}</b></span>
              <span><span style={{ color: '#5a6378' }}>{L('外州學費 ', 'Out-of-state ')}</span><b>{cmMoney(c['latest.cost.tuition.out_of_state'])}</b></span>
              <span><span style={{ color: '#5a6378' }}>{L('學生數 ', 'Students ')}</span><b>{cmNum(c['latest.student.size'])}</b></span>
            </div>
            {ff && fitv != null && (
              <div style={{ fontSize: '.8rem', color: '#2a3a5c', marginTop: 4 }}>
                {FOCI_L.find((x) => x[0] === focus)[1]}{L(' 主修占比：', ' major share: ')}<b>{cmPct(fitv)}</b>
              </div>
            )}
            {url && <a href={/^https?:/.test(url) ? url : 'https://' + url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '.82rem', fontWeight: 700 }}>{L('官方網站 · 送件與截止以官網為準 →', 'Official site · apply & deadlines there →')}</a>}
          </div>
        );
      })}

      {results && results.length === 0 && !busy && <p style={{ color: '#5a6378' }}>{L('沒有符合的學校，放寬條件試試。', 'No matches — try loosening the filters.')}</p>}
      {results && results.length > 0 && <p style={{ color: '#5a6378', fontSize: '.82rem' }}>{L('約 ', '~')}{total.toLocaleString()}{L(' 所符合，依焦點排序顯示前 ', ' matches · showing top ')}{results.length}{L(' 所。', ' by focus.')}</p>}

      <details style={{ marginTop: 16, background: '#fff', border: '1.5px solid #d9d9d2', borderRadius: 12, padding: '0 14px' }}>
        <summary style={{ fontWeight: 800, padding: '12px 0', cursor: 'pointer' }}>{L('早申請與送分 101（點開）', 'Early apps & testing 101 (tap)')}</summary>
        <div style={{ fontSize: '.86rem', color: '#2a3a5c', paddingBottom: 12 }}>
          <p><b>ED（Early Decision）</b>{L('：綁定，錄取就必須去、只能投一間。約 11/1。', ': binding — if admitted you must enroll, and you may apply ED to only one school. ~Nov 1.')}</p>
          <p><b>EA（Early Action）</b>{L('：不綁定，可投多間。約 11/1。', ': non-binding — apply to as many as you like. ~Nov 1.')}</p>
          <p><b>REA/SCEA</b>{L('：不綁定但不能同時申請其他私立早申請（Harvard／Yale／Princeton／Stanford 等）。', ': non-binding, but no other private early apps (Harvard/Yale/Princeton/Stanford, etc.).')}</p>
          <p><b>RD（Regular Decision）</b>{L('：常規申請，約 1 月。', ': regular deadline, ~January.')}</p>
          <p style={{ marginTop: 6 }}>{L('送分政策 2026–27 有多所頂校恢復必繳、UC／CSU 全 test-blind——一律以各校官網為準。TIPS 只幫你研究與整理清單，不代送、不保證錄取。', 'For 2026–27, many top schools require testing again and UC/CSU are test-blind — always confirm on each college’s site. TIPS helps you research and organize a list; we never submit applications for you and never guarantee admission.')}</p>
        </div>
      </details>

      <p style={{ fontSize: '.76rem', color: '#5a6378', marginTop: 12 }}>
        {L('資料：U.S. Department of Education, College Scorecard（CC-BY）。數據可能落後 1–2 年，請以學校官網為準。', 'Data: U.S. Department of Education, College Scorecard (CC-BY). Figures may lag 1–2 years — verify on each college’s official site.')}
      </p>
    </div>
  );
}

/* ============ 美國 Overview（Common App 導向：活動 / 榮譽 / Essay） ============ */
const US_CATS = ['Academic', 'Art', 'Athletics: Club', 'Athletics: JV/Varsity', 'Career Oriented', 'Community Service (Volunteer)', 'Computer/Technology', 'Cultural', 'Dance', 'Debate/Speech', 'Environmental', 'Family Responsibilities', 'Foreign Exchange', 'Foreign Language', 'Internship', 'Journalism/Publication', 'Junior R.O.T.C.', 'LGBT', 'Music: Instrumental', 'Music: Vocal', 'Religious', 'Research', 'Robotics', 'School Spirit', 'Science/Math', 'Social Justice', 'Student Govt./Politics', 'Theater/Drama', 'Work (Paid)', 'Other Club/Activity'];
const US_LEVELS = ['School', 'State/Regional', 'National', 'International'];
const US_CARD = { background: '#fff', border: '1.5px solid #d9d9d2', borderRadius: 12, padding: '12px 14px', margin: '8px 0' };
const US_MUTED = { color: '#5a6378', fontSize: '.82rem' };
const US_BTN = { background: '#16233b', color: '#f7f7f4', border: 'none', borderRadius: 9, padding: '9px 16px', fontWeight: 800, cursor: 'pointer' };
const US_ADD = { background: '#ffde59', color: '#16233b', border: 'none', borderRadius: 9, padding: '8px 14px', fontWeight: 800, cursor: 'pointer' };
const US_FLD = { width: '100%', padding: '9px 11px', border: '1.5px solid #d9d9d2', borderRadius: 8, fontSize: '.92rem', fontFamily: 'inherit', background: '#f7f7f4', color: '#16233b', margin: '4px 0' };
function usWordCount(s) { return String(s || '').trim() ? String(s).trim().split(/\s+/).length : 0; }

function USOverview({ student, lang }) {
  const t = (zh, en, cn) => (lang === 'en' ? en : lang === 'zh-CN' ? cn : zh);
  const [recs, setRecs] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState('');   // '' | 'activity' | 'honor' | 'essay'
  const [f, setF] = useState({});
  const [editId, setEditId] = useState('');
  const [coachBusy, setCoachBusy] = useState(false);
  const [coachOut, setCoachOut] = useState('');

  useEffect(() => { reload(); }, []);
  function reload() { return api('usList', {}).then(setRecs).catch((e) => setErr(e.message)); }
  const byKind = (k) => (recs || []).filter((r) => r.kind === k);
  const set = (k, v) => setF(Object.assign({}, f, { [k]: v }));
  function startAdd(kind, defaults) { setOpen(kind); setF(defaults || {}); setEditId(''); setErr(''); setCoachOut(''); }
  function startEdit(rec) { setOpen(rec.kind); setF(Object.assign({}, rec.data)); setEditId(rec.id); setErr(''); setCoachOut(''); }
  function cancel() { setOpen(''); setF({}); setEditId(''); setCoachOut(''); }
  async function save() {
    setBusy(true); setErr('');
    try { await api('usSave', { kind: open, data: f, id: editId || undefined }); await reload(); cancel(); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  }
  async function remove(id) { setErr(''); try { await api('usRemove', { id }); await reload(); } catch (e) { setErr(e.message); } }
  async function askCoach() {
    if (!String(f.text || '').trim()) { setCoachOut(t('先寫幾句再問教練。', 'Write a few lines first, then ask the coach.', '先写几句再问教练。')); return; }
    setCoachBusy(true); setCoachOut('');
    try { const d = await api('essayCoach', { text: f.text, title: f.title || '', id: editId || '' }); setCoachOut(d.text); }
    catch (e) { setCoachOut((t('教練暫時無法回應：', 'Coach unavailable: ', '教练暂时无法回应：')) + e.message); }
    setCoachBusy(false);
  }

  if (err && !recs) return <p style={{ color: '#b3261e' }}>{err}</p>;
  if (!recs) return <p style={{ color: '#5a6378' }}>{t('載入中…', 'Loading…', '载入中…')}</p>;
  const acts = byKind('activity'), hons = byKind('honor'), esss = byKind('essay');

  const grades = ['9', '10', '11', '12'];
  function toggleGrade(g) {
    const cur = (f.grades || []).slice();
    const i = cur.indexOf(g);
    if (i >= 0) cur.splice(i, 1); else cur.push(g);
    set('grades', cur);
  }

  return (
    <div style={{ padding: '10px 4px 90px' }}>
      <h2 style={{ margin: '4px 0' }}>{t('美國升學總覽', 'Application Overview', '美国升学总览')}</h2>
      <p style={US_MUTED}>{t('四年一點一滴累積：活動、榮譽、Essay。這就是申請時要說的故事。', 'Build it across four years — activities, honors, essays. This is the story your application tells.', '四年一点一滴积累：活动、荣誉、Essay。这就是申请时要说的故事。')}</p>
      {err && <p style={{ color: '#b3261e', fontSize: '.9rem' }}>{err}</p>}

      {/* ===== Activities ===== */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 18 }}>
        <h3 style={{ margin: 0 }}>{t('活動', 'Activities', '活动')} <span style={US_MUTED}>{acts.length}/10</span></h3>
        {open !== 'activity' && acts.length < 10 && <button style={US_ADD} onClick={() => startAdd('activity', { grades: [], timing: 'During school year' })}>＋ {t('新增活動', 'Add activity', '新增活动')}</button>}
      </div>
      {acts.map((a) => (
        <div key={a.id} style={US_CARD}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <b>{a.data.position || t('(未填職位)', '(no role)', '(未填职位)')}</b>
            <span style={{ whiteSpace: 'nowrap' }}>
              <button style={{ border: 'none', background: 'none', cursor: 'pointer', fontWeight: 700 }} onClick={() => startEdit(a)}>{t('編輯', 'Edit', '编辑')}</button>
              <button style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#b3261e', fontWeight: 700 }} onClick={() => remove(a.id)}>✕</button>
            </span>
          </div>
          <div style={US_MUTED}>{a.data.org}{a.data.type ? ' · ' + a.data.type : ''}</div>
          {a.data.description && <div style={{ fontSize: '.9rem', margin: '4px 0' }}>{a.data.description}</div>}
          <div style={US_MUTED}>{(a.data.hours ? a.data.hours + ' hrs/wk · ' : '') + (a.data.weeks ? a.data.weeks + ' wks/yr · ' : '') + ((a.data.grades || []).length ? 'Gr ' + (a.data.grades || []).join(',') : '')}</div>
        </div>
      ))}
      {open === 'activity' && (
        <div style={Object.assign({}, US_CARD, { border: '2px solid #16233b' })}>
          <select style={US_FLD} value={f.type || ''} onChange={(e) => set('type', e.target.value)}>
            <option value="">{t('活動類別', 'Activity type', '活动类别')}</option>
            {US_CATS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input style={US_FLD} maxLength={50} placeholder={t('職位／角色（≤50 字）', 'Position/role (≤50 chars)', '职位／角色（≤50 字）')} value={f.position || ''} onChange={(e) => set('position', e.target.value)} />
          <input style={US_FLD} maxLength={100} placeholder={t('組織名稱（≤100 字）', 'Organization (≤100 chars)', '组织名称（≤100 字）')} value={f.org || ''} onChange={(e) => set('org', e.target.value)} />
          <textarea style={Object.assign({}, US_FLD, { minHeight: 60 })} maxLength={150} placeholder={t('描述你的貢獻與影響（≤150 字，Common App 上限）', 'Describe your impact (≤150 chars, Common App limit)', '描述你的贡献与影响（≤150 字，Common App 上限）')} value={f.description || ''} onChange={(e) => set('description', e.target.value)} />
          <div style={US_MUTED}>{(f.description || '').length}/150</div>
          <div style={{ margin: '10px 0', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <span style={US_MUTED}>{t('年級', 'Grades', '年级')}</span>
            {grades.map((g) => (
              <label key={g} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '.92rem', margin: 0 }}>
                <input type="checkbox" style={{ width: 'auto', margin: 0 }} checked={(f.grades || []).indexOf(g) >= 0} onChange={() => toggleGrade(g)} /> {g}
              </label>
            ))}
          </div>
          <select style={US_FLD} value={f.timing || 'During school year'} onChange={(e) => set('timing', e.target.value)}>
            <option value="During school year">{t('學年期間', 'During school year', '学年期间')}</option>
            <option value="During school break">{t('假期期間', 'During school break', '假期期间')}</option>
            <option value="All year">{t('全年', 'All year', '全年')}</option>
          </select>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <div style={US_MUTED}>{t('每週時數', 'Hours per week', '每周时数')}</div>
              <input style={US_FLD} type="number" min="0" value={f.hours || ''} onChange={(e) => set('hours', e.target.value)} />
            </div>
            <div>
              <div style={US_MUTED}>{t('每年週數', 'Weeks per year', '每年周数')}</div>
              <input style={US_FLD} type="number" min="0" value={f.weeks || ''} onChange={(e) => set('weeks', e.target.value)} />
            </div>
          </div>
          <div style={US_MUTED}>{t('例：一週 5 小時 × 一年 30 週。這是「投入強度」，不是做了幾年。', 'e.g. 5 hrs/week × 30 weeks/year — this is your time commitment, not total years.', '例：一周 5 小时 × 一年 30 周。这是「投入强度」，不是做了几年。')}</div>
          <div style={{ marginTop: 8 }}>
            <button style={US_BTN} disabled={busy} onClick={save}>{busy ? t('儲存中…', 'Saving…', '保存中…') : t('儲存', 'Save', '保存')}</button>
            <button style={{ marginLeft: 8, border: 'none', background: 'none', cursor: 'pointer' }} onClick={cancel}>{t('取消', 'Cancel', '取消')}</button>
          </div>
        </div>
      )}

      {/* ===== Honors ===== */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 22 }}>
        <h3 style={{ margin: 0 }}>{t('榮譽 / 獎項', 'Honors & Awards', '荣誉 / 奖项')} <span style={US_MUTED}>{hons.length}/5</span></h3>
        {open !== 'honor' && hons.length < 5 && <button style={US_ADD} onClick={() => startAdd('honor', { level: 'School' })}>＋ {t('新增榮譽', 'Add honor', '新增荣誉')}</button>}
      </div>
      {hons.map((h) => (
        <div key={h.id} style={US_CARD}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span><b>{h.data.title}</b> <span style={US_MUTED}>· {h.data.level}{h.data.grade ? ' · Gr ' + h.data.grade : ''}</span></span>
            <span style={{ whiteSpace: 'nowrap' }}>
              <button style={{ border: 'none', background: 'none', cursor: 'pointer', fontWeight: 700 }} onClick={() => startEdit(h)}>{t('編輯', 'Edit', '编辑')}</button>
              <button style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#b3261e', fontWeight: 700 }} onClick={() => remove(h.id)}>✕</button>
            </span>
          </div>
        </div>
      ))}
      {open === 'honor' && (
        <div style={Object.assign({}, US_CARD, { border: '2px solid #16233b' })}>
          <input style={US_FLD} maxLength={100} placeholder={t('獎項名稱', 'Honor / award title', '奖项名称')} value={f.title || ''} onChange={(e) => set('title', e.target.value)} />
          <select style={US_FLD} value={f.level || 'School'} onChange={(e) => set('level', e.target.value)}>
            {US_LEVELS.map((lv) => <option key={lv} value={lv}>{lv}</option>)}
          </select>
          <select style={US_FLD} value={f.grade || ''} onChange={(e) => set('grade', e.target.value)}>
            <option value="">{t('年級（選填）', 'Grade (optional)', '年级（选填）')}</option>
            {grades.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <div style={{ marginTop: 8 }}>
            <button style={US_BTN} disabled={busy} onClick={save}>{busy ? t('儲存中…', 'Saving…', '保存中…') : t('儲存', 'Save', '保存')}</button>
            <button style={{ marginLeft: 8, border: 'none', background: 'none', cursor: 'pointer' }} onClick={cancel}>{t('取消', 'Cancel', '取消')}</button>
          </div>
        </div>
      )}

      {/* ===== Essays ===== */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 22 }}>
        <h3 style={{ margin: 0 }}>{t('Essay 文書', 'Essays', 'Essay 文书')} <span style={US_MUTED}>{esss.length}</span></h3>
        {open !== 'essay' && <button style={US_ADD} onClick={() => startAdd('essay', { kind: 'personal' })}>＋ {t('新增 Essay', 'Add essay', '新增 Essay')}</button>}
      </div>
      {esss.map((es) => (
        <div key={es.id} style={US_CARD}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <b>{es.data.title || (es.data.kind === 'personal' ? t('主文書', 'Personal statement', '主文书') : t('補充 Essay', 'Supplemental', '补充 Essay'))}</b>
            <span style={{ whiteSpace: 'nowrap' }}>
              <button style={{ border: 'none', background: 'none', cursor: 'pointer', fontWeight: 700 }} onClick={() => startEdit(es)}>{t('編輯', 'Edit', '编辑')}</button>
              <button style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#b3261e', fontWeight: 700 }} onClick={() => remove(es.id)}>✕</button>
            </span>
          </div>
          <div style={US_MUTED}>{usWordCount(es.data.text)} {t('字', 'words', '词')}{es.data.kind === 'personal' ? ' / 650' : ''}</div>
        </div>
      ))}
      {open === 'essay' && (
        <div style={Object.assign({}, US_CARD, { border: '2px solid #16233b' })}>
          <select style={US_FLD} value={f.kind || 'personal'} onChange={(e) => set('kind', e.target.value)}>
            <option value="personal">{t('主文書（Personal Statement，650 字）', 'Personal statement (650 words)', '主文书（Personal Statement，650 词）')}</option>
            <option value="supplemental">{t('補充 Essay（各校）', 'Supplemental (per school)', '补充 Essay（各校）')}</option>
          </select>
          <input style={US_FLD} maxLength={140} placeholder={t('標題／題目（例如學校＋題目）', 'Title / prompt (e.g. school + prompt)', '标题／题目（例如学校＋题目）')} value={f.title || ''} onChange={(e) => set('title', e.target.value)} />
          <textarea style={Object.assign({}, US_FLD, { minHeight: 160 })} placeholder={t('在這裡寫你的 Essay。AI 教練只引導、不代寫。', 'Write your essay here. The AI coach guides, never writes it for you.', '在这里写你的 Essay。AI 教练只引导、不代写。')} value={f.text || ''} onChange={(e) => set('text', e.target.value)} />
          <div style={US_MUTED}>{usWordCount(f.text)} {t('字', 'words', '词')}{(f.kind || 'personal') === 'personal' ? ' / 650' : ''}</div>
          <div style={{ marginTop: 8 }}>
            <button style={{ background: '#ffde59', color: '#16233b', border: 'none', borderRadius: 9, padding: '9px 16px', fontWeight: 800, cursor: 'pointer' }} disabled={coachBusy} onClick={askCoach}>
              {coachBusy ? t('教練思考中…', 'Coach is thinking…', '教练思考中…') : t('✦ 問教練（給問題，不代寫）', '✦ Ask the coach (questions, not a draft)', '✦ 问教练（给问题，不代写）')}
            </button>
          </div>
          {coachOut && <div style={{ background: '#fffbe6', border: '1.5px solid #ffde59', borderRadius: 10, padding: '12px 14px', marginTop: 8, fontSize: '.9rem', whiteSpace: 'pre-wrap' }}>{coachOut}</div>}
          <div style={{ marginTop: 10 }}>
            <button style={US_BTN} disabled={busy} onClick={save}>{busy ? t('儲存中…', 'Saving…', '保存中…') : t('儲存', 'Save', '保存')}</button>
            <button style={{ marginLeft: 8, border: 'none', background: 'none', cursor: 'pointer' }} onClick={cancel}>{t('取消', 'Cancel', '取消')}</button>
          </div>
        </div>
      )}

      <p style={{ fontSize: '.76rem', color: '#5a6378', marginTop: 20 }}>
        {t('欄位與上限對齊 Common App（活動 10、榮譽 5、主文書 650 字）。AI 只引導不代寫、不代送、不保證錄取。', 'Fields and limits follow the Common App (10 activities, 5 honors, 650-word personal statement). The AI guides only — it never writes or submits for you, and never guarantees admission.', '字段与上限对齐 Common App（活动 10、荣誉 5、主文书 650 词）。AI 只引导不代写、不代送、不保证录取。')}
      </p>
    </div>
  );
}

/* ============ 台灣落點分析（個人申請第一階段過篩） ============ */
const TW_CLUSTERS = ['資訊學群', '工程學群', '數理化學群', '醫藥衛生學群', '生命科學學群', '生物資源學群', '地球與環境學群', '建築與設計學群', '藝術學群', '社會與心理學群', '大眾傳播學群', '外語學群', '文史哲學群', '教育學群', '法政學群', '管理學群', '財經學群', '遊憩與運動學群'];
const TW_SUBS = ['國', '英', '數A', '數B', '社', '自'];
const PL_FLD = { width: '100%', padding: '9px 11px', border: '1.5px solid #d9d9d2', borderRadius: 8, fontSize: '.95rem', fontFamily: 'inherit', background: '#f7f7f4', color: '#16233b' };
const PL_BTN = { background: '#16233b', color: '#f7f7f4', border: 'none', borderRadius: 10, padding: '11px 22px', fontWeight: 800, cursor: 'pointer' };

function Placement({ student }) {
  const [scores, setScores] = useState({});
  const [clusters, setClusters] = useState([]);
  const [mode, setMode] = useState('sim');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const setScore = (k, v) => setScores(Object.assign({}, scores, { [k]: v }));
  function toggleCluster(c) { const cur = clusters.slice(); const i = cur.indexOf(c); if (i >= 0) cur.splice(i, 1); else cur.push(c); setClusters(cur); }
  async function run() {
    setBusy(true); setErr('');
    try { const d = await api('placement', { scores: scores, clusters: clusters, mode: mode }); setRes(d); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  }
  const cols = res ? [
    { key: 'dream', label: '夢幻', sub: '一階偏難', bg: '#f6d9df', color: '#8e1f34', list: res.dream || [] },
    { key: 'prep', label: '適中', sub: '一階邊緣', bg: '#fce9c8', color: '#b06f00', list: res.prep || [] },
    { key: 'safe', label: '安全', sub: '穩過一階', bg: '#d7efe0', color: '#15703c', list: res.safe || [] },
  ] : [];

  return (
    <div style={{ padding: '10px 4px 90px' }}>
      <h2 style={{ margin: '4px 0' }}>落點分析</h2>
      <p style={{ color: '#5a6378', fontSize: '.9rem' }}>個人申請「<b>第一階段</b>」過篩難易推估：先看<b>檢定門檻</b>（各科最低標級），再用各校系去年「各篩選順序的通過最低級分」逐段比對，分成夢幻／適中／安全。<b>過一階 ≠ 錄取</b>；第二階段（書審／面試）另需準備。</p>

      <div style={{ display: 'inline-flex', border: '2px solid #16233b', borderRadius: 999, overflow: 'hidden', margin: '6px 0 12px' }}>
        <button onClick={() => setMode('sim')} style={{ border: 'none', padding: '7px 16px', fontWeight: 800, cursor: 'pointer', background: mode === 'sim' ? '#16233b' : '#fff', color: mode === 'sim' ? '#fff' : '#16233b' }}>模擬級分</button>
        <button onClick={() => setMode('real')} style={{ border: 'none', padding: '7px 16px', fontWeight: 800, cursor: 'pointer', background: mode === 'real' ? '#16233b' : '#fff', color: mode === 'real' ? '#fff' : '#16233b' }}>正式成績</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(88px, 1fr))', gap: 8 }}>
        {TW_SUBS.map((s) => (
          <div key={s}>
            <div style={{ fontSize: '.8rem', color: '#5a6378', fontWeight: 700 }}>{s}</div>
            <input style={PL_FLD} type="number" min="0" max="15" placeholder="0–15" value={scores[s] || ''} onChange={(e) => setScore(s, e.target.value)} />
          </div>
        ))}
      </div>
      <div style={{ fontSize: '.78rem', color: '#5a6378', marginTop: 4 }}>學測每科滿級分 15。只填要採計的科目也可以。</div>

      <div style={{ margin: '12px 0' }}>
        <div style={{ fontSize: '.82rem', color: '#5a6378', fontWeight: 700, marginBottom: 4 }}>想看的學群（不選＝全部）</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {TW_CLUSTERS.map((c) => (
            <button key={c} onClick={() => toggleCluster(c)} style={{ border: '1.5px solid ' + (clusters.indexOf(c) >= 0 ? '#16233b' : '#d9d9d2'), background: clusters.indexOf(c) >= 0 ? '#ffde59' : '#fff', color: '#16233b', borderRadius: 999, padding: '5px 11px', fontSize: '.82rem', fontWeight: 700, cursor: 'pointer' }}>{c}</button>
          ))}
        </div>
      </div>

      <button style={PL_BTN} disabled={busy} onClick={run}>{busy ? '分析中…' : '分析落點'}</button>
      {err && <p style={{ color: '#b3261e', fontSize: '.9rem' }}>{err}</p>}

      {res && res.isDemo && (
        <div style={{ background: '#fff7e0', border: '1.5px solid #b06f00', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: '.85rem', color: '#7a4a00' }}>
          ⚠️ 目前是<b>示範資料</b>（校系與通過標準非官方數字）。上線前需匯入甄選會實際年度的篩選標準。
        </div>
      )}

      {res && res.counts && (res.counts.dream + res.counts.prep + res.counts.safe) === 0 && (
        <div style={{ background: '#fff7e0', border: '1.5px solid #b06f00', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: '.85rem', color: '#7a4a00' }}>
          沒有可比對的校系。可能是所選學群目前尚無通過級分資料，或你填的科目與校系採計不符。試著多填幾科、或放寬學群。
        </div>
      )}

      {res && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginTop: 14 }}>
          {cols.map((col) => (
            <div key={col.key}>
              <div style={{ fontWeight: 800, background: col.bg, color: col.color, borderRadius: 8, padding: '6px 12px', textAlign: 'center' }}>{col.label}（{col.list.length}）<span style={{ fontWeight: 600, fontSize: '.72rem', opacity: .8 }}>· {col.sub}</span></div>
              {col.list.length === 0 && <p style={{ color: '#5a6378', fontSize: '.85rem', textAlign: 'center', marginTop: 8 }}>—</p>}
              {col.list.slice(0, 40).map((m, i) => (
                <div key={i} style={{ background: '#fff', border: '1.5px solid #d9d9d2', borderRadius: 10, padding: '10px 12px', marginTop: 8 }}>
                  <div style={{ fontWeight: 800, fontSize: '.92rem' }}>{m.school} {m.dept}</div>
                  <div style={{ color: '#5a6378', fontSize: '.8rem' }}>{m.cluster}{m.subjects ? '｜採計 ' + m.subjects : ''}</div>
                  {Array.isArray(m.checkFail) && m.checkFail.length > 0 ? (
                    <div style={{ fontSize: '.82rem', marginTop: 4, color: '#8e1f34', fontWeight: 700 }}>
                      ✕ 檢定未過：{m.checkFail.join('、')}
                      <div style={{ fontWeight: 400, fontSize: '.74rem', color: '#5a6378', marginTop: 2 }}>檢定沒過就無法進入倍率篩選，需先拉高該科。</div>
                    </div>
                  ) : (
                    <div style={{ fontSize: '.84rem', marginTop: 4 }}>
                      最吃緊關卡：<b>{m.binding || '—'}</b>
                      <span style={{ color: m.minMargin >= 0 ? '#15703c' : '#8e1f34', fontWeight: 800, marginLeft: 6 }}>
                        {m.minMargin >= 0 ? '+' : ''}{m.minMargin} 級分
                      </span>
                    </div>
                  )}
                  {(!m.checkFail || !m.checkFail.length) && Array.isArray(m.detail) && m.detail.length > 0 && (
                    <div style={{ fontSize: '.74rem', color: '#5a6378', marginTop: 4, lineHeight: 1.5 }}>
                      {m.detail.map((d, j) => (
                        <span key={j}>順序{j + 1}｜{d.subs} 我{d.my}／去年{d.need}（{d.margin >= 0 ? '+' : ''}{d.margin}）{j < m.detail.length - 1 ? '　' : ''}</span>
                      ))}
                    </div>
                  )}
                  {m.check && <div style={{ fontSize: '.72rem', color: '#8a94a6', marginTop: 3 }}>檢定門檻：{m.check}</div>}
                  {m.partial && <div style={{ color: '#b06f00', fontSize: '.72rem', marginTop: 3 }}>＊部分關卡因缺對應科成績未計入</div>}
                </div>
              ))}
              {col.list.length > 40 && <p style={{ color: '#5a6378', fontSize: '.78rem', textAlign: 'center', marginTop: 6 }}>還有 {col.list.length - 40} 個…（縮小學群範圍可看更精準）</p>}
            </div>
          ))}
        </div>
      )}

      {res && (
        <p style={{ fontSize: '.76rem', color: '#5a6378', marginTop: 14 }}>
          {res.note}<br />{res.source}<br />
          註：音樂／美術／體育等<b>術科校系</b>以術科成績篩選，不適用學測級分推估，未列入本結果。部分校系去年未觸發篩選（人人過一階），亦不會出現在此。
        </p>
      )}
    </div>
  );
}

/* ============ 技高落點分析（四技二專甄選・第一階段統測篩選） ============ */
const VT_GROUPS = ['01-機械群', '02-動力機械群', '03-電機與電子群電機類', '04-電機與電子群資電類', '05-化工群', '06-土木與建築群', '07-設計群', '08-工程與管理類', '09-商業與管理群', '10-衛生與護理類', '11-食品群', '12-農業群', '13-家政群幼保類', '14-家政群生活應用類', '15-外語群英語類', '16-外語群日語類', '17-餐旅群', '18-海事群', '19-水產群', '20-藝術群影視類', '21-藝術群'];
const VT_SUBS = ['國', '英', '數', '專一', '專二'];
const VT_SUBLABEL = { '國': '國文', '英': '英文', '數': '數學', '專一': '專業一', '專二': '專業二' };

function VtPlacement({ student }) {
  const [scores, setScores] = useState({});
  const [group, setGroup] = useState('');
  const [mode, setMode] = useState('sim');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const setScore = (k, v) => setScores(Object.assign({}, scores, { [k]: v }));
  async function run() {
    if (!group) { setErr('請先選擇你的統測群類'); return; }
    setBusy(true); setErr('');
    try { const d = await api('placementVt', { scores: scores, group: group, mode: mode }); setRes(d); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  }
  const cols = res ? [
    { key: 'dream', label: '夢幻', sub: '一階偏難', bg: '#f6d9df', color: '#8e1f34', list: res.dream || [] },
    { key: 'prep', label: '適中', sub: '一階邊緣', bg: '#fce9c8', color: '#b06f00', list: res.prep || [] },
    { key: 'safe', label: '安全', sub: '穩過一階', bg: '#d7efe0', color: '#15703c', list: res.safe || [] },
  ] : [];

  return (
    <div style={{ padding: '10px 4px 90px' }}>
      <h2 style={{ margin: '4px 0' }}>落點分析<span style={{ fontSize: '.8rem', color: '#5a6378', fontWeight: 600, marginLeft: 6 }}>技高・四技二專甄選</span></h2>
      <p style={{ color: '#5a6378', fontSize: '.9rem' }}>四技二專甄選入學「<b>第一階段統測倍率篩選</b>」過篩難易推估。選你的統測群、輸入五科級分（可先用模擬級分規劃），系統以各校系去年「各篩選順序的通過標準」逐段比對。<b>過一階 ≠ 錄取</b>；第二階段指定項目甄試（備審／面試／實作）另需準備。</p>

      <div style={{ display: 'inline-flex', border: '2px solid #16233b', borderRadius: 999, overflow: 'hidden', margin: '6px 0 12px' }}>
        <button onClick={() => setMode('sim')} style={{ border: 'none', padding: '7px 16px', fontWeight: 800, cursor: 'pointer', background: mode === 'sim' ? '#16233b' : '#fff', color: mode === 'sim' ? '#fff' : '#16233b' }}>模擬級分</button>
        <button onClick={() => setMode('real')} style={{ border: 'none', padding: '7px 16px', fontWeight: 800, cursor: 'pointer', background: mode === 'real' ? '#16233b' : '#fff', color: mode === 'real' ? '#fff' : '#16233b' }}>正式成績</button>
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: '.82rem', color: '#5a6378', fontWeight: 700, marginBottom: 4 }}>你的統測群類</div>
        <select value={group} onChange={(e) => setGroup(e.target.value)} style={PL_FLD}>
          <option value="">請選擇…</option>
          {VT_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: 8 }}>
        {VT_SUBS.map((s) => (
          <div key={s}>
            <div style={{ fontSize: '.8rem', color: '#5a6378', fontWeight: 700 }}>{VT_SUBLABEL[s]}</div>
            <input style={PL_FLD} type="number" min="0" max="15" placeholder="0–15" value={scores[s] || ''} onChange={(e) => setScore(s, e.target.value)} />
          </div>
        ))}
      </div>
      <div style={{ fontSize: '.78rem', color: '#5a6378', marginTop: 4 }}>統測各科級分。專業一／專業二依你的群不同（例：資電類專一＝基本電學等）。</div>

      <button style={{ ...PL_BTN, marginTop: 12 }} disabled={busy} onClick={run}>{busy ? '分析中…' : '分析落點'}</button>
      {err && <p style={{ color: '#b3261e', fontSize: '.9rem' }}>{err}</p>}

      {res && res.counts && (res.counts.dream + res.counts.prep + res.counts.safe) === 0 && (
        <div style={{ background: '#fff7e0', border: '1.5px solid #b06f00', borderRadius: 10, padding: '10px 14px', marginTop: 12, fontSize: '.85rem', color: '#7a4a00' }}>
          這個群目前沒有可比對的校系，或你填的科目與通過標準不符。確認群類選對、多填幾科再試。
        </div>
      )}

      {res && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginTop: 14 }}>
          {cols.map((col) => (
            <div key={col.key}>
              <div style={{ fontWeight: 800, background: col.bg, color: col.color, borderRadius: 8, padding: '6px 12px', textAlign: 'center' }}>{col.label}（{col.list.length}）<span style={{ fontWeight: 600, fontSize: '.72rem', opacity: .8 }}>· {col.sub}</span></div>
              {col.list.length === 0 && <p style={{ color: '#5a6378', fontSize: '.85rem', textAlign: 'center', marginTop: 8 }}>—</p>}
              {col.list.slice(0, 40).map((m, i) => (
                <div key={i} style={{ background: '#fff', border: '1.5px solid #d9d9d2', borderRadius: 10, padding: '10px 12px', marginTop: 8 }}>
                  <div style={{ fontWeight: 800, fontSize: '.92rem' }}>{m.school} {m.dept}</div>
                  <div style={{ color: '#5a6378', fontSize: '.8rem' }}>{m.group}{m.quota ? '｜名額 ' + m.quota : ''}</div>
                  <div style={{ fontSize: '.84rem', marginTop: 4 }}>
                    最吃緊關卡：<b>{m.binding || '—'}</b>
                    <span style={{ color: m.minMargin >= 0 ? '#15703c' : '#8e1f34', fontWeight: 800, marginLeft: 6 }}>
                      {m.minMargin >= 0 ? '+' : ''}{m.minMargin} 級分
                    </span>
                  </div>
                  {Array.isArray(m.detail) && m.detail.length > 0 && (
                    <div style={{ fontSize: '.74rem', color: '#5a6378', marginTop: 4, lineHeight: 1.5 }}>
                      {m.detail.map((d, j) => (
                        <span key={j}>順序{j + 1}｜{d.subs} 我{d.my}／去年{d.need}（{d.margin >= 0 ? '+' : ''}{d.margin}）{j < m.detail.length - 1 ? '　' : ''}</span>
                      ))}
                    </div>
                  )}
                  {m.partial && <div style={{ color: '#b06f00', fontSize: '.72rem', marginTop: 3 }}>＊部分關卡因缺對應科成績未計入</div>}
                </div>
              ))}
              {col.list.length > 40 && <p style={{ color: '#5a6378', fontSize: '.78rem', textAlign: 'center', marginTop: 6 }}>還有 {col.list.length - 40} 個…</p>}
            </div>
          ))}
        </div>
      )}

      {res && (
        <p style={{ fontSize: '.76rem', color: '#5a6378', marginTop: 14 }}>
          {res.note}<br />{res.source}
        </p>
      )}
    </div>
  );
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
  const enUS = student.school_type === 'us';
  const isVoc = student.school_type === 'vocational';   // 技高（統測／四技二專）
  const appLang = enUS ? 'en' : 'zh-TW'; // 產品只有兩種：美國英文 / 台灣繁中
  const T3 = (zh, en, cn) => (appLang === 'en' ? en : appLang === 'zh-CN' ? cn : zh);
  const tabs = isTeacher
    ? [['students', '學生總表'], ['deadlines', '時程管理'], ['reminders', '提醒']]
    : (enUS
      ? [['dashboard', T3('總覽', 'Overview', '总览')], ['college', T3('選校', 'College', '选校')], ['timeline', T3('時程', 'Timeline', '时程')]]
      : [['dashboard', '總覽'], ['artifacts', '素材倉庫'], ['placement', '落點'], ['timeline', '時程']]);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          {enUS ? 'TIPS College Prep' : 'TIPS 學習歷程'}<small>{student.name}{isTeacher ? '（老師）' : ''}</small>
        </div>
        {!isTeacher && <button onClick={() => setEditAnchor(true)}>{enUS ? T3('方向', 'Focus', '方向') : '科別／組別'}</button>}
        <button onClick={() => { setToken(null); setStudent(null); }}>{enUS ? T3('登出', 'Log out', '登出') : '登出'}</button>
      </header>

      {!isTeacher && tab === 'dashboard' && (enUS ? <USOverview student={student} lang={appLang} /> : <Dashboard student={student} onQuickAdd={goQuickAdd} />)}
      {!isTeacher && tab === 'artifacts' && <Artifacts student={student} autoOpen={quickAdd} onAutoOpenDone={() => setQuickAdd(null)} />}
      {!isTeacher && tab === 'college' && <CollegeMatch student={student} lang={appLang} />}
      {!isTeacher && tab === 'placement' && (isVoc ? <VtPlacement student={student} /> : <Placement student={student} />)}
      {!isTeacher && tab === 'timeline' && <Timeline lang={appLang} />}
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
  const ol = isUS ? 'en' : 'zh-TW';
  const ot = (zh, en, cn) => (ol === 'en' ? en : ol === 'zh-CN' ? cn : zh);
  const [anchor, setAnchor] = useState(student.focus_anchor || '');
  const [rigor, setRigor] = useState(student.rigor_track || '');
  const [gradYear, setGradYear] = useState(student.grad_year || '');
  const [testPlan, setTestPlan] = useState(student.test_plan || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    const focus = String(anchor || '').trim();
    if (!focus) { setErr(isVoc ? '請輸入或選擇你的科別' : '請先選一個'); return; }
    setBusy(true); setErr('');
    try {
      const extra = isUS ? { rigor_track: rigor, grad_year: gradYear, test_plan: testPlan } : {};
      await api('saveProfile', Object.assign({ focus_anchor: focus }, extra));
      // 用本地選的值直接放行，不依賴後端回傳（避免卡在設定頁）
      onDone(Object.assign({}, student, { focus_anchor: focus }, extra));
    } catch (e) {
      setErr(e.message || '儲存失敗，請再試一次');
      setBusy(false);
    }
  }

  return (
    <div className="shell">
      <div className="login-card" style={{ maxWidth: 460, margin: '40px auto' }}>
        <h1>{ot('先設定一下 👋', 'Set up in 10 seconds 👋', '先设置一下 👋')}</h1>

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
            <p className="sub">{ot('選一個你比較傾向的方向——之後隨時能改。', 'Pick the direction you lean toward — you can change it anytime.', '选一个你比较倾向的方向——之后随时能改。')}</p>
            <label htmlFor="ob-a">{ot('主修方向', 'Intended focus (general major direction)', '主修方向')}</label>
            <select id="ob-a" value={anchor} onChange={(e) => setAnchor(e.target.value)}>
              <option value="">Select…</option>
              <option value="cs">CS / Engineering</option>
              <option value="premed">Life Sciences / Pre-med</option>
              <option value="biz">Business / Economics</option>
              <option value="hum">Humanities / Social Science</option>
              <option value="arts">Arts / Design</option>
              <option value="explore">Still exploring</option>
            </select>
            <label htmlFor="ob-r">{ot('最高可修課程嚴謹度（選填）', 'Highest course rigor available (optional)', '最高可修课程严谨度（选填）')}</label>
            <select id="ob-r" value={rigor} onChange={(e) => setRigor(e.target.value)}>
              <option value="">—</option>
              <option value="honors">Honors</option>
              <option value="ap">AP</option>
              <option value="ib">IB</option>
              <option value="dual">Dual Enrollment</option>
              <option value="regular">Regular only</option>
            </select>
            <label htmlFor="ob-y">Expected graduation year</label>
            <select id="ob-y" value={gradYear} onChange={(e) => setGradYear(e.target.value)}>
              <option value="">Select…</option>
              {['2026', '2027', '2028', '2029', '2030', '2031', '2032'].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <label htmlFor="ob-t">Testing plan (SAT/ACT, for college admissions)</label>
            <select id="ob-t" value={testPlan} onChange={(e) => setTestPlan(e.target.value)}>
              <option value="">Select…</option>
              <option value="sat">Planning to take the SAT</option>
              <option value="act">Planning to take the ACT</option>
              <option value="both">SAT &amp; ACT</option>
              <option value="optional">Going test-optional (no scores)</option>
              <option value="undecided">Undecided</option>
            </select>
          </>
        )}

        {err && <p className="err">{err}</p>}
        <button className="btn cta-big" disabled={busy} onClick={save} style={{ marginTop: 16 }}>
          {busy ? ot('儲存中…', 'Saving…', '保存中…') : ot('完成，開始使用', 'Done — start using it', '完成，开始使用')}
        </button>
      </div>
    </div>
  );
}

/* ============ 登入 ============ */

function Login({ onDone }) {
  const [entry, setEntry] = useState(APP_MARKET === 'us' ? 'hs' : (APP_TRACK === 'vt' ? 'vt' : null));
  // 美國與台灣邏輯一致：一律先進「免費註冊」，登入為次要。
  const [mode, setMode] = useState('signup'); // 'login' | 'signup' | 'created'
  const [studentId, setStudentId] = useState('');   // 登入用帳號
  const [loginCode, setLoginCode] = useState('');    // 登入用密碼
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [account, setAccount] = useState('');        // 註冊自訂帳號
  const [password, setPassword] = useState('');      // 註冊自訂密碼
  const [phone, setPhone] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [city, setCity] = useState('');
  const [grade, setGrade] = useState(APP_MARKET === 'us' ? '9' : '10');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [created, setCreated] = useState(null);
  const isUS = APP_MARKET === 'us';
  const lt = (zh, en) => (isUS ? en : zh);
  const TW_CITIES = ['台北市', '新北市', '桃園市', '台中市', '台南市', '高雄市', '基隆市', '新竹市', '新竹縣', '苗栗縣', '彰化縣', '南投縣', '雲林縣', '嘉義市', '嘉義縣', '屏東縣', '宜蘭縣', '花蓮縣', '台東縣', '澎湖縣', '金門縣', '連江縣'];

  async function submit(e) {
    if (e && e.preventDefault) e.preventDefault();
    setBusy(true); setErr('');
    try {
      const data = await api('login', { studentId, loginCode });
      setToken(data.token);
      onDone(data.student);
    } catch (er) { setErr(er.message); } finally { setBusy(false); }
  }

  async function signup(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!name.trim()) { setErr(lt('請填學生姓名。', 'Please enter the student’s name.')); return; }
    if (email.indexOf('@') < 1) { setErr(lt('請填正確的 Email。', 'Please enter a valid email.')); return; }
    if (!/^[A-Za-z0-9._]{4,20}$/.test(account.trim())) { setErr(lt('帳號請用 4–20 個英文字母、數字、點或底線。', 'Account: 4–20 letters, digits, dot or underscore.')); return; }
    if (password.length < 6) { setErr(lt('密碼至少 6 碼。', 'Password must be at least 6 characters.')); return; }
    if (!isUS && !phone.trim()) { setErr('請填聯絡電話，方便我們與你聯繫。'); return; }
    if (!isUS && !consent) { setErr('請先閱讀並勾選個資使用同意。'); return; }
    setBusy(true); setErr('');
    try {
      const d = await api('signup', {
        name: name.trim(), email: email.trim(), account: account.trim(), password: password,
        phone: phone.trim(), school_name: schoolName.trim(), city: city, grade: grade,
        consent: consent, track: (isUS ? 'us' : entry),
      });
      setCreated(d);
      setMode('created');
    } catch (er) { setErr(er.message); } finally { setBusy(false); }
  }

  function enterApp() { setToken(created.token); onDone(created.student); }

  // ── 台灣線雙入口選擇畫面（先選高中/技高，再進註冊）──
  if (entry === null) {
    const ecard = { flex: 1, borderRadius: 16, padding: '22px 16px', textAlign: 'center', cursor: 'pointer', border: '2px solid transparent' };
    return (
      <div className="login-wrap">
        <div className="login-card">
          <h1>你要走哪一條？</h1>
          <p className="sub">選錯也沒關係，之後可以切換。共用的素材倉庫與 AI 教練兩邊都有。</p>
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <div role="button" tabIndex={0} onClick={() => { setEntry('hs'); setMode('signup'); }}
              style={Object.assign({}, ecard, { background: '#16233b', color: '#fff' })}>
              <div style={{ fontSize: 30 }}>🎓</div>
              <div style={{ fontWeight: 900, fontSize: 17, marginTop: 6 }}>高中</div>
              <div style={{ fontSize: 12.5, opacity: .85, marginTop: 2 }}>學測・個人申請<br />三年</div>
            </div>
            <div role="button" tabIndex={0} onClick={() => { setEntry('vt'); setMode('signup'); }}
              style={Object.assign({}, ecard, { background: '#fff', borderColor: '#16233b', color: '#16233b' })}>
              <div style={{ fontSize: 30 }}>🛠</div>
              <div style={{ fontWeight: 900, fontSize: 17, marginTop: 6 }}>技高</div>
              <div style={{ fontSize: 12.5, opacity: .85, marginTop: 2 }}>統測・四技二專<br />甄選入學</div>
            </div>
          </div>
          <button className="btn-sm" style={{ marginTop: 18 }} onClick={() => { setEntry('hs'); setMode('login'); }}>已有帳號，請登入 →</button>
          <button className="btn-sm" style={{ marginTop: 8 }} onClick={() => { window.location.search = '?m=us'; }}>美國升學？前往英文版 →</button>
        </div>
      </div>
    );
  }

  const PDPA = '依《個人資料保護法》，TIPS 蒐集你的姓名、Email、聯絡電話、就讀學校與縣市，僅用於提供學習歷程與升學陪伴服務、並在必要時與你聯絡；資料妥善保存、不對外提供、不外洩。你可隨時要求查詢、更正或刪除。';

  return (
    <div className="login-wrap">
      <div className="login-card">
        {!isUS && (
          <button className="btn-sm" style={{ marginBottom: 10 }} onClick={() => { setErr(''); setEntry(null); }}>← 返回選擇入口</button>
        )}
        {entry === 'vt' && !isUS && (
          <div style={{ display: 'inline-block', background: '#eef2fb', color: '#16233b', border: '1.5px solid #c7d0e0', borderRadius: 999, padding: '3px 12px', fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>🛠 技高・統測／四技二專甄選</div>
        )}
        {entry === 'hs' && !isUS && (
          <div style={{ display: 'inline-block', background: '#eef2fb', color: '#16233b', border: '1.5px solid #c7d0e0', borderRadius: 999, padding: '3px 12px', fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>🎓 高中・學測／個人申請</div>
        )}

        {mode === 'login' && (
          <form onSubmit={submit} autoComplete="on">
            <h1>{lt('學生登入', 'Log in')}</h1>
            <p className="sub">{lt('用你註冊時設定的帳號與密碼進入。', 'Sign in with the account and password you created.')}</p>
            <label htmlFor="sid">{lt('帳號', 'Account')}</label>
            <input id="sid" name="username" value={studentId} onChange={(e) => setStudentId(e.target.value)} placeholder={lt('你的帳號', 'your account')} autoComplete="username" />
            <label htmlFor="code">{lt('密碼', 'Password')}</label>
            <input id="code" name="password" type="password" value={loginCode} onChange={(e) => setLoginCode(e.target.value)} placeholder={lt('你的密碼', 'your password')} autoComplete="current-password" />
            <div style={{ fontSize: '.72rem', color: '#5a6378', marginTop: 4 }}>{lt('登入後可讓瀏覽器記住帳號密碼，下次自動帶入。', 'Let your browser save these to sign in faster next time.')}</div>
            <button className="btn" type="submit" disabled={busy} style={{ marginTop: 12 }}>{busy ? lt('登入中…', 'Signing in…') : lt('登入', 'Log in')}</button>
            {err && <p className="err">{err}</p>}
            <button type="button" className="btn-sm" style={{ marginTop: 14 }} onClick={() => { setErr(''); setMode('signup'); }}>{lt('還沒有帳號？免費註冊 →', 'New here? Sign up free →')}</button>
          </form>
        )}

        {mode === 'signup' && (
          <form onSubmit={signup} autoComplete="on">
            <h1>{lt('學生免費註冊', 'Sign up free 👋')}</h1>
            <p className="sub">{lt('建立帳號，開始把作品一路存下來。免費、免信用卡。', 'Create your account and capture the real work over four years. No credit card.')}</p>
            <label htmlFor="su-name">{lt('學生姓名', 'Student’s name')}</label>
            <input id="su-name" name="name" value={name} onChange={(e) => setName(e.target.value)} placeholder={lt('例：陳小明', 'e.g. Maya Chen')} autoComplete="name" />
            <label htmlFor="su-acct">{lt('設定帳號', 'Choose an account')}</label>
            <input id="su-acct" name="new-username" value={account} onChange={(e) => setAccount(e.target.value)} placeholder={lt('4–20 碼英數（登入用）', '4–20 letters/digits (for login)')} autoComplete="username" />
            <div style={{ fontSize: '.72rem', color: '#5a6378', marginTop: 4, lineHeight: 1.5 }}>{lt('帳號規則：4–20 碼，限英文字母、數字、點（.）或底線（_）；這就是你之後登入用的帳號，請自己設定並記牢。', 'Account rules: 4–20 characters — letters, digits, dot (.) or underscore (_). This is the account you’ll log in with, so choose it yourself and keep it.')}</div>
            <label htmlFor="su-pw">{lt('設定密碼', 'Choose a password')}</label>
            <input id="su-pw" name="new-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={lt('至少 6 碼', 'at least 6 characters')} autoComplete="new-password" />
            <div style={{ fontSize: '.72rem', color: '#5a6378', marginTop: 4, lineHeight: 1.5 }}>{lt('密碼規則：至少 6 碼，由你自己設定；登入時可讓瀏覽器記住，下次自動帶入。忘記時可請老師或客服協助查詢。', 'Password rules: at least 6 characters, set by you. Your browser can remember it for next time; if you forget it, a teacher or support can help you retrieve it.')}</div>
            <label htmlFor="su-email">{lt('Email（家長或學生）', 'Parent or student email')}</label>
            <input id="su-email" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" autoComplete="email" />
            {!isUS && (
              <>
                <label htmlFor="su-phone">聯絡電話</label>
                <input id="su-phone" name="tel" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09xx-xxx-xxx" autoComplete="tel" />
                <label htmlFor="su-school">就讀學校（選填）</label>
                <input id="su-school" value={schoolName} onChange={(e) => setSchoolName(e.target.value)} placeholder={entry === 'vt' ? '例：台中高工' : '例：台中一中'} autoComplete="organization" />
                <label htmlFor="su-city">縣市（選填）</label>
                <select id="su-city" value={city} onChange={(e) => setCity(e.target.value)}>
                  <option value="">請選擇…</option>
                  {TW_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </>
            )}
            <label htmlFor="su-grade">{lt('目前年級', 'Current grade')}</label>
            <select id="su-grade" value={grade} onChange={(e) => setGrade(e.target.value)}>
              {isUS
                ? ['9', '10', '11', '12'].map((g) => <option key={g} value={g}>{'Grade ' + g}</option>)
                : ['10', '11', '12'].map((g) => <option key={g} value={g}>{'高' + (g === '10' ? '一' : g === '11' ? '二' : '三') + '（' + g + '）'}</option>)}
            </select>
            {!isUS && (
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 12, fontSize: '.78rem', color: '#5a6378', lineHeight: 1.55 }}>
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 3, width: 'auto' }} />
                <span>我已閱讀並同意個資使用說明。{PDPA}</span>
              </label>
            )}
            <button className="btn" type="submit" style={{ marginTop: 14 }} disabled={busy}>{busy ? lt('建立中…', 'Creating…') : lt('免費建立帳號', 'Create free account')}</button>
            {err && <p className="err">{err}</p>}
            <button type="button" className="btn-sm" style={{ marginTop: 14 }} onClick={() => { setErr(''); setMode('login'); }}>{lt('已有帳號，請登入 →', '← Already have an account? Log in')}</button>
          </form>
        )}

        {mode === 'created' && created && (
          <>
            <h1>{lt('完成 🎉', 'You’re in 🎉')}</h1>
            <p className="sub">{lt('帳號建立成功。下次用你剛剛設定的帳號與密碼登入：', 'Account created. Next time, sign in with the account and password you just set:')}</p>
            <div style={{ background: '#fff', border: '1.5px solid var(--ink)', borderRadius: 10, padding: '12px 14px', margin: '6px 0 10px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.95rem' }}>{lt('帳號', 'Account')}: <b>{created.studentId}</b></div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.95rem', marginTop: 4 }}>{lt('密碼', 'Password')}: <b>{lt('你剛剛設定的密碼', 'the password you set')}</b></div>
            </div>
            <div style={{ fontSize: '.76rem', color: '#5a6378', lineHeight: 1.6, background: '#f7f7f4', border: '1px solid #e2e2dc', borderRadius: 8, padding: '10px 12px' }}>
              {lt('帳號與密碼都是你自己設定的，請記牢；忘記時可請老師或客服協助查詢。登入時可讓瀏覽器記住，下次自動帶入。',
                'You chose your own account and password — keep them safe. If forgotten, a teacher or support can help you retrieve them. Let your browser remember them for next time.')}
            </div>
            {!isUS && <div style={{ fontSize: '.72rem', color: '#8a94a6', marginTop: 8 }}>你的聯絡資訊已依個資法妥善保存、不外洩。</div>}
            <button className="btn" onClick={enterApp} style={{ marginTop: 14 }}>{lt('進入平台 →', 'Continue →')}</button>
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

function Timeline({ lang }) {
  const EN = lang === 'en';
  const L = (zh, en) => (EN ? en : zh);
  const [items, setItems] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api('listDeadlines').then(setItems).catch((e) => setErr(e.message));
  }, []);

  if (err) return <p className="err">{err}</p>;
  if (!items) return <p className="empty-hint">{L('載入中…', 'Loading…')}</p>;

  return (
    <>
      <h2>{L('未來一年的重要時程', 'Upcoming deadlines')}</h2>
      <DeadlineList items={items} lang={lang} emptyText={L('目前沒有排定的截止日。', 'No deadlines scheduled yet.')} />
      <p className="hint">{L('錯過「勾選至中央資料庫」的截止日，該學年資料將無法送交大學審查。', 'Deadlines shown here are set by your counselor — always confirm each college’s own dates on its official site.')}</p>
    </>
  );
}

function DeadlineList({ items, emptyText, lang }) {
  const EN = lang === 'en';
  if (!items.length) return <p className="empty-hint">{emptyText}</p>;
  return items.map((d) => {
    const days = daysUntil(d.due_at);
    return (
      <div key={d.deadline_id} className="deadline">
        <span className={`d-date ${days <= 7 ? 'soon' : ''}`}>
          {new Date(d.due_at).toLocaleDateString(EN ? 'en-US' : 'zh-TW', { month: 'numeric', day: 'numeric' })}
          {days <= 7 ? (EN ? ` (${days}d left)` : `（剩${days}天）`) : ''}
        </span>
        <div>
          <div className="d-title">{d.title}</div>
          {d.note && <div className="d-note">{d.note}</div>}
        </div>
      </div>
    );
  });
}
