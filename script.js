// ============================================================
// Trackler OS v2 — Personal Assistant OS
// Rebuilt against Trackler_OS_v2_Final_Product_Specification
// ============================================================

const STORAGE_KEY = 'trackler_data_v4';
const THEME_KEY = 'trackler_theme';
const MOTION_KEY = 'trackler_motion';
const USER_NAME = 'Alen';
const VIEWS = ['today', 'schedule', 'projects', 'insights', 'settings'];

function safeRun(label, fn) {
  try { fn(); } catch (err) { console.error(`[Trackler] "${label}" failed:`, err); }
}

// ---- Seed data ----
const DEFAULT_ITEMS = [
  { id: 'i1', title: 'Design Homepage UI', type: 'task', priority: 'high', start: '09:00', durationMin: 45, done: false, icon: '🎨' },
  { id: 'i2', title: 'Break', type: 'break', priority: 'none', start: '09:45', durationMin: 15, done: false, icon: '☕' },
  { id: 'i3', title: 'Team Standup Meeting', type: 'meeting', priority: 'none', start: '10:00', durationMin: 45, done: false, icon: '👥', meta: 'Google Meet' },
  { id: 'i4', title: 'Implement Authentication', type: 'task', priority: 'high', start: '11:00', durationMin: 120, done: false, icon: '💻' },
  { id: 'i5', title: 'Lunch Break', type: 'break', priority: 'none', start: '13:00', durationMin: 60, done: false, icon: '🍴' },
  { id: 'i6', title: 'Database Schema Design', type: 'task', priority: 'medium', start: '15:00', durationMin: 90, done: false, icon: '🗄️' },
  { id: 'i7', title: 'Code Review', type: 'task', priority: 'none', start: '16:30', durationMin: 60, done: false, icon: '✅' },
  { id: 'i8', title: 'Write API Documentation', type: 'task', priority: 'low', start: '17:30', durationMin: 60, done: false, icon: '📄' },
];

const DEFAULT_UPCOMING = [
  { id: 'u1', time: '10:00 AM', title: 'Project Kickoff Meeting', color: 'purple' },
  { id: 'u2', time: '02:00 PM', title: 'Marketing Strategy Review', color: 'orange' },
  { id: 'u3', time: '04:00 PM', title: 'Gym Workout', color: 'green' },
  { id: 'u4', time: '06:00 PM', title: 'Dinner with Sam', color: 'blue' },
  { id: 'u5', time: '08:00 PM', title: 'Read 20 pages', color: 'purple' },
];

function dateStr(d) {
  d = d || new Date();
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function uid() { return 'i' + Math.random().toString(36).slice(2, 9); }
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        items: Array.isArray(parsed.items) ? parsed.items : DEFAULT_ITEMS.slice(),
        upcoming: Array.isArray(parsed.upcoming) ? parsed.upcoming : DEFAULT_UPCOMING.slice(),
        dailyFocusHistory: parsed.dailyFocusHistory || {},
        suggestionDismissed: !!parsed.suggestionDismissed,
        autoSchedule: !!parsed.autoSchedule,
      };
    }
  } catch (e) { /* ignore corrupt storage */ }
  return {
    items: DEFAULT_ITEMS.slice(),
    upcoming: DEFAULT_UPCOMING.slice(),
    dailyFocusHistory: {},
    suggestionDismissed: false,
    autoSchedule: false,
  };
}

const state = loadState();
// Session-only UI state (not persisted) — Trackler's "persistent memory" applies to task/schedule
// data above; ephemeral view state (which orb animation is showing, dismissed banners this
// session, drag state) resets each visit by design.
const uiState = {
  listening: false,
  assistantState: 'idle', // idle | listening | thinking | speaking | executing
  dismissedRecIds: new Set(),
  dragId: null,
  currentView: 'today',
  assistantOpen: false,
};

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ }
}

// ============================================================
// HELPERS
// ============================================================

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function fromMinutes(mins) {
  mins = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function to12h(hhmm) {
  let [h, m] = hhmm.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  let h12 = h % 12; if (h12 === 0) h12 = 12;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}

function formatDuration(min) {
  min = Math.max(0, Math.round(min));
  const h = Math.floor(min / 60), m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function computeStats() {
  const tasks = state.items.filter(i => i.type === 'task' || i.type === 'focus');
  const activeTasks = tasks.filter(i => !i.done);
  const tasksLeft = activeTasks.length;
  const meetings = state.items.filter(i => i.type === 'meeting' && !i.done).length;
  const highPriority = activeTasks.filter(i => i.priority === 'high').length;
  const focusMinutes = tasks.reduce((sum, i) => sum + i.durationMin, 0);
  return { tasksLeft, meetings, highPriority, focusMinutes, totalTasks: tasks.length };
}

function nowMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function overdueItems() {
  const nm = nowMinutes();
  return state.items.filter(i => !i.done && (toMinutes(i.start) + i.durationMin) < nm);
}

function nextUpItem() {
  const nm = nowMinutes();
  const upcoming = state.items.filter(i => !i.done && toMinutes(i.start) >= nm)
    .sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  if (upcoming.length) return upcoming[0];
  return state.items.filter(i => !i.done).sort((a, b) => toMinutes(a.start) - toMinutes(b.start))[0] || null;
}

// ============================================================
// GREETING + DAILY BRIEFING (replaces dashboard metrics)
// ============================================================

function updateGreeting() {
  const now = new Date();
  const hour = now.getHours();
  let greetingWord;
  if (hour >= 5 && hour < 12) greetingWord = 'Good Morning';
  else if (hour >= 12 && hour < 17) greetingWord = 'Good Afternoon';
  else if (hour >= 17 && hour < 21) greetingWord = 'Good Evening';
  else greetingWord = 'Good Night';

  const heading = document.getElementById('greetingHeading');
  if (heading) heading.innerHTML = `${greetingWord}, ${USER_NAME} <span class="wave">👋</span>`;
}

function renderBriefing() {
  const el = document.getElementById('briefingText');
  const sub = document.getElementById('greetingSub');
  if (!el) return;

  const { tasksLeft, meetings, highPriority, focusMinutes } = computeStats();
  const overdue = overdueItems();
  const next = nextUpItem();

  const parts = [];

  if (tasksLeft === 0 && meetings === 0) {
    parts.push("You're all caught up for today — nothing left on the timeline. 🎉");
  } else {
    let lead = `You have ${tasksLeft} task${tasksLeft === 1 ? '' : 's'}`;
    if (meetings > 0) lead += ` and ${meetings} meeting${meetings === 1 ? '' : 's'}`;
    lead += ' on the books today';
    if (focusMinutes > 0) lead += `, with ${formatDuration(focusMinutes)} of focused work planned`;
    lead += '.';
    parts.push(lead);

    if (highPriority > 0) {
      parts.push(`${highPriority} of those ${highPriority === 1 ? 'is' : 'are'} high priority — worth tackling first.`);
    }
    if (overdue.length > 0) {
      parts.push(`${overdue.length} item${overdue.length === 1 ? " is" : "s are"} running behind schedule.`);
    } else if (next) {
      parts.push(`Next up: "${next.title}" at ${to12h(next.start)}.`);
    }
  }

  el.textContent = parts.join(' ');

  if (sub) {
    if (tasksLeft === 0 && meetings === 0) sub.textContent = "You're all caught up for today! 🎉";
    else sub.textContent = "I've prepared everything for a productive day.";
  }

  saveState();
}

// ============================================================
// SINGLE AI RECOMMENDATION
// (Consolidates the old insight banner + suggestion card into
//  exactly one, most-relevant recommendation at a time.)
// ============================================================

function getRecommendation() {
  // 1. A concrete, actionable scheduling suggestion.
  const target = state.items.find(i => i.title === 'Database Schema Design' && !i.done);
  if (!state.suggestionDismissed && target && target.start !== '14:00' && !uiState.dismissedRecIds.has('suggestion-move')) {
    return {
      id: 'suggestion-move',
      title: `Move "${target.title}" to 2:00 PM?`,
      body: 'I found a clearer afternoon block with fewer interruptions for this one.',
      actions: [
        { label: 'Move it', primary: true, onClick: () => {
            assistantExecute(`Moving "${target.title}" to 2:00 PM…`);
            target.start = '14:00';
            saveState();
            renderAll();
          } },
        { label: 'Maybe later', onClick: () => {
            state.suggestionDismissed = true;
            saveState();
            renderRecommendation();
          } },
      ],
    };
  }

  // 2. Overdue nudge — highest priority once something is actually behind.
  const overdue = overdueItems();
  if (overdue.length > 0 && !uiState.dismissedRecIds.has('overdue')) {
    const item = overdue[0];
    return {
      id: 'overdue',
      title: `"${item.title}" is running behind.`,
      body: overdue.length > 1
        ? `That's ${overdue.length} items behind schedule — want me to push them later?`
        : 'Want me to push it to the next open slot?',
      actions: [
        { label: 'Push it back', primary: true, onClick: () => {
            assistantExecute(`Rescheduling "${item.title}"…`);
            item.start = fromMinutes(nowMinutes() + 15);
            saveState();
            renderAll();
          } },
        { label: 'Dismiss', onClick: () => { uiState.dismissedRecIds.add('overdue'); renderRecommendation(); } },
      ],
    };
  }

  // 3. A calm, data-derived insight — only one, chosen deterministically (not cycled).
  const { tasksLeft, highPriority, focusMinutes } = computeStats();
  if (highPriority > 0 && !uiState.dismissedRecIds.has('insight-priority')) {
    return {
      id: 'insight-priority',
      title: `${highPriority} high-priority item${highPriority === 1 ? '' : 's'} today.`,
      body: 'Tackling those first tends to make the rest of the day feel lighter.',
      actions: [],
    };
  }
  if (focusMinutes > 0 && !uiState.dismissedRecIds.has('insight-focus')) {
    return {
      id: 'insight-focus',
      title: 'You usually do your best work before 12 PM.',
      body: `${formatDuration(focusMinutes)} of deep work is planned — ${tasksLeft} task${tasksLeft === 1 ? '' : 's'} left to go.`,
      actions: [],
    };
  }

  return null;
}

function renderRecommendation() {
  const card = document.getElementById('recommendationCard');
  if (!card) return;
  const rec = getRecommendation();

  if (!rec) {
    card.classList.add('hidden');
    return;
  }
  card.classList.remove('hidden');
  card.dataset.recId = rec.id;

  const titleEl = document.getElementById('recTitle');
  const bodyEl = document.getElementById('recBody');
  const actionsEl = document.getElementById('recActions');
  if (titleEl) titleEl.textContent = rec.title;
  if (bodyEl) bodyEl.textContent = rec.body;
  if (actionsEl) {
    actionsEl.innerHTML = '';
    rec.actions.forEach(a => {
      const btn = document.createElement('button');
      btn.className = 'btn small ' + (a.primary ? 'btn-primary' : 'btn-ghost');
      btn.textContent = a.label;
      btn.addEventListener('click', a.onClick);
      actionsEl.appendChild(btn);
    });
  }
}

// ============================================================
// DAY TIMELINE
// ============================================================

function iconBgClass(item) {
  if (item.type === 'meeting') return 'blue';
  if (item.type === 'break') return 'gray';
  if (item.type === 'focus') return 'purple';
  if (item.priority === 'high') return 'red';
  if (item.priority === 'medium') return 'orange';
  return 'purple';
}

function dotColorFor(item, isCurrent) {
  if (isCurrent) return 'red';
  if (item.done) return 'green';
  if (item.type === 'meeting') return 'blue';
  if (item.type === 'break') return 'gray';
  if (item.priority === 'high') return 'purple';
  if (item.priority === 'medium') return 'orange';
  return 'gray';
}

function buildItemLi(item, isCurrent) {
  const li = document.createElement('li');
  li.className = 'day-item' + (isCurrent ? ' current' : '') + (item.done ? ' done' : '');
  li.dataset.id = item.id;
  li.draggable = true;

  const dotColor = dotColorFor(item, isCurrent);
  const iconBg = isCurrent ? 'red' : iconBgClass(item);

  let tagHtml = '';
  if (item.priority === 'high') tagHtml = '<span class="day-item-tag day-item-tag--high">High Priority</span>';
  else if (item.priority === 'medium') tagHtml = '<span class="day-item-tag day-item-tag--medium">Medium Priority</span>';
  else if (item.priority === 'low') tagHtml = '<span class="day-item-tag day-item-tag--low">Low Priority</span>';
  else if (item.meta) tagHtml = `<span class="day-item-tag day-item-tag--meta">${escapeHtml(item.meta)}</span>`;

  li.innerHTML = `
    <div class="day-time">${to12h(item.start)}</div>
    <div class="day-dot day-dot--${dotColor}"></div>
    <button class="day-item-check" aria-label="Mark ${escapeHtml(item.title)} ${item.done ? 'not done' : 'complete'}">✓</button>
    <div class="day-item-icon day-item-icon--${iconBg}">${item.icon || '📝'}</div>
    <div class="day-item-body">
      <span class="day-item-title">${escapeHtml(item.title)}</span>
      ${tagHtml}
    </div>
    <button class="day-item-delete" aria-label="Delete ${escapeHtml(item.title)}">✕</button>
    <div class="day-item-duration">${formatDuration(item.durationMin)}</div>
  `;
  if (item.done) li.querySelector('.day-item-check').classList.add('done-check');
  return li;
}

function renderDayTimeline() {
  const ul = document.getElementById('dayTimeline');
  if (!ul) return;
  ul.innerHTML = '';

  const active = state.items.filter(i => !i.done);
  if (active.length === 0) {
    ul.innerHTML = '<li class="empty-state">Nothing left on today\'s timeline — add something below.</li>';
  } else {
    const sorted = [...active].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
    const currentItem = sorted[0];
    sorted.forEach(item => {
      ul.appendChild(buildItemLi(item, item.id === currentItem.id));
    });
  }

  renderCompletedList();
}

function renderCompletedList() {
  const toggle = document.getElementById('completedToggle');
  const list = document.getElementById('completedList');
  if (!toggle || !list) return;
  const done = state.items.filter(i => i.done).sort((a, b) => toMinutes(a.start) - toMinutes(b.start));

  if (done.length === 0) {
    toggle.classList.add('hidden');
    list.classList.add('hidden');
    list.innerHTML = '';
    return;
  }

  toggle.classList.remove('hidden');
  toggle.textContent = list.classList.contains('hidden')
    ? `Show ${done.length} completed ✓`
    : `Hide ${done.length} completed ✓`;

  list.innerHTML = '';
  done.forEach(item => list.appendChild(buildItemLi(item, false)));
}

function toggleItem(id) {
  const item = state.items.find(i => i.id === id);
  if (!item) return;

  if (!item.done) {
    // Completing: animate the item away before it leaves the active timeline.
    const li = document.querySelector(`#dayTimeline .day-item[data-id="${id}"]`);
    item.done = true;
    if (li && !window.__reducedMotion) {
      li.classList.add('leaving');
      setTimeout(() => { saveState(); renderAll(); }, 440);
    } else {
      saveState();
      renderAll();
    }
  } else {
    item.done = false;
    saveState();
    renderAll();
  }
}

function deleteItem(id) {
  state.items = state.items.filter(i => i.id !== id);
  saveState();
  renderAll();
}

function addItem({ title, type, priority, start, durationMin }) {
  const iconMap = { task: '📝', meeting: '👥', break: '☕', focus: '◎' };
  state.items.push({
    id: uid(),
    title: title.trim(),
    type,
    priority: type === 'task' || type === 'focus' ? priority : 'none',
    start,
    durationMin: Math.max(5, Number(durationMin) || 30),
    done: false,
    icon: iconMap[type] || '📝',
  });
  saveState();
  renderAll();
}

// ---- Drag-and-drop scheduling: dragging one item onto another swaps their times ----
function wireTimelineDragAndDrop() {
  const timeline = document.getElementById('dayTimeline');
  if (!timeline) return;

  timeline.addEventListener('dragstart', (e) => {
    const li = e.target.closest('.day-item');
    if (!li || !li.dataset.id) return;
    uiState.dragId = li.dataset.id;
    li.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', li.dataset.id); } catch (err) { /* Safari */ }
  });

  timeline.addEventListener('dragend', (e) => {
    const li = e.target.closest('.day-item');
    if (li) li.classList.remove('dragging');
    timeline.querySelectorAll('.day-item.drag-over').forEach(el => el.classList.remove('drag-over'));
    uiState.dragId = null;
  });

  timeline.addEventListener('dragover', (e) => {
    const li = e.target.closest('.day-item');
    if (!li || !li.dataset.id || li.dataset.id === uiState.dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    li.classList.add('drag-over');
  });

  timeline.addEventListener('dragleave', (e) => {
    const li = e.target.closest('.day-item');
    if (li) li.classList.remove('drag-over');
  });

  timeline.addEventListener('drop', (e) => {
    const li = e.target.closest('.day-item');
    if (!li || !li.dataset.id) return;
    e.preventDefault();
    li.classList.remove('drag-over');
    const draggedId = uiState.dragId;
    const targetId = li.dataset.id;
    if (!draggedId || draggedId === targetId) return;

    const a = state.items.find(i => i.id === draggedId);
    const b = state.items.find(i => i.id === targetId);
    if (!a || !b) return;

    const tmp = a.start;
    a.start = b.start;
    b.start = tmp;

    assistantExecute(`Rescheduling "${a.title}" and "${b.title}"…`);
    saveState();
    renderAll();
  });
}

// ============================================================
// UPCOMING EVENTS
// ============================================================

function renderUpcoming() {
  const ul = document.getElementById('upcomingList');
  const moreLink = document.getElementById('moreEventsLink');
  if (!ul || !moreLink) return;

  const visible = state.upcoming.slice(0, 3);
  ul.innerHTML = visible.map(e => `
    <li>
      <span class="upcoming-time">${escapeHtml(e.time)}</span>
      <span class="upcoming-dot" style="background:var(--${e.color})"></span>
      <span class="upcoming-title">${escapeHtml(e.title)}</span>
    </li>
  `).join('');

  const remaining = state.upcoming.length - 3;
  if (remaining > 0) {
    moreLink.textContent = `+ ${remaining} more event${remaining === 1 ? '' : 's'}`;
    moreLink.classList.remove('hidden');
  } else {
    moreLink.classList.add('hidden');
  }
}

// ============================================================
// RENDER ALL
// ============================================================

function renderAll() {
  updateGreeting();
  renderBriefing();
  renderRecommendation();
  renderDayTimeline();
  renderUpcoming();
}

// ============================================================
// MODAL
// ============================================================

const modalOverlay = document.getElementById('taskModalOverlay');
const taskForm = document.getElementById('taskForm');

function openTaskModal() {
  if (!taskForm || !modalOverlay) return;
  taskForm.reset();
  document.getElementById('taskStartInput').value = '09:00';
  document.getElementById('taskDurationInput').value = '30';
  modalOverlay.classList.add('open');
  document.getElementById('taskTitleInput').focus();
}

function closeTaskModal() {
  if (modalOverlay) modalOverlay.classList.remove('open');
}

// ============================================================
// THEME + MOTION
// ============================================================

function applyTheme(theme) {
  if (theme === 'light') document.documentElement.setAttribute('data-theme', 'light');
  else document.documentElement.removeAttribute('data-theme');
  try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* ignore */ }
}

function initTheme() {
  let theme = 'dark';
  try { theme = localStorage.getItem(THEME_KEY) || 'dark'; } catch (e) { /* ignore */ }
  applyTheme(theme);
}

function applyMotion(mode) {
  window.__reducedMotion = mode === 'reduced';
  if (mode === 'reduced') document.documentElement.setAttribute('data-motion', 'reduced');
  else document.documentElement.removeAttribute('data-motion');
  const btn = document.getElementById('reducedMotionBtn');
  if (btn) btn.setAttribute('aria-pressed', mode === 'reduced' ? 'true' : 'false');
  try { localStorage.setItem(MOTION_KEY, mode); } catch (e) { /* ignore */ }
}

function initMotion() {
  let mode = 'full';
  try { mode = localStorage.getItem(MOTION_KEY) || 'full'; } catch (e) { /* ignore */ }
  if (mode === 'full' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    mode = 'reduced';
  }
  applyMotion(mode);
}

// ============================================================
// TOAST (used for stub-view nav clicks)
// ============================================================

let toastTimer = null;
function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

// ============================================================
// VIEW ROUTING (Today / Schedule / Projects / Insights / Settings)
// ============================================================

function setActiveMainView(view) {
  if (!VIEWS.includes(view)) view = 'today';
  uiState.currentView = view;

  VIEWS.forEach(v => {
    const el = document.getElementById('view-' + v);
    if (el) el.classList.toggle('hidden', v !== view);
  });

  document.querySelectorAll('.nav3-item').forEach(a => {
    a.classList.toggle('active', a.dataset.view === view);
  });
  document.querySelectorAll('.mtab').forEach(b => {
    if (b.dataset.view === 'assistant') return;
    b.classList.toggle('active', b.dataset.view === view);
  });

  if (view !== 'today') {
    showToast(`${capitalize(view)} is a preview in this build — Today is fully wired up.`);
  }
}

function wireViewRouting() {
  document.querySelectorAll('.nav3-item').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      setActiveMainView(a.dataset.view);
    });
  });

  document.querySelectorAll('.mtab').forEach(b => {
    b.addEventListener('click', () => {
      if (b.dataset.view === 'assistant') {
        openAssistant();
        document.querySelectorAll('.mtab').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
      } else {
        closeAssistant();
        setActiveMainView(b.dataset.view);
      }
    });
  });
}

// ============================================================
// ASSISTANT PANEL — state machine (Idle, Listening, Thinking, Speaking, Executing)
// ============================================================

const ASSISTANT_COPY = {
  idle: { status: 'Idle', sub: 'Tap the mic or type below' },
  listening: { status: 'Listening…', sub: 'Speak now' },
  thinking: { status: 'Thinking…', sub: 'Working it out' },
  speaking: { status: 'Speaking', sub: '' },
  executing: { status: 'Executing', sub: 'Updating your day' },
};

let assistantRevertTimer = null;

function setAssistantState(next, opts = {}) {
  uiState.assistantState = next;
  const orb = document.getElementById('assistantOrb');
  const status = document.getElementById('assistantStatus');
  const statusSub = document.getElementById('assistantStatusSub');
  const wave = document.getElementById('waveform');
  const micBtn = document.getElementById('micBtn');

  const copy = ASSISTANT_COPY[next] || ASSISTANT_COPY.idle;
  if (orb) orb.dataset.state = next;
  if (status) status.textContent = opts.status || copy.status;
  if (statusSub) statusSub.textContent = opts.sub !== undefined ? opts.sub : copy.sub;
  if (wave) wave.classList.toggle('active', next === 'listening');
  if (micBtn) micBtn.classList.toggle('active', next === 'listening');

  clearTimeout(assistantRevertTimer);
  if (opts.revertAfter) {
    assistantRevertTimer = setTimeout(() => {
      setAssistantState(uiState.listening ? 'listening' : 'idle');
    }, opts.revertAfter);
  }
}

function setListening(on) {
  uiState.listening = on;
  setAssistantState(on ? 'listening' : 'idle');
}

// Used whenever the assistant actually changes something on the schedule
// (moving a task, accepting a recommendation, quick-starting focus).
function assistantExecute(subMessage) {
  openAssistant();
  setAssistantState('executing', { sub: subMessage, revertAfter: 1100 });
}

function assistantRespond(replyText) {
  openAssistant();
  setAssistantState('thinking', { revertAfter: 550 });
  setTimeout(() => {
    setAssistantState('speaking', { sub: replyText, revertAfter: 2400 });
  }, 550);
}

function openAssistant() {
  const panel = document.getElementById('assistantPanel');
  if (panel) panel.classList.remove('hidden');
  uiState.assistantOpen = true;
}

function closeAssistant() {
  const panel = document.getElementById('assistantPanel');
  if (panel) panel.classList.add('hidden');
  uiState.assistantOpen = false;
}

function toggleAssistant() {
  if (uiState.assistantOpen) closeAssistant(); else openAssistant();
}

// ============================================================
// QUICK START FOCUS
// ============================================================

function quickStartFocus() {
  const target = state.items.filter(i => !i.done).sort((a, b) => toMinutes(a.start) - toMinutes(b.start))[0];
  if (!target) {
    assistantRespond("Your timeline's clear — nothing to focus on right now.");
    return;
  }
  assistantExecute(`Starting a focus session for "${target.title}"…`);
  setTimeout(() => {
    assistantRespond(`Focus session started for "${target.title}". I'll hold notifications for ${formatDuration(target.durationMin)}.`);
  }, 1150);

  const li = document.querySelector(`#dayTimeline .day-item[data-id="${target.id}"]`);
  if (li) li.scrollIntoView({ behavior: window.__reducedMotion ? 'auto' : 'smooth', block: 'center' });
}

// ============================================================
// MOBILE SWIPE NAVIGATION (assistant-first)
// ============================================================

function wireMobileSwipe() {
  let touchStartX = 0, touchStartY = 0, tracking = false;

  function onStart(e) {
    if (window.innerWidth > 700) return;
    const t = e.touches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
    tracking = true;
  }
  function onEnd(e) {
    if (!tracking) return;
    tracking = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;

    if (dx < 0 && !uiState.assistantOpen) {
      // swipe left → bring up the assistant
      openAssistant();
    } else if (dx > 0 && uiState.assistantOpen) {
      // swipe right → dismiss the assistant
      closeAssistant();
    }
  }

  document.addEventListener('touchstart', onStart, { passive: true });
  document.addEventListener('touchend', onEnd, { passive: true });
}

// ============================================================
// EVENT WIRING
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  safeRun('theme init', initTheme);
  safeRun('motion init', initMotion);
  safeRun('view routing', wireViewRouting);
  safeRun('core rendering', renderAll);
  safeRun('timeline drag-and-drop', wireTimelineDragAndDrop);
  safeRun('mobile swipe nav', wireMobileSwipe);

  safeRun('live briefing refresh', () => {
    setInterval(() => { updateGreeting(); renderBriefing(); renderRecommendation(); }, 30000);
  });

  safeRun('task modal wiring', () => {
    document.querySelectorAll('.open-task-modal').forEach(el => {
      el.addEventListener('click', (e) => { e.preventDefault(); openTaskModal(); });
    });
    const closeBtn = document.getElementById('taskModalClose');
    const cancelBtn = document.getElementById('taskModalCancel');
    if (closeBtn) closeBtn.addEventListener('click', closeTaskModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeTaskModal);
    if (modalOverlay) {
      modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeTaskModal(); });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modalOverlay && modalOverlay.classList.contains('open')) closeTaskModal();
    });
    if (taskForm) {
      taskForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const title = document.getElementById('taskTitleInput').value;
        if (!title.trim()) return;
        addItem({
          title,
          type: document.getElementById('taskTypeInput').value,
          priority: document.getElementById('taskPriorityInput').value,
          start: document.getElementById('taskStartInput').value || '09:00',
          durationMin: document.getElementById('taskDurationInput').value || 30,
        });
        closeTaskModal();
      });
    }
  });

  safeRun('day timeline interactions', () => {
    ['dayTimeline', 'completedList'].forEach(id => {
      const list = document.getElementById(id);
      if (!list) return;
      list.addEventListener('click', (e) => {
        const checkBtn = e.target.closest('.day-item-check');
        if (checkBtn) {
          const li = checkBtn.closest('.day-item');
          if (li) toggleItem(li.dataset.id);
          return;
        }
        const delBtn = e.target.closest('.day-item-delete');
        if (delBtn) {
          const li = delBtn.closest('.day-item');
          if (li) deleteItem(li.dataset.id);
        }
      });
    });
  });

  safeRun('completed list toggle', () => {
    const toggle = document.getElementById('completedToggle');
    const list = document.getElementById('completedList');
    if (!toggle || !list) return;
    toggle.addEventListener('click', () => {
      list.classList.toggle('hidden');
      renderCompletedList();
    });
  });

  safeRun('recommendation dismiss', () => {
    const closeBtn = document.getElementById('recClose');
    const card = document.getElementById('recommendationCard');
    if (closeBtn && card) {
      closeBtn.addEventListener('click', () => {
        const id = card.dataset.recId;
        if (id) uiState.dismissedRecIds.add(id);
        renderRecommendation();
      });
    }
  });

  safeRun('quick start focus', () => {
    const btn = document.getElementById('quickFocusBtn');
    if (btn) btn.addEventListener('click', quickStartFocus);
  });

  safeRun('auto-schedule toggle', () => {
    const toggle = document.getElementById('autoScheduleToggle');
    if (!toggle) return;
    toggle.checked = state.autoSchedule;
    toggle.addEventListener('change', () => {
      state.autoSchedule = toggle.checked;
      saveState();
      showToast(state.autoSchedule ? 'Auto-schedule is on — I\'ll fill gaps automatically.' : 'Auto-schedule is off.');
    });
  });

  safeRun('theme buttons', () => {
    const lightBtn = document.getElementById('lightModeBtn');
    const darkBtn = document.getElementById('darkModeBtn');
    const themeBtn = document.getElementById('themeBtn');
    if (lightBtn) lightBtn.addEventListener('click', () => applyTheme('light'));
    if (darkBtn) darkBtn.addEventListener('click', () => applyTheme('dark'));
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
        applyTheme(isLight ? 'dark' : 'light');
      });
    }
  });

  safeRun('reduced motion button', () => {
    const btn = document.getElementById('reducedMotionBtn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      applyMotion(window.__reducedMotion ? 'full' : 'reduced');
    });
  });

  safeRun('sidebar collapse', () => {
    const btn = document.getElementById('sidebarCollapseBtn');
    const app = document.getElementById('app');
    if (!btn || !app) return;
    btn.addEventListener('click', () => {
      app.classList.toggle('sidebar-collapsed');
      btn.textContent = app.classList.contains('sidebar-collapsed') ? '»' : '«';
    });
  });

  safeRun('assistant panel', () => {
    const orb = document.getElementById('assistantOrb');
    const micBtn = document.getElementById('micBtn');
    const closeBtn = document.getElementById('assistantCloseBtn');
    const navAssistant = document.getElementById('navAssistant');
    const input = document.getElementById('assistantInput');
    const sendBtn = document.getElementById('assistantSend');

    if (orb) orb.addEventListener('click', () => setListening(!uiState.listening));
    if (micBtn) micBtn.addEventListener('click', () => setListening(!uiState.listening));
    if (closeBtn) closeBtn.addEventListener('click', closeAssistant);
    if (navAssistant) navAssistant.addEventListener('click', () => { openAssistant(); });

    function handleSend() {
      if (!input || input.value.trim() === '') return;
      const text = input.value.trim();
      input.value = '';
      uiState.listening = false;
      assistantRespond(`Got it — I'm not connected to a live AI backend yet, but I heard "${text}".`);
    }

    if (sendBtn) sendBtn.addEventListener('click', handleSend);
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); handleSend(); }
      });
    }
  });

  safeRun('keyboard shortcut (Cmd/Ctrl+K focuses search)', () => {
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const search = document.getElementById('searchInput');
        if (search) search.focus();
      }
    });
  });
});
