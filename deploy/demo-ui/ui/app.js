/*
 * vLLM Semantic Router — demo console.
 *
 * Plain ES2017, no framework, no bundler. The whole thing is three files in a
 * ConfigMap, which means editing the demo during a conference is a text edit
 * and an `oc apply -k`.
 *
 * It talks to the router over the ordinary OpenAI-compatible API — there is no
 * private side channel. Everything it displays comes from either a response
 * header the router set, or the response body itself.
 */

'use strict';

/* ------------------------------------------------------------------ state */

const state = {
  baseUrl: '',
  index: 0,
  running: false,
  // per-case: array of result objects, kept so switching cases does not lose
  // what the audience just saw
  results: Object.create(null),
  // per-case: prompt text the presenter edited, so a live edit survives the
  // re-renders that happen between steps of a multi-step case
  edits: Object.create(null),
  tally: { qwen: 0, phi: 0, cached: 0, blocked: 0 },
  banner: null,
};

const $ = (sel) => document.querySelector(sel);

/* ------------------------------------------------------- endpoint handling */

/**
 * Where to send requests.
 *
 * Served from the in-cluster demo-ui pod, the answer is "nowhere special":
 * nginx proxies /v1 to the router on the same origin, so an empty base URL is
 * correct and there is no CORS involved at all. Opened from a laptop or from
 * GitHub Pages, you need the router's Route host — the router's Envoy sends
 * permissive CORS headers precisely so that works.
 */
function defaultBaseUrl() {
  const saved = localStorage.getItem('vsr-base-url');
  if (saved !== null) return saved;

  const fromQuery = new URLSearchParams(location.search).get('api');
  if (fromQuery) return fromQuery.replace(/\/+$/, '');

  // file:// has no usable origin to proxy through.
  if (location.protocol === 'file:') return '';

  return '';
}

function apiUrl(path) {
  const base = state.baseUrl.replace(/\/+$/, '');
  return base + path;
}

/* ----------------------------------------------------------- health check */

async function checkHealth() {
  const dot = $('#status-dot');
  const text = $('#status-text');
  dot.className = 'dot busy';
  text.textContent = 'checking…';

  if (!state.baseUrl && location.protocol === 'file:') {
    dot.className = 'dot bad';
    text.textContent = 'set an API URL';
    return;
  }

  try {
    const res = await fetch(apiUrl('/v1/models'), { method: 'GET' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json().catch(() => null);
    const n = data && Array.isArray(data.data) ? data.data.length : null;
    dot.className = 'dot ok';
    text.textContent = n === null ? 'router up' : `router up · ${n} model${n === 1 ? '' : 's'}`;
  } catch (err) {
    dot.className = 'dot bad';
    text.textContent = 'unreachable';
    showBanner(
      'Cannot reach the router at ' + (state.baseUrl || 'this origin') + '/v1/models — ' +
      err.message + '. Check the API box in the top right, and that the semantic-router ' +
      'pod is Running.'
    );
  }
}

// The banner lives in state rather than in the DOM, because render() rebuilds
// #content wholesale — a DOM-only banner would vanish as soon as the presenter
// switched case.
function showBanner(msg) {
  state.banner = msg;
  const el = $('#banner');
  if (el) {
    el.textContent = msg;
    el.classList.remove('hidden');
  }
}

function hideBanner() {
  state.banner = null;
  const el = $('#banner');
  if (el) el.classList.add('hidden');
}

/* ------------------------------------------------------------- inspection */

/**
 * Which model actually answered.
 *
 * The router sets x-vsr-selected-model when it makes a decision. That header
 * is the authoritative answer, but it only reaches the browser if the CORS
 * policy exposes it (it does) or we are same-origin (we usually are). The
 * response body's "model" field is the fallback, and is what the backing vLLM
 * server reports as its served model name.
 */
function extractModel(res, body) {
  const header = res.headers.get('x-vsr-selected-model');
  if (header) return { model: header, source: 'header' };
  if (body && typeof body.model === 'string' && body.model) {
    return { model: body.model, source: 'body' };
  }
  return { model: null, source: 'none' };
}

function extractContent(body) {
  try {
    const msg = body.choices[0].message;
    return typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
  } catch (_) {
    return '';
  }
}

/**
 * A guardrail block comes back as an ordinary 200 chat completion whose content
 * is the fast_response plugin's configured message. Every one of those messages
 * in the router config starts with "Request blocked".
 */
function isBlocked(content) {
  return /request blocked/i.test(content || '');
}

/**
 * Cache hits: trust the router's header when it is there. Otherwise infer, and
 * say so — a result card labelled "inferred" is honest, a result card that
 * claims a cache hit it cannot prove is not.
 */
function detectCache(res, elapsedMs, baselineMs) {
  const header = res.headers.get('x-vsr-cache-hit');
  if (header !== null) {
    return { hit: /^(true|1|yes)$/i.test(header), certain: true };
  }
  if (baselineMs && elapsedMs < baselineMs * 0.5 && baselineMs - elapsedMs > 300) {
    return { hit: true, certain: false };
  }
  return { hit: false, certain: header !== null };
}

function badgeClassFor(model, blocked) {
  if (blocked) return 'blocked';
  if (!model) return 'unknown';
  if (model.includes('qwen')) return 'qwen';
  if (model.includes('phi')) return 'phi';
  return 'unknown';
}

/* ---------------------------------------------------------------- running */

async function runStep(step, baselineMs) {
  const started = performance.now();
  let res, body, raw;

  try {
    res = await fetch(apiUrl('/v1/chat/completions'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(step.body),
    });
    raw = await res.text();
  } catch (err) {
    return { error: 'Network error: ' + err.message, elapsedMs: performance.now() - started };
  }

  const elapsedMs = performance.now() - started;

  try {
    body = JSON.parse(raw);
  } catch (_) {
    return {
      error: `HTTP ${res.status} — response was not JSON`,
      raw: raw.slice(0, 2000),
      elapsedMs,
    };
  }

  if (!res.ok) {
    return {
      error: `HTTP ${res.status}` + (body.error ? ' — ' + (body.error.message || body.error) : ''),
      raw,
      body,
      elapsedMs,
    };
  }

  const content = extractContent(body);
  const blocked = isBlocked(content);
  const { model, source } = extractModel(res, body);
  const cache = detectCache(res, elapsedMs, baselineMs);

  return {
    elapsedMs,
    model,
    modelSource: source,
    blocked,
    cache,
    content,
    usage: body.usage || null,
    decision: res.headers.get('x-vsr-selected-decision') || res.headers.get('x-vsr-selected-category'),
    reasoning: res.headers.get('x-vsr-selected-reasoning'),
    upstreamMs: res.headers.get('x-envoy-upstream-service-time'),
    body,
  };
}

function verdictFor(result, expect) {
  if (!expect || result.error) return null;
  if (expect.blocked) return result.blocked ? 'pass' : 'fail';
  if (result.blocked) return 'fail';
  if (expect.model) {
    if (!result.model) return null;
    return result.model === expect.model ? 'pass' : 'fail';
  }
  return null;
}

/** Current prompt text for a step: whatever the presenter last typed, else the shipped prompt. */
function promptFor(uc, i) {
  const edited = state.edits[uc.id] && state.edits[uc.id][i];
  if (typeof edited === 'string') return edited;
  const msgs = uc.steps[i].body.messages;
  return msgs[msgs.length - 1].content;
}

/** Snapshot every textarea into state, so edits survive the re-render between steps. */
function captureEdits(uc) {
  const edits = state.edits[uc.id] || (state.edits[uc.id] = {});
  uc.steps.forEach((_, i) => {
    const ta = document.querySelector(`#prompt-${i}`);
    if (ta) edits[i] = ta.value;
  });
}

async function runCase() {
  if (state.running) return;
  const uc = USE_CASES[state.index];

  // Capture before the first render(), which would otherwise rebuild the
  // textareas from the shipped prompts and silently discard a live edit.
  captureEdits(uc);

  state.running = true;
  render();

  const results = [];
  state.results[uc.id] = results;

  let baselineMs = null;

  for (let i = 0; i < uc.steps.length; i++) {
    const step = uc.steps[i];
    const bodyToSend = JSON.parse(JSON.stringify(step.body));
    const last = bodyToSend.messages.length - 1;
    bodyToSend.messages[last] = { ...bodyToSend.messages[last], content: promptFor(uc, i) };

    results.push({ pending: true, label: step.label });
    render();

    const r = await runStep({ ...step, body: bodyToSend }, baselineMs);
    r.label = step.label;
    r.expect = step.expect || uc.expect;
    r.verdict = verdictFor(r, r.expect);

    if (i === 0 && !r.error) baselineMs = r.elapsedMs;

    results[i] = r;
    updateTally(r);
    render();
  }

  state.running = false;
  render();
}

function updateTally(r) {
  if (r.error) return;
  if (r.blocked) state.tally.blocked++;
  else if (r.cache && r.cache.hit) state.tally.cached++;
  else if (r.model && r.model.includes('qwen')) state.tally.qwen++;
  else if (r.model && r.model.includes('phi')) state.tally.phi++;
  renderTally();
}

function renderTally() {
  $('#n-qwen').textContent = state.tally.qwen;
  $('#n-phi').textContent = state.tally.phi;
  $('#n-cached').textContent = state.tally.cached;
  $('#n-blocked').textContent = state.tally.blocked;
}

/* --------------------------------------------------------------- rendering */

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function renderSidebar() {
  const nav = $('#sidebar');
  nav.innerHTML = '';
  let n = 0;

  for (const group of GROUPS) {
    const cases = USE_CASES.filter((u) => u.group === group.name);
    if (!cases.length) continue;

    const head = document.createElement('div');
    head.className = 'group-head';
    head.innerHTML = `<h2>${esc(group.name)}</h2><p>${esc(group.blurb)}</p>`;
    nav.appendChild(head);

    for (const uc of cases) {
      const i = USE_CASES.indexOf(uc);
      n++;
      const results = state.results[uc.id];
      let verdict = '';
      if (results && results.length && !results.some((r) => r.pending)) {
        const verdicts = results.map((r) => r.verdict).filter(Boolean);
        if (verdicts.length) {
          const ok = verdicts.every((v) => v === 'pass');
          verdict = `<span class="verdict ${ok ? 'pass' : 'fail'}">${ok ? '✓' : '✕'}</span>`;
        }
      }

      const btn = document.createElement('button');
      btn.className = 'case-btn' + (i === state.index ? ' active' : '');
      btn.innerHTML = `${verdict}<span class="idx">${n}</span>${esc(uc.title)}`;
      btn.onclick = () => select(i);
      nav.appendChild(btn);
    }
  }
}

function expectChip(expect) {
  if (!expect) return '';
  if (expect.blocked) {
    return `<span class="chip expect-blocked">expect <b>blocked</b></span>`;
  }
  const cls = expect.model && expect.model.includes('qwen') ? 'expect-qwen' : 'expect-phi';
  return `<span class="chip ${cls}">expect <b>${esc(expect.model)}</b></span>`;
}

function renderResult(r) {
  if (r.pending) {
    return `<div class="result">
      <div class="result-head">
        <span class="result-label">${esc(r.label || 'Run')}</span>
        <span class="model-badge unknown">routing…</span>
      </div>
      <div class="result-body" style="color:var(--text-faint)">waiting for the router…</div>
    </div>`;
  }

  if (r.error) {
    return `<div class="result is-fail">
      <div class="result-head">
        <span class="result-label">${esc(r.label || 'Run')}</span>
        <span class="pill fail">error</span>
        <span class="stat"><b>${Math.round(r.elapsedMs)}</b> ms</span>
      </div>
      <div class="result-body blocked-msg">${esc(r.error)}</div>
      ${r.raw ? `<div class="result-foot"><details><summary>Raw response</summary><pre>${esc(r.raw)}</pre></details></div>` : ''}
    </div>`;
  }

  const cls = badgeClassFor(r.model, r.blocked);
  const badgeText = r.blocked ? 'BLOCKED' : r.model || 'unknown';

  const bits = [];
  bits.push(`<span class="stat"><b>${Math.round(r.elapsedMs)}</b> ms</span>`);
  if (r.upstreamMs) bits.push(`<span class="stat">upstream <b>${esc(r.upstreamMs)}</b> ms</span>`);
  if (r.usage) {
    bits.push(
      `<span class="stat">tokens <b>${r.usage.prompt_tokens ?? '?'}</b> in / <b>${r.usage.completion_tokens ?? '?'}</b> out</span>`
    );
  }
  if (r.decision) bits.push(`<span class="stat">decision <b>${esc(r.decision)}</b></span>`);
  if (r.reasoning) bits.push(`<span class="stat">reasoning <b>${esc(r.reasoning)}</b></span>`);
  if (r.cache && r.cache.hit) {
    bits.push(`<span class="pill cached">${r.cache.certain ? 'cache hit' : 'cache hit (inferred)'}</span>`);
  }
  if (r.verdict) {
    bits.push(`<span class="pill ${r.verdict}">${r.verdict}</span>`);
  }
  if (r.modelSource === 'body') {
    bits.push(
      `<span class="stat" title="The router did not expose x-vsr-selected-model to this page, so the model name comes from the response body — which is what the backend vLLM server reported.">from body</span>`
    );
  }

  const verdictClass = r.verdict ? ` is-${r.verdict}` : '';

  return `<div class="result${verdictClass}">
    <div class="result-head">
      <span class="result-label">${esc(r.label || 'Run')}</span>
      <span class="model-badge ${cls}">${esc(badgeText)}</span>
      ${bits.join('')}
    </div>
    <div class="result-body${r.blocked ? ' blocked-msg' : ''}">${esc(r.content || '(empty response)')}</div>
    <div class="result-foot"><details><summary>Raw JSON</summary><pre>${esc(JSON.stringify(r.body, null, 2))}</pre></details></div>
  </div>`;
}

/**
 * The latency-saving banner.
 *
 * Only shown when a later step was actually a cache hit. A multi-step case can
 * get faster for unrelated reasons — a warm GPU, a shorter answer — and
 * captioning that as "no GPU work" would be a claim the data does not support.
 */
function renderDelta(results) {
  const ok = results.filter((r) => !r.pending && !r.error);
  if (ok.length < 2) return '';
  if (!ok.slice(1).some((r) => r.cache && r.cache.hit)) return '';

  const first = ok[0].elapsedMs;
  const fastest = Math.min(...ok.slice(1).map((r) => r.elapsedMs));
  if (fastest >= first) return '';
  const pct = Math.round((1 - fastest / first) * 100);
  if (pct < 20) return '';

  return `<div class="delta">
    ${Math.round(first)} ms → ${Math.round(fastest)} ms &nbsp;·&nbsp; <b>${pct}% faster</b>
    — answered from the semantic cache, with no GPU work at all.
  </div>`;
}

function render() {
  renderSidebar();

  const uc = USE_CASES[state.index];
  const results = state.results[uc.id] || [];
  const content = $('#content');

  const steps = uc.steps
    .map((step, i) => {
      const text = promptFor(uc, i);
      const rows = Math.min(7, Math.max(2, Math.ceil(text.length / 95) + 1));
      const pinned = step.body.model !== 'auto';
      return `<div class="step">
        <div class="step-head">
          <span class="label">${esc(step.label)}</span>
          <code>model: ${esc(step.body.model)}</code>
          ${pinned ? '<span class="stat" style="color:var(--text-faint)">routing bypassed</span>' : ''}
          ${step.expect ? expectChip(step.expect) : ''}
        </div>
        <textarea class="prompt" id="prompt-${i}" rows="${rows}" spellcheck="false">${esc(text)}</textarea>
      </div>`;
    })
    .join('');

  content.innerHTML = `
    <div id="banner" class="banner${state.banner ? '' : ' hidden'}">${esc(state.banner || '')}</div>

    <h2 class="case-title">${esc(uc.title)}</h2>
    <p class="case-sub">${esc(uc.subtitle)}</p>

    <div class="meta-row">
      <span class="chip decision">decision: <b>${esc(uc.decision)}</b></span>
      ${expectChip(uc.expect)}
      <span class="chip">${uc.steps.length} request${uc.steps.length === 1 ? '' : 's'}</span>
    </div>

    ${steps}

    <div class="runbar">
      <button class="run-btn" id="run" ${state.running ? 'disabled' : ''}>
        ${state.running ? 'Running…' : 'Run ▶'}
      </button>
      <span class="hint">
        <kbd>Enter</kbd> run &nbsp; <kbd>&uarr;</kbd><kbd>&darr;</kbd> switch case &nbsp; <kbd>?</kbd> shortcuts
      </span>
    </div>

    ${results.length ? renderDelta(results) : ''}
    <div class="results">
      ${results.length ? results.map(renderResult).join('') : '<div class="empty">No results yet — press Run.</div>'}
    </div>

    <div class="panel talk">
      <h3>Talk track</h3>
      <p>${esc(uc.talk)}</p>
    </div>

    <div class="panel">
      <h3>How this works</h3>
      <p>${esc(uc.why)}</p>
    </div>
  `;

  $('#run').onclick = runCase;

  // Persist edits as they are typed, so they survive switching away and back.
  uc.steps.forEach((_, i) => {
    const ta = document.querySelector(`#prompt-${i}`);
    if (!ta) return;
    ta.addEventListener('input', () => {
      (state.edits[uc.id] || (state.edits[uc.id] = {}))[i] = ta.value;
    });
  });
}

/* ------------------------------------------------------------- navigation */

function select(i) {
  if (state.running) return;
  state.index = Math.max(0, Math.min(USE_CASES.length - 1, i));
  location.hash = USE_CASES[state.index].id;
  render();
  $('#content').scrollTop = 0;
  const active = document.querySelector('.case-btn.active');
  if (active) active.scrollIntoView({ block: 'nearest' });
}

/** Reset to a clean slate — results, counters and any live prompt edits. */
function clearAll() {
  state.results = Object.create(null);
  state.edits = Object.create(null);
  state.tally = { qwen: 0, phi: 0, cached: 0, blocked: 0 };
  renderTally();
  render();
}

function onKey(e) {
  const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
  if (e.key === '?' && !typing) {
    e.preventDefault();
    $('#help').showModal();
    return;
  }
  if (typing) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  switch (e.key) {
    case 'ArrowDown':
    case 'j':
      e.preventDefault();
      select(state.index + 1);
      break;
    case 'ArrowUp':
    case 'k':
      e.preventDefault();
      select(state.index - 1);
      break;
    case 'Enter':
    case 'r':
      e.preventDefault();
      runCase();
      break;
    case 'c':
      e.preventDefault();
      clearAll();
      break;
    default:
      if (/^[1-9]$/.test(e.key)) {
        e.preventDefault();
        select(Number(e.key) - 1);
      }
  }
}

function setScale(delta) {
  const cur = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--scale')) || 1;
  const next = Math.max(0.75, Math.min(1.8, cur + delta));
  document.documentElement.style.setProperty('--scale', String(next));
  localStorage.setItem('vsr-scale', String(next));
}

/* ------------------------------------------------------------------- init */

function init() {
  state.baseUrl = defaultBaseUrl();
  $('#base-url').value = state.baseUrl;
  $('#base-url').placeholder = 'same origin';

  const savedScale = localStorage.getItem('vsr-scale');
  if (savedScale) document.documentElement.style.setProperty('--scale', savedScale);

  const fromHash = location.hash.replace(/^#/, '');
  const hashIndex = USE_CASES.findIndex((u) => u.id === fromHash);
  if (hashIndex >= 0) state.index = hashIndex;

  $('#base-url').addEventListener('change', (e) => {
    state.baseUrl = e.target.value.trim().replace(/\/+$/, '');
    localStorage.setItem('vsr-base-url', state.baseUrl);
    hideBanner();
    checkHealth();
  });

  $('#zoom-in').onclick = () => setScale(0.1);
  $('#zoom-out').onclick = () => setScale(-0.1);
  $('#help-btn').onclick = () => $('#help').showModal();

  document.addEventListener('keydown', onKey);
  window.addEventListener('hashchange', () => {
    const i = USE_CASES.findIndex((u) => u.id === location.hash.replace(/^#/, ''));
    if (i >= 0 && i !== state.index) select(i);
  });

  renderTally();
  render();
  checkHealth();
  // Re-probe periodically so a router restart mid-talk shows up in the header
  // rather than as a mystery failure on the next Run.
  setInterval(checkHealth, 30000);
}

document.addEventListener('DOMContentLoaded', init);
