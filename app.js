(() => {
  'use strict';
  const D = window.DPP;
  const $app = document.getElementById('app');

  /* ================= storage ================= */
  const KEY = 'dpp.progress.v1';
  const blank = () => ({ cards: {}, read: {}, quiz: {}, exams: [] });
  let S;
  try { S = Object.assign(blank(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { S = blank(); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };

  /* ================= indexes ================= */
  const sections = new Map();   // id -> section (with .chapter)
  const chapters = new Map();
  D.chapters.forEach(ch => {
    chapters.set(ch.id, ch);
    ch.sections.forEach(s => { s.chapter = ch; sections.set(s.id, s); });
  });
  const program = D.program || [];
  const modules = new Map(program.map(m => [m.id, m]));
  const thinkers = D.thinkers || [];

  const examOf = ref => { const [cid, i] = ref.split(':'); const ch = chapters.get(cid); return ch && ch.exam && ch.exam[+i] ? { ...ch.exam[+i], id: ref, chapter: ch } : null; };
  const allExam = () => D.chapters.flatMap(ch => (ch.exam || []).map((e, i) => ({ ...e, id: `${ch.id}:${i}`, chapter: ch })));

  // scope -> list of section ids
  function scopeSections(scope) {
    if (!scope || scope === 'all') return [...sections.keys()];
    if (modules.has(scope)) return modules.get(scope).sections.filter(id => sections.has(id));
    if (chapters.has(scope)) return chapters.get(scope).sections.map(s => s.id);
    if (sections.has(scope)) return [scope];
    return [];
  }
  function scopeLabel(scope) {
    if (!scope || scope === 'all') return 'Cały materiał';
    if (modules.has(scope)) { const m = modules.get(scope); return `${m.kind === 'W' ? 'Wykład' : 'Ćwiczenia'} ${m.nr}: ${m.title}`; }
    if (chapters.has(scope)) { const c = chapters.get(scope); return `Rozdział: ${c.title}`; }
    if (sections.has(scope)) return sections.get(scope).title;
    return scope;
  }
  function cardsFor(scope) {
    const out = [];
    scopeSections(scope).forEach(id => {
      const s = sections.get(id);
      (s.cards || []).forEach(([q, a], i) => out.push({ id: `${id}#c${i}`, q, a, src: `HD s. ${s.pages}`, sec: s }));
      (s.terms || []).forEach(([t, d], i) => out.push({ id: `${id}#t${i}`, q: `Pojęcie: ${t}`, a: d, src: `HD s. ${s.pages}`, sec: s }));
    });
    const secSet = new Set(scopeSections(scope));
    thinkers.forEach(t => {
      if (scope && scope !== 'all' && !(t.sections || []).some(x => secSet.has(x))) return;
      (t.cards || []).forEach(([q, a], i) => out.push({ id: `lx:${t.id}#${i}`, q, a, src: `LX s. ${t.lx}` }));
    });
    return out;
  }
  function quizFor(scope) {
    const out = [];
    scopeSections(scope).forEach(id => (sections.get(id).quiz || []).forEach((q, i) => out.push({ ...q, id: `${id}#q${i}`, sec: sections.get(id) })));
    return out;
  }

  /* ================= helpers ================= */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const today = () => Math.floor(Date.now() / 86400000);
  const pct = (a, b) => b ? Math.round(100 * a / b) : 0;
  const toast = msg => { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 1800); };

  function inline(s) {
    return esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[\s(„])\*(?!\s)(.+?)\*(?=[\s).,;:!?”"]|$)/g, '$1<em>$2</em>');
  }
  function md(src) {
    const lines = src.split('\n');
    let html = '', list = null, table = null, para = [];
    const flushPara = () => { if (para.length) { html += `<p>${inline(para.join(' '))}</p>`; para = []; } };
    const flushList = () => { if (list) { html += `</${list}>`; list = null; } };
    const flushTable = () => {
      if (!table) return;
      const rows = table.filter(r => !/^\|\s*-/.test(r)).map(r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
      html += '<div class="tablewrap"><table><thead><tr>' + rows[0].map(c => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>' +
        rows.slice(1).map(r => '<tr>' + r.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>';
      table = null;
    };
    for (const raw of lines) {
      const l = raw.trim();
      if (!l) { flushPara(); flushList(); flushTable(); continue; }
      if (l.startsWith('|')) { flushPara(); flushList(); (table ||= []).push(l); continue; }
      flushTable();
      let m;
      if ((m = l.match(/^#{3,4}\s+(.*)/))) { flushPara(); flushList(); html += `<h4>${inline(m[1])}</h4>`; continue; }
      if ((m = l.match(/^[-•]\s+(.*)/))) { flushPara(); if (list !== 'ul') { flushList(); html += '<ul>'; list = 'ul'; } html += `<li>${inline(m[1])}</li>`; continue; }
      if ((m = l.match(/^\d+\.\s+(.*)/))) { flushPara(); if (list !== 'ol') { flushList(); html += '<ol>'; list = 'ol'; } html += `<li>${inline(m[1])}</li>`; continue; }
      if (list && /^\s{2,}/.test(raw)) { html = html.replace(/<\/li>$/, ' ' + inline(l) + '</li>'); continue; }
      flushList();
      if (/^\*\*[^*]+:\*\*$/.test(l) || /^\*\*[^*]+\*\*:?$/.test(l)) { flushPara(); html += `<h4>${inline(l.replace(/\*\*/g, '').replace(/:$/, ''))}</h4>`; continue; }
      para.push(l);
    }
    flushPara(); flushList(); flushTable();
    return html;
  }

  /* ================= progress metrics ================= */
  function cardStats(list) {
    const now = today();
    let due = 0, learned = 0;
    const boxes = [0, 0, 0, 0, 0];
    list.forEach(c => {
      const st = S.cards[c.id];
      const box = st ? st.box : 0;
      boxes[Math.min(box, 4)]++;
      if (!st || st.due <= now) due++;
      if (box >= 3) learned++;
    });
    return { due, learned, boxes, total: list.length };
  }
  function mastery(scope) {
    const secs = scopeSections(scope);
    if (!secs.length) return 0;
    const read = secs.filter(id => S.read[id]).length / secs.length;
    const cards = cardsFor(scope);
    const cardScore = cards.length ? cards.reduce((a, c) => a + Math.min((S.cards[c.id]?.box || 0), 4) / 4, 0) / cards.length : 0;
    const qs = quizFor(scope);
    const qScore = qs.length ? qs.filter(q => S.quiz[q.id] === 1).length / qs.length : 0;
    return Math.round(100 * (read * 0.25 + cardScore * 0.45 + qScore * 0.30));
  }

  /* ================= views ================= */
  function setNav(name) {
    document.querySelectorAll('#mainnav a').forEach(a => a.classList.toggle('active', a.dataset.nav === name));
  }

  function modCard(m) {
    const ms = mastery(m.id);
    return `<a class="mod ${m.kind === 'C' ? 'c' : ''}" href="#/modul/${m.id}">
      <div class="num">${m.kind}${m.nr}</div>
      <div><h3>${esc(m.title)}</h3>
      <div class="meta"><span class="chip ${m.kind === 'W' ? 'w' : 'c'}">${m.kind === 'W' ? 'Wykład' : 'Ćwiczenia'}</span><div class="bar"><i style="width:${ms}%"></i></div><span class="mono">${ms}%</span></div></div>
    </a>`;
  }

  function viewHome() {
    setNav('home');
    const all = cardsFor('all');
    const cs = cardStats(all);
    const readCount = Object.keys(S.read).filter(k => sections.has(k)).length;
    const lastExam = S.exams[S.exams.length - 1];
    const w = program.filter(m => m.kind === 'W'), c = program.filter(m => m.kind === 'C');
    $app.innerHTML = `
      <section class="hero">
        <div class="intro">
          <span class="eyebrow">9.PR.D5.3.DPP · II rok prawa · 7 ECTS</span>
          <h1>Doktryny polityczno-prawne</h1>
          <p>Notatki, fiszki, quizy i symulacja egzaminu ustnego (3 pytania otwarte) – ułożone według programu wykładów i ćwiczeń. Każda informacja ma odnośnik do strony w podręczniku [HD] lub leksykonie [LX].</p>
          <div class="row">
            <a class="btn primary" href="#/fiszki">Powtórz fiszki (${cs.due})</a>
            <a class="btn" href="#/egzamin">Symulacja egzaminu</a>
            <a class="btn ghost" href="#/quiz">Szybki quiz</a>
          </div>
        </div>
        <div class="stats">
          <div class="stat"><b>${mastery('all')}%</b><span>opanowanie materiału</span></div>
          <div class="stat"><b>${cs.learned}/${cs.total}</b><span>fiszek utrwalonych (pudełko 4–5)</span></div>
          <div class="stat"><b>${readCount}/${sections.size}</b><span>przeczytanych tematów</span></div>
          <div class="stat"><b>${lastExam ? lastExam.grade.toFixed(1).replace('.', ',') : '–'}</b><span>${lastExam ? `ostatni egzamin (${lastExam.pct}%)` : 'brak próbnego egzaminu'}</span></div>
        </div>
      </section>
      <div class="section-title"><h2>Wykład</h2><span class="muted">${w.length} zagadnień</span></div>
      <div class="modlist">${w.map(modCard).join('')}</div>
      <div class="section-title"><h2>Ćwiczenia</h2><span class="muted">${c.length} zagadnień</span></div>
      <div class="modlist">${c.map(modCard).join('')}</div>`;
  }

  function viewProgram() {
    setNav('program');
    $app.innerHTML = `
      <div class="pagehead"><span class="eyebrow">Program przedmiotu i podręcznik</span><h1>Program</h1>
      <p>Zagadnienia z sylabusa z przypisanymi tematami z literatury. Niżej – ten sam materiał w układzie rozdziałów podręcznika.</p></div>
      <div class="stack">${program.map(m => `
        <div class="panel">
          <div class="row" style="justify-content:space-between">
            <div class="row"><span class="chip ${m.kind === 'W' ? 'w' : 'c'}">${m.kind === 'W' ? 'Wykład' : 'Ćwiczenia'} ${m.nr}</span><h3>${esc(m.title)}</h3></div>
            <div class="row"><a class="btn small primary" href="#/modul/${m.id}">Czytaj</a><a class="btn small" href="#/fiszki/${m.id}">Fiszki</a><a class="btn small" href="#/quiz/${m.id}">Quiz</a></div>
          </div>
          <ul class="muted" style="margin:10px 0 0;padding-left:1.1em;font-size:.9rem">${m.sections.filter(id => sections.has(id)).map(id => { const s = sections.get(id); return `<li>${esc(s.title)} <span class="ref">HD s. ${s.pages}</span></li>`; }).join('')}</ul>
        </div>`).join('')}
      </div>
      <div class="section-title"><h2>Rozdziały podręcznika</h2></div>
      <div class="grid">${D.chapters.map(ch => `<a class="mod" href="#/rozdzial/${ch.id}"><div class="num">${ch.id.replace('r', '')}</div><div><h3>${esc(ch.title)}</h3><div class="meta"><span class="ref">HD s. ${ch.pages}</span><div class="bar"><i style="width:${mastery(ch.id)}%"></i></div></div></div></a>`).join('')}</div>`;
  }

  function viewReader(kind, id) {
    setNav('program');
    let title, eyebrow, secIds, exam, scope = id, intro = '';
    if (kind === 'modul') {
      const m = modules.get(id); if (!m) return notFound();
      title = m.title; eyebrow = `${m.kind === 'W' ? 'Wykład' : 'Ćwiczenia'} ${m.nr}`; secIds = m.sections.filter(x => sections.has(x));
      exam = (m.exam || []).map(examOf).filter(Boolean);
      intro = m.intro || '';
    } else {
      const ch = chapters.get(id); if (!ch) return notFound();
      title = ch.title; eyebrow = `${ch.part} · HD s. ${ch.pages}`; secIds = ch.sections.map(s => s.id);
      exam = (ch.exam || []).map((e, i) => ({ ...e, id: `${ch.id}:${i}` }));
    }
    const secs = secIds.map(x => sections.get(x));
    const relThinkers = thinkers.filter(t => (t.sections || []).some(x => secIds.includes(x)));
    $app.innerHTML = `
      <div class="pagehead"><span class="eyebrow">${esc(eyebrow)}</span><h1>${esc(title)}</h1>
        ${intro ? `<p>${inline(intro)}</p>` : ''}
        <div class="row"><a class="btn primary" href="#/fiszki/${scope}">Fiszki z tego zagadnienia</a><a class="btn" href="#/quiz/${scope}">Quiz</a>${exam.length ? `<a class="btn ghost" href="#pytania" data-jump="pytania">Pytania egzaminacyjne (${exam.length})</a>` : ''}</div>
      </div>
      <div class="reader">
        <nav class="toc" aria-label="Spis tematów">
          <span class="eyebrow">Tematy</span>
          ${secs.map(s => `<a href="#${s.id}" data-jump="${s.id}" class="${S.read[s.id] ? 'done' : ''}">${S.read[s.id] ? '✓ ' : ''}${esc(s.title)}</a>`).join('')}
          ${relThinkers.length ? `<a href="#myslicele" data-jump="myslicele">Myśliciele w leksykonie (${relThinkers.length})</a>` : ''}
          ${exam.length ? `<a href="#pytania" data-jump="pytania">Pytania egzaminacyjne</a>` : ''}
        </nav>
        <div class="stack">
          ${secs.map(s => `
            <article class="note" id="${s.id}">
              <header>
                <div class="row" style="justify-content:space-between"><span class="eyebrow">${esc(s.chapter.title)}</span><span class="ref">HD s. ${esc(s.pages)}</span></div>
                <h2>${esc(s.title)}</h2>
                ${s.who ? `<div class="who">${esc(s.who)}</div>` : ''}
              </header>
              <div class="prose">${md(s.md)}</div>
              ${(s.terms || []).length ? `<div class="terms"><span class="eyebrow">Pojęcia</span>${s.terms.map(([t, d]) => `<div class="term"><b>${esc(t)}</b><span>${inline(d)}</span></div>`).join('')}</div>` : ''}
              <footer>
                <button class="btn small ${S.read[s.id] ? '' : 'primary'}" data-read="${s.id}">${S.read[s.id] ? '✓ Przeczytane' : 'Oznacz jako przeczytane'}</button>
                <a class="btn small" href="#/fiszki/${s.id}">Fiszki (${(s.cards || []).length + (s.terms || []).length})</a>
                <a class="btn small" href="#/quiz/${s.id}">Quiz (${(s.quiz || []).length})</a>
              </footer>
            </article>`).join('')}
          ${relThinkers.length ? `<section class="note" id="myslicele"><header><span class="eyebrow">Leksykon myślicieli [LX]</span><h2>Myśliciele</h2></header><div class="lex">${relThinkers.map(thinkerCard).join('')}</div></section>` : ''}
          ${exam.length ? `<section class="note" id="pytania"><header><span class="eyebrow">Egzamin ustny – pytania otwarte</span><h2>Pytania egzaminacyjne</h2><p class="muted" style="margin:0">Spróbuj odpowiedzieć na głos, potem rozwiń plan odpowiedzi.</p></header>
            <div class="stack">${exam.map(e => `<details class="panel"><summary style="cursor:pointer;font-family:var(--serif);font-size:1.1rem">${esc(e.q)}</summary><ol class="prose" style="margin-top:10px;font-size:1rem">${e.points.map(p => `<li>${inline(p)}</li>`).join('')}</ol></details>`).join('')}</div></section>` : ''}
        </div>
      </div>`;
  }

  function thinkerCard(t) {
    return `<article class="thinker" id="lx-${t.id}">
      <div><h3>${esc(t.name)}</h3><div class="dates">${esc(t.dates || '')} · <span class="ref">LX s. ${esc(t.lx)}</span></div></div>
      ${t.summary ? `<p>${inline(t.summary)}</p>` : ''}
      ${(t.ideas || []).length ? `<ul>${t.ideas.map(i => `<li>${inline(i)}</li>`).join('')}</ul>` : ''}
      ${(t.works || []).length ? `<div class="works">Dzieła: ${t.works.map(w => `<i>${esc(w)}</i>`).join(', ')}</div>` : ''}
    </article>`;
  }

  /* ---------- flashcards (Leitner) ---------- */
  const INTERVALS = [0, 1, 3, 7, 16];
  function viewFlash(scope) {
    setNav('fiszki');
    scope = scope || 'all';
    const list = cardsFor(scope);
    const now = today();
    let queue = shuffle(list.filter(c => !S.cards[c.id] || S.cards[c.id].due <= now));
    let cram = false;
    const render = () => {
      const st = cardStats(list);
      const card = queue[0];
      $app.innerHTML = `
        <div class="flash-wrap">
          <div class="pagehead" style="margin-bottom:0"><span class="eyebrow">Fiszki · system Leitnera</span><h1>${esc(scopeLabel(scope))}</h1></div>
          ${scopePicker(scope, 'fiszki')}
          <div class="boxes">${st.boxes.map((n, i) => `<div><b>${n}</b>pudełko ${i + 1}</div>`).join('')}</div>
          ${card ? `
            <div class="flash" id="flash" role="button" tabindex="0" aria-label="Pokaż odpowiedź">
              <div class="row" style="justify-content:space-between"><span class="eyebrow">${cram ? 'Powtórka dodatkowa' : `Do powtórki: ${queue.length}`}</span><span class="ref">${esc(card.src)}</span></div>
              <div class="q">${inline(card.q)}</div>
              <div class="a" id="ans" hidden>${inline(card.a)}</div>
              <div class="hint" id="hint">Kliknij lub naciśnij spację, aby odsłonić odpowiedź</div>
            </div>
            <div class="grade" id="grade" hidden>
              <button class="btn bad" data-g="0">Nie wiem <span class="mono">1</span></button>
              <button class="btn" data-g="1">Częściowo <span class="mono">2</span></button>
              <button class="btn good" data-g="2">Wiem <span class="mono">3</span></button>
            </div>` : `
            <div class="panel empty">
              <h2 style="margin-bottom:8px">Na dziś wszystko powtórzone</h2>
              <p>Utrwalone: ${st.learned} z ${st.total}. Kolejne fiszki wrócą zgodnie z harmonogramem.</p>
              ${list.length ? `<button class="btn primary" id="cram">Powtórz wszystkie jeszcze raz</button>` : ''}
            </div>`}
        </div>`;
      const reveal = () => { const a = document.getElementById('ans'); if (!a || !a.hidden) return; a.hidden = false; document.getElementById('hint').hidden = true; document.getElementById('grade').hidden = false; };
      document.getElementById('flash')?.addEventListener('click', reveal);
      document.getElementById('cram')?.addEventListener('click', () => { cram = true; queue = shuffle(list); render(); });
      document.querySelectorAll('#grade [data-g]').forEach(b => b.addEventListener('click', () => grade(+b.dataset.g)));
      keyHandler = e => {
        if (e.target.closest('input,textarea,select')) return;
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); reveal(); }
        const g = { '1': 0, '2': 1, '3': 2 }[e.key];
        if (g !== undefined && !document.getElementById('grade')?.hidden) grade(g);
      };
    };
    const grade = g => {
      const card = queue.shift();
      if (!cram) {
        const prev = S.cards[card.id] || { box: 0 };
        const box = g === 2 ? Math.min(prev.box + 1, 4) : g === 1 ? Math.max(prev.box, 1) - (prev.box > 1 ? 1 : 0) : 0;
        S.cards[card.id] = { box, due: today() + (g === 0 ? 0 : INTERVALS[box]) };
        save();
      }
      if (g === 0) queue.splice(Math.min(queue.length, 3), 0, card);
      render();
    };
    render();
  }

  function scopePicker(scope, route) {
    const opt = (v, l) => `<option value="${v}" ${v === scope ? 'selected' : ''}>${esc(l)}</option>`;
    return `<div class="row"><label class="muted" for="scopeSel" style="font-size:.85rem">Zakres:</label>
      <select id="scopeSel" data-route="${route}" style="flex:1;min-width:0">
        ${opt('all', 'Cały materiał')}
        <optgroup label="Wykład">${program.filter(m => m.kind === 'W').map(m => opt(m.id, `W${m.nr}. ${m.title}`)).join('')}</optgroup>
        <optgroup label="Ćwiczenia">${program.filter(m => m.kind === 'C').map(m => opt(m.id, `C${m.nr}. ${m.title}`)).join('')}</optgroup>
        <optgroup label="Rozdziały podręcznika">${D.chapters.map(c => opt(c.id, c.title)).join('')}</optgroup>
        ${sections.has(scope) ? opt(scope, sections.get(scope).title) : ''}
      </select></div>`;
  }

  /* ---------- quiz ---------- */
  function viewQuiz(scope) {
    setNav('quiz');
    scope = scope || 'all';
    const pool = quizFor(scope);
    // prefer questions not yet answered correctly
    const weighted = shuffle(pool).sort((a, b) => (S.quiz[a.id] === 1) - (S.quiz[b.id] === 1));
    const qs = weighted.slice(0, 10).map(q => {
      const order = shuffle(q.o.map((t, i) => ({ t, ok: i === q.a })));
      return { ...q, order };
    });
    let i = 0, score = 0, answered = false;
    const render = () => {
      if (!qs.length) { $app.innerHTML = `<div class="quiz"><div class="pagehead"><h1>Quiz</h1></div>${scopePicker(scope, 'quiz')}<div class="panel empty">Brak pytań w tym zakresie.</div></div>`; return; }
      if (i >= qs.length) {
        const p = pct(score, qs.length);
        $app.innerHTML = `<div class="quiz">
          <div class="pagehead"><span class="eyebrow">Wynik</span><h1>${score} / ${qs.length}</h1><p>${esc(scopeLabel(scope))}</p></div>
          <div class="panel gradebox"><div class="big">${p}%</div><div><div>Ocena wg skali przedmiotu: <b>${gradeFor(p).toFixed(1).replace('.', ',')}</b></div><div class="muted" style="font-size:.85rem">Błędne pytania wrócą w kolejnych losowaniach częściej.</div></div></div>
          <div class="row"><button class="btn primary" id="again">Kolejne 10 pytań</button><a class="btn" href="#/fiszki/${scope}">Przejdź do fiszek</a></div></div>`;
        document.getElementById('again').onclick = () => viewQuiz(scope);
        return;
      }
      const q = qs[i];
      answered = false;
      $app.innerHTML = `<div class="quiz">
        <div class="pagehead" style="margin-bottom:0"><span class="eyebrow">Quiz · pytanie ${i + 1} z ${qs.length} · wynik ${score}</span><h1 style="font-size:1.5rem">${esc(scopeLabel(scope))}</h1></div>
        ${scopePicker(scope, 'quiz')}
        <div class="bar"><i style="width:${pct(i, qs.length)}%"></i></div>
        <div class="panel lift stack">
          <div class="row" style="justify-content:space-between"><span class="eyebrow">${esc(q.sec.title)}</span></div>
          <div style="font:500 1.3rem/1.35 var(--serif)">${inline(q.q)}</div>
          <div class="options">${q.order.map((o, k) => `<button class="option" data-k="${k}"><span class="mono muted">${'ABCD'[k]}</span>&nbsp; ${inline(o.t)}</button>`).join('')}</div>
          <div id="after" hidden class="stack"></div>
        </div></div>`;
      document.querySelectorAll('.option').forEach(b => b.addEventListener('click', () => answer(+b.dataset.k)));
      keyHandler = e => {
        if (e.target.closest('input,textarea,select')) return;
        const k = { a: 0, b: 1, c: 2, d: 3, '1': 0, '2': 1, '3': 2, '4': 3 }[e.key.toLowerCase()];
        if (!answered && k !== undefined && k < q.order.length) answer(k);
        else if (answered && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); i++; render(); }
      };
    };
    const answer = k => {
      if (answered) return; answered = true;
      const q = qs[i]; const ok = q.order[k].ok;
      if (ok) score++;
      S.quiz[q.id] = ok ? 1 : 0; save();
      document.querySelectorAll('.option').forEach((b, idx) => { b.disabled = true; if (q.order[idx].ok) b.classList.add('ok'); else if (idx === k) b.classList.add('no'); });
      const after = document.getElementById('after');
      after.hidden = false;
      after.innerHTML = `<div class="explain"><b>${ok ? 'Dobrze.' : 'Źle.'}</b> ${inline(q.e || '')}</div><div class="row"><button class="btn primary" id="next">${i + 1 < qs.length ? 'Dalej' : 'Wynik'} →</button><a class="btn ghost small" href="#/rozdzial/${q.sec.chapter.id}">Wróć do notatki</a></div>`;
      document.getElementById('next').onclick = () => { i++; render(); };
      document.getElementById('next').focus();
    };
    render();
  }

  /* ---------- exam simulation ---------- */
  const SCALE = [[40, 2.0], [60, 3.0], [70, 3.5], [80, 4.0], [90, 4.5], [100, 5.0]];
  const gradeFor = p => (SCALE.find(([lim]) => p <= lim) || [0, 5])[1];
  const SCALE_LABELS = ['0–40% · 2,0', '41–60% · 3,0', '61–70% · 3,5', '71–80% · 4,0', '81–90% · 4,5', '91–100% · 5,0'];

  function viewExam() {
    setNav('egzamin');
    let scope = 'all';
    const pick = () => {
      let pool;
      if (scope === 'all') pool = allExam();
      else if (modules.has(scope)) pool = (modules.get(scope).exam || []).map(examOf).filter(Boolean);
      else pool = (chapters.get(scope)?.exam || []).map((e, i) => ({ ...e, id: `${scope}:${i}`, chapter: chapters.get(scope) }));
      // spread across different chapters when possible
      const byCh = shuffle(pool);
      const picked = [], used = new Set();
      byCh.forEach(e => { if (picked.length < 3 && !used.has(e.chapter.id)) { picked.push(e); used.add(e.chapter.id); } });
      byCh.forEach(e => { if (picked.length < 3 && !picked.includes(e)) picked.push(e); });
      return picked;
    };
    const intro = () => {
      const hist = S.exams.slice(-8).reverse();
      $app.innerHTML = `
        <div class="pagehead"><span class="eyebrow">Egzamin ustny · 3 pytania otwarte</span><h1>Symulacja egzaminu</h1>
        <p>Losujesz trzy pytania (w miarę możliwości z różnych epok). Odpowiadasz na głos lub pisemnie, potem zaznaczasz, które elementy planu odpowiedzi udało się omówić. Wynik przeliczany jest wg skali z sylabusa.</p></div>
        <div class="stack" style="max-width:760px">
          ${scopePicker('all', 'egzamin')}
          <div class="scale">${SCALE_LABELS.map(l => `<div>${l}</div>`).join('')}</div>
          <div class="row"><button class="btn primary" id="start">Losuj pytania</button><span class="muted">W puli: ${allExam().length} pytań</span></div>
          ${hist.length ? `<div class="panel"><span class="eyebrow">Historia</span><div class="stack" style="gap:6px;margin-top:10px">${hist.map(h => `<div class="row" style="justify-content:space-between;font-size:.9rem"><span>${new Date(h.at).toLocaleDateString('pl-PL')} · ${esc(h.scope)}</span><span><span class="mono">${h.pct}%</span> <span class="chip ${h.grade >= 3 ? 'good' : 'bad'}">${h.grade.toFixed(1).replace('.', ',')}</span></span></div>`).join('')}</div></div>` : ''}
        </div>`;
      document.getElementById('scopeSel').onchange = e => { scope = e.target.value; };
      document.getElementById('start').onclick = () => run(pick());
    };
    const run = qs => {
      if (!qs.length) { toast('Brak pytań w tym zakresie'); return; }
      const t0 = Date.now();
      $app.innerHTML = `
        <div class="pagehead"><span class="eyebrow">Symulacja egzaminu · ${esc(scopeLabel(scope))}</span><div class="row" style="justify-content:space-between"><h1>Twoje pytania</h1><span class="timer" id="timer">00:00</span></div></div>
        <div class="stack" style="max-width:820px">
          ${qs.map((q, n) => `
            <section class="panel exam-q">
              <span class="eyebrow">Pytanie ${n + 1} · ${esc(q.chapter.title)}</span>
              <div class="qn">${esc(q.q)}</div>
              <textarea id="ans-${n}" placeholder="Notatki do odpowiedzi (opcjonalnie)…"></textarea>
              <div class="points" id="pts-${n}" hidden>
                <span class="eyebrow">Plan odpowiedzi – zaznacz, co omówiłeś/aś</span>
                ${q.points.map((p, k) => `<label class="check"><input type="checkbox" id="p-${n}-${k}" data-n="${n}"> <span>${inline(p)}</span></label>`).join('')}
              </div>
            </section>`).join('')}
          <div class="row"><button class="btn primary" id="reveal">Zakończ i pokaż plan odpowiedzi</button><button class="btn ghost" id="redraw">Losuj inne</button></div>
          <div id="result"></div>
        </div>`;
      const timer = setInterval(() => { const el = document.getElementById('timer'); if (!el) return clearInterval(timer); const s = Math.floor((Date.now() - t0) / 1000); el.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }, 1000);
      document.getElementById('redraw').onclick = () => { clearInterval(timer); run(pick()); };
      document.getElementById('reveal').onclick = () => {
        clearInterval(timer);
        qs.forEach((q, n) => { document.getElementById(`pts-${n}`).hidden = false; });
        const btn = document.getElementById('reveal');
        btn.textContent = 'Oblicz wynik';
        btn.onclick = () => {
          let got = 0, total = 0;
          const per = qs.map((q, n) => { const k = q.points.filter((_, j) => document.getElementById(`p-${n}-${j}`).checked).length; got += k; total += q.points.length; return pct(k, q.points.length); });
          // each question weighs equally
          const p = Math.round(per.reduce((a, b) => a + b, 0) / per.length);
          const g = gradeFor(p);
          S.exams.push({ at: Date.now(), pct: p, grade: g, scope: scopeLabel(scope), qs: qs.map(q => q.id) });
          save();
          document.getElementById('result').innerHTML = `
            <div class="panel lift stack">
              <div class="gradebox"><div class="big">${g.toFixed(1).replace('.', ',')}</div><div><div><b>${p}%</b> planu odpowiedzi (${got}/${total} elementów)</div><div class="muted" style="font-size:.85rem">Pytania: ${per.map(x => x + '%').join(' · ')}</div></div></div>
              <div class="scale">${SCALE_LABELS.map((l, k) => `<div class="${SCALE[k][1] === g ? 'on' : ''}">${l}</div>`).join('')}</div>
              <div class="row">${qs.map(q => `<a class="btn small" href="#/rozdzial/${q.chapter.id}">Powtórz: ${esc(q.chapter.title)}</a>`).join('')}</div>
              <div class="row"><button class="btn primary" id="again">Nowy egzamin</button></div>
            </div>`;
          btn.hidden = true;
          document.getElementById('again').onclick = () => run(pick());
        };
      };
    };
    intro();
  }

  /* ---------- lexicon ---------- */
  function viewLex() {
    setNav('leksykon');
    const epochs = [...new Set(thinkers.map(t => t.epoch).filter(Boolean))];
    $app.innerHTML = `
      <div class="pagehead"><span class="eyebrow">Leksykon myślicieli politycznych i prawnych [LX]</span><h1>Myśliciele</h1>
      <p>${thinkers.length} sylwetek: daty, najważniejsze dzieła i poglądy. Numery stron wg wyd. III (2009).</p></div>
      <div class="lex-tools">
        <input type="search" id="lexq" placeholder="Szukaj nazwiska, dzieła, pojęcia…" aria-label="Szukaj w leksykonie">
        <select id="lexe" aria-label="Epoka"><option value="">Wszystkie epoki</option>${epochs.map(e => `<option>${esc(e)}</option>`).join('')}</select>
      </div>
      <div class="lex" id="lexlist"></div>`;
    const draw = () => {
      const q = document.getElementById('lexq').value.trim().toLowerCase();
      const ep = document.getElementById('lexe').value;
      const list = thinkers.filter(t => (!ep || t.epoch === ep) && (!q || JSON.stringify(t).toLowerCase().includes(q)));
      document.getElementById('lexlist').innerHTML = list.length ? list.map(thinkerCard).join('') : '<div class="empty">Brak wyników.</div>';
    };
    document.getElementById('lexq').oninput = draw;
    document.getElementById('lexe').onchange = draw;
    draw();
  }

  /* ---------- search ---------- */
  function viewSearch(initial) {
    setNav('szukaj');
    $app.innerHTML = `
      <div class="pagehead"><span class="eyebrow">Cały materiał</span><h1>Szukaj</h1></div>
      <div class="stack" style="max-width:820px">
        <input type="search" id="sq" placeholder="np. umowa społeczna, Monteskiusz, suwerenność…" value="${esc(initial || '')}" aria-label="Szukaj">
        <div class="results" id="sr"></div>
      </div>`;
    const plain = s => s.replace(/\*\*/g, '').replace(/[|#]/g, ' ');
    const run = () => {
      const q = document.getElementById('sq').value.trim();
      const out = document.getElementById('sr');
      if (q.length < 2) { out.innerHTML = '<div class="empty">Wpisz co najmniej 2 znaki.</div>'; return; }
      const ql = q.toLowerCase();
      const hits = [];
      const snip = txt => { const t = plain(txt); const i = t.toLowerCase().indexOf(ql); if (i < 0) return ''; const a = Math.max(0, i - 70); return (a ? '…' : '') + esc(t.slice(a, i)) + '<mark>' + esc(t.slice(i, i + q.length)) + '</mark>' + esc(t.slice(i + q.length, i + q.length + 90)) + '…'; };
      sections.forEach(s => {
        const hay = [s.title, s.who || '', s.md, ...(s.terms || []).flat()].join(' ');
        if (hay.toLowerCase().includes(ql)) hits.push({ href: `#/rozdzial/${s.chapter.id}`, jump: s.id, title: s.title, meta: `${s.chapter.title} · HD s. ${s.pages}`, snip: snip(hay), score: s.title.toLowerCase().includes(ql) ? 2 : 1 });
      });
      thinkers.forEach(t => {
        const hay = JSON.stringify([t.name, t.summary, t.ideas, t.works]);
        if (hay.toLowerCase().includes(ql)) hits.push({ href: '#/leksykon', title: t.name, meta: `Leksykon · LX s. ${t.lx}`, snip: snip([t.name, t.summary, ...(t.ideas || []), ...(t.works || [])].join(' · ')), score: t.name.toLowerCase().includes(ql) ? 3 : 1 });
      });
      hits.sort((a, b) => b.score - a.score);
      out.innerHTML = hits.length ? hits.slice(0, 60).map(h => `<a class="result" href="${h.href}" ${h.jump ? `data-after="${h.jump}"` : ''}><b>${esc(h.title)}</b> <span class="ref">${esc(h.meta)}</span><small>${h.snip}</small></a>`).join('') : '<div class="empty">Nic nie znaleziono.</div>';
    };
    document.getElementById('sq').oninput = run;
    run();
    document.getElementById('sq').focus();
  }

  function notFound() { $app.innerHTML = '<div class="empty"><h1>Nie znaleziono</h1><p><a href="#/">Wróć na pulpit</a></p></div>'; }

  /* ================= router ================= */
  let keyHandler = null;
  let pendingJump = null;
  document.addEventListener('keydown', e => keyHandler && keyHandler(e));
  function route() {
    keyHandler = null;
    const h = location.hash.replace(/^#\/?/, '');
    const [path, qs] = h.split('?');
    const parts = path.split('/').filter(Boolean);
    const params = new URLSearchParams(qs || '');
    switch (parts[0]) {
      case undefined: viewHome(); break;
      case 'program': viewProgram(); break;
      case 'modul': viewReader('modul', parts[1]); break;
      case 'rozdzial': viewReader('rozdzial', parts[1]); break;
      case 'fiszki': viewFlash(parts[1]); break;
      case 'quiz': viewQuiz(parts[1]); break;
      case 'egzamin': viewExam(); break;
      case 'leksykon': viewLex(); break;
      case 'szukaj': viewSearch(params.get('q')); break;
      default: return; // in-page anchors
    }
    if (pendingJump) { const el = document.getElementById(pendingJump); pendingJump = null; if (el) { el.scrollIntoView(); return; } }
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', e => {
    const h = location.hash;
    if (h && !h.startsWith('#/')) return; // plain anchor
    route();
  });
  document.addEventListener('click', e => {
    const j = e.target.closest('[data-jump]');
    if (j) { e.preventDefault(); document.getElementById(j.dataset.jump)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); return; }
    const after = e.target.closest('[data-after]');
    if (after) pendingJump = after.dataset.after;
    const r = e.target.closest('[data-read]');
    if (r) {
      const id = r.dataset.read;
      if (S.read[id]) delete S.read[id]; else S.read[id] = Date.now();
      save();
      const done = !!S.read[id];
      r.textContent = done ? '✓ Przeczytane' : 'Oznacz jako przeczytane';
      r.classList.toggle('primary', !done);
      const t = document.querySelector(`.toc a[data-jump="${id}"]`);
      if (t) { t.classList.toggle('done', done); t.textContent = (done ? '✓ ' : '') + sections.get(id).title; }
    }
  });
  document.addEventListener('change', e => {
    const s = e.target.closest('#scopeSel');
    if (s && s.dataset.route !== 'egzamin') location.hash = `#/${s.dataset.route}/${s.value}`;
  });

  /* ================= theme ================= */
  const root = document.documentElement;
  try { const t = localStorage.getItem('dpp.theme'); if (t) root.dataset.theme = t; } catch {}
  document.getElementById('themeToggle').addEventListener('click', () => {
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('dpp.theme', root.dataset.theme); } catch {}
  });

  route();
})();
