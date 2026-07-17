/**
 * TIPS 學習歷程平台 — AI 反思教練（Phase 2）
 *
 * 金鑰：指令碼屬性 ANTHROPIC_API_KEY（William 自行設定，不入版控、不入前端）
 * 模型分工：反思引導／綜整教練 claude-sonnet-5；百字簡述結構檢查 claude-haiku-4-5
 * 定位：引導反思、不代寫。所有協助自動標記 ai_assisted 並附 AI 使用揭露聲明
 *（符合教育部 113.12.13 函釋：AI 限「整理歸納、深化反思、完善呈現」且須揭露）。
 */

const AI_MODELS = { coach: 'claude-sonnet-5', fast: 'claude-haiku-4-5' };

/** 教練人格與領域知識（＝這位 AI 教練的「訓練」核心） */
const AI_SYSTEM = [
  '你是「TIPS 學習歷程反思教練」，服務台灣的普通型高中與技術型高中（高職）學生，協助他們把課程學習成果與多元表現寫得真實、具體、有反思深度。',
  '',
  '【絕對原則】',
  '1. 永遠不代寫。你的輸出只能是：提問、具體觀察、結構建議、對學生「原有文字」的修改建議。若學生要求整段代寫，溫和拒絕，改用引導提問幫他自己寫出來。',
  '2. 你只做教育部 113.12.13 函釋允許的三件事：整理歸納、深化反思、完善呈現。每次協助結尾都提醒：最終文字必須由學生本人撰寫與確認。',
  '3. 語氣像親切的學長姐：繁體中文、口語、直接，15-18 歲學生秒懂。一次最多 3-5 個問題，不要轟炸。',
  '',
  '【領域規則（判斷時必須內建）】',
  '- 大學審查原則「三重二不」：重視校內課程學習成果、重視基本能力（閱讀理解／邏輯推理／表達）、重視真實性與個人特質；不以量取勝、不必項項具備。',
  '- 100 字簡述三要素：活動描述＋個人學習＋連結校系。缺一就明確指出缺哪個。',
  '- 勾選規則：每學年至多勾選課程學習成果 6 件、多元表現 10 件送中央資料庫。二階參採件數依管道不同：大學個人申請（普高主要管道）各校系至多參採固定 3＋10 件；四技二專甄選（技高主要管道）件數由各系自訂、未必是 3＋10，且專題實作 B-1 至少 1 件、自製 PDF 容量為 4MB×件數上限——技高學生務必逐系查簡章。',
  '- 技術型高中（高職）學生：專題實作（B-1）是多數科系必採項目，反思聚焦「實作過程、卡關與除錯、工法或材料的取捨」。',
  '- 教授在意「學到什麼、怎麼學到、之後想怎麼延伸」，遠勝過「得了什麼獎」。名次和頭銜只是入口，過程才是內容。',
  '- 失敗與轉折是金礦：卡關、重做、改變方法的段落最能展現真實性，主動挖掘它。',
  '- 課程學習成果必須在「修課當學期」依學校公告期限上傳學校平台並經任課教師認證，逾期無法補件（只在高一開的課，只能在高一上傳）；多元表現免認證、可跨學年補傳。若學生提到想補舊學期的課程成果，要提醒這個限制。',
  '- 每個大學校系參採的項目都不同：普高學生查 ColleGo!（collego.edu.tw）的校系參採資料，技高學生查四技二專備審資料準備指引平台（gotech.ntust.edu.tw）。引導學生對照目標校系實際參採的項目來挑素材與寫作重點。',
  '- 中央資料庫檔案規格：文件限 PDF/JPG/PNG 每件 4MB、影音限 MP3/MP4 每件 10MB；個人申請自製 PDF 每項 5MB。',
  '- 具體性優先：不問空泛問題。「你學到什麼？」是爛問題；「你提到第二次實驗才成功，第一次失敗後你改了哪個變因、為什麼選它？」是好問題。所有提問必須錨定學生素材裡的具體細節。',
  '',
  '【輸出格式】',
  '- 用簡短段落與條列，適合手機閱讀。',
  '- 不要輸出任何 markdown 符號（#、**、---、`）；小標用【】、條列用「・」或數字。',
].join('\n');

/** 呼叫 Claude API（金鑰只存在指令碼屬性，永不外洩至前端） */
function callClaude_(model, userText, maxTokens) {
  const key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!key) throw new Error('尚未設定 ANTHROPIC_API_KEY，請至專案設定 > 指令碼屬性新增');
  const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify({
      model: model,
      max_tokens: maxTokens || 1200,
      system: AI_SYSTEM,
      messages: [{ role: 'user', content: userText }],
    }),
    muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  const body = JSON.parse(res.getContentText());
  if (code !== 200) {
    throw new Error('AI 服務暫時無法使用（HTTP ' + code + '）' + (body.error && body.error.message ? '：' + body.error.message : ''));
  }
  const text = body.content.map(function (c) { return c.text || ''; }).join('');
  const tokens = body.usage ? (body.usage.input_tokens || 0) + (body.usage.output_tokens || 0) : 0;
  return { text: text, tokens: tokens };
}

/** AI 使用揭露聲明（自動附在每次協助結尾，學生可直接複製到成果末尾） */
function aiDisclosure_(what) {
  return '—\n📋 AI 使用揭露（可直接附在成果檔案末尾）：\n「本檔案製作過程使用 AI 工具（Claude）協助' + what + '；內容為本人親自撰寫，並經本人確認與修改。」';
}

/** 記錄 AI 使用（ai_sessions 分頁）並把素材標記為 ai_assisted */
function logAi_(studentId, artifactId, tool, transcript, tokens) {
  getSheet_(CONFIG.SHEETS.ai_sessions).appendRow([
    shortId_('AI'), studentId, artifactId || '', tool, String(transcript).slice(0, 4000), tokens, nowIso_(),
  ]);
  if (artifactId) {
    const loc = locateRow_(CONFIG.SHEETS.artifacts, 'artifact_id', artifactId);
    if (loc) {
      const sh = getSheet_(CONFIG.SHEETS.artifacts);
      const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
      sh.getRange(loc.rowIndex, headers.indexOf('ai_assisted') + 1).setValue(true);
      sh.getRange(loc.rowIndex, headers.indexOf('updated_at') + 1).setValue(nowIso_());
    }
  }
}

/** 取得學生的素材（含權限檢查） */
function ownArtifact_(student, artifactId) {
  const a = findRow_(CONFIG.SHEETS.artifacts, 'artifact_id', artifactId);
  if (!a || a.student_id !== student.student_id || a.deleted_at) throw new Error('找不到這筆素材');
  return a;
}

/* ---------------- 端點 1：引導反思 ---------------- */

/**
 * 針對單一素材產生 3-5 個錨定細節的反思問題＋一個觀察。
 * payload: { artifact_id }
 */
function aiReflect_(student, p) {
  if (!p || !p.artifact_id) return { ok: false, error: '缺少 artifact_id' };
  const a = ownArtifact_(student, p.artifact_id);
  const prompt = [
    '學生背景：' + (student.school_type === 'vocational' ? '技術型高中（高職）' : '普通型高中') + '、' + student.grade + ' 年級' +
      (student.target_majors && student.target_majors !== '[]' ? '、目標校系參考：' + student.target_majors : ''),
    '素材類型：' + (a.category === 'course_result' ? '課程學習成果' : '多元表現') + (a.subcategory ? '／' + a.subcategory : ''),
    '標題：' + a.title,
    '學期：' + (a.semester || '未填'),
    '科目或活動：' + (a.subject_or_event || '未填'),
    '學生的隨手筆記：' + (a.quick_note || '（尚未填寫）'),
    '學生目前的草稿：' + (a.draft_content || '（尚未開始寫）'),
    '',
    '任務：請根據以上素材，(1) 先給一個具體的觀察（這份素材最有潛力的切入點是什麼，一兩句話）；(2) 提出 3-5 個錨定素材細節的反思問題，幫學生把過程與學習挖出來；(3) 若筆記太空泛，第一個問題就引導他補上具體事實（時間、做了什麼、結果如何）。',
  ].join('\n');
  const r = callClaude_(AI_MODELS.coach, prompt, 1200);
  logAi_(student.student_id, a.artifact_id, 'reflect', r.text, r.tokens);
  return { ok: true, data: { text: r.text + '\n\n' + aiDisclosure_('引導反思與整理歸納') } };
}

/* ---------------- 端點 2：百字簡述健檢 ---------------- */

/**
 * 檢查 100 字簡述的三要素結構，給修改建議（以學生原句為基礎，不整段重寫）。
 * payload: { artifact_id, draft }
 */
function aiSummary_(student, p) {
  if (!p || !p.artifact_id) return { ok: false, error: '缺少 artifact_id' };
  const a = ownArtifact_(student, p.artifact_id);
  const draft = String((p.draft != null ? p.draft : a.summary_100) || '').trim();
  if (!draft) return { ok: false, error: '請先寫下你的簡述草稿（幾句話就好），教練才能給建議' };
  const prompt = [
    '學生背景：' + (student.school_type === 'vocational' ? '技術型高中（高職）' : '普通型高中') +
      (student.target_majors && student.target_majors !== '[]' ? '、目標校系參考：' + student.target_majors : ''),
    '素材標題：' + a.title + '（' + (a.category === 'course_result' ? '課程學習成果' : '多元表現') + '）',
    '學生寫的 100 字簡述草稿：',
    '「' + draft + '」',
    '',
    '任務：(1) 用三要素（活動描述／個人學習／連結校系）逐項檢查這份草稿，明確說哪個要素有、哪個缺或太弱；(2) 針對最弱的一個要素，提出 1-2 個補強問題讓學生回答；(3) 給「保留學生原句、只調整結構與贅字」的修改建議——用「把A句移到開頭」「刪掉B這幾個字」這種指令式建議，不要自己重寫一整段；(4) 若超過 100 字，指出可以刪的部分。',
  ].join('\n');
  const r = callClaude_(AI_MODELS.fast, prompt, 1000);
  logAi_(student.student_id, a.artifact_id, 'summary', r.text, r.tokens);
  return { ok: true, data: { text: r.text + '\n\n' + aiDisclosure_('結構檢查與完善呈現') } };
}

/* ---------------- 端點 3：綜整心得教練（高三） ---------------- */

/**
 * 從學生三年素材庫出發，引導多元表現綜整心得（至多 800 字）的主題軸線與段落架構。
 * payload: { focus }（選填：學生想強調的方向）
 */
function aiSynthesis_(student, p) {
  const arts = readAll_(CONFIG.SHEETS.artifacts).filter(function (a) {
    return a.student_id === student.student_id && !a.deleted_at;
  });
  if (!arts.length) return { ok: false, error: '素材倉庫還是空的，先累積幾件素材再來找教練' };
  const list = arts.slice(0, 30).map(function (a) {
    return '- [' + (a.category === 'course_result' ? '課程成果' : '多元表現') + '] ' + a.title +
      '（' + (a.semester || '?') + '）' + (a.quick_note ? '：' + String(a.quick_note).slice(0, 60) : '');
  }).join('\n');
  const prompt = [
    '學生背景：' + (student.school_type === 'vocational' ? '技術型高中（高職）' : '普通型高中') + '、' + student.grade + ' 年級' +
      (student.target_majors && student.target_majors !== '[]' ? '、目標校系參考：' + student.target_majors : ''),
    (p && p.focus ? '學生想強調的方向：' + p.focus : ''),
    '學生三年累積的素材清單：',
    list,
    '',
    '任務：協助學生規劃「多元表現綜整心得」（上限 800 字）。請 (1) 從素材清單找出 1-2 條可能的主題軸線（例如同一能力的持續深化、或跨領域的串連），說明為什麼這條線有說服力；(2) 給一個 3-4 段的段落大綱，每段標明建議使用哪幾件素材；(3) 每段附 1 個引導問題幫學生下筆。提醒：綜整心得重點是「素材之間的關聯與成長軌跡」，不是逐件流水帳。你只給架構與提問，正文由學生自己寫。',
  ].join('\n');
  const r = callClaude_(AI_MODELS.coach, prompt, 1600);
  logAi_(student.student_id, '', 'synthesis', r.text, r.tokens);
  return { ok: true, data: { text: r.text + '\n\n' + aiDisclosure_('素材整理歸納與架構引導') } };
}
