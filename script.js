// ============================================================
// Trackler - Redesigned Dashboard
// ============================================================

const STORAGE_KEY = 'trackler_data_v3';
const THEME_KEY = 'trackler_theme';
const USER_NAME = 'Alen';

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
// Session-only UI state (not persisted)
const uiState = { insightIndex: 0, insightDismissed: false, listening: false };

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
  const tasks = state.items.filter(i => i.type === 'task');
  const tasksLeft = tasks.filter(i => !i.done).length;
  const meetings = state.items.filter(i => i.type === 'meeting').length;
  const highPriority = state.items.filter(i => i.priority === 'high').length;
  const focusMinutes = tasks.reduce((sum, i) => sum + i.durationMin, 0);
  return { tasksLeft, meetings, highPriority, focusMinutes, totalTasks: tasks.length };
}

// ============================================================
// GREETING
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

  const sub = document.getElementById('greetingSub');
  if (sub) {
    const { tasksLeft, meetings } = computeStats();
    if (tasksLeft === 0 && meetings === 0) {
      sub.textContent = "You're all caught up for today! 🎉";
    } else {
      const parts = [];
      if (tasksLeft > 0) parts.push(`${tasksLeft} task${tasksLeft === 1 ? '' : 's'}`);
      if (meetings > 0) parts.push(`${meetings} meeting${meetings === 1 ? '' : 's'}`);
      sub.textContent = `You have ${parts.join(' and ')} planned today.`;
    }
  }
}

// ============================================================
// STATS BAR
// ============================================================

function renderStatsBar() {
  const { tasksLeft, meetings, highPriority, focusMinutes } = computeStats();

  const focusEl = document.getElementById('focusTimeVal');
  const prioEl = document.getElementById('statPriorities');
  const meetEl = document.getElementById('statMeetings');
  const tasksEl = document.getElementById('statTasksLeft');
  if (focusEl) focusEl.textContent = formatDuration(focusMinutes);
  if (prioEl) prioEl.textContent = highPriority;
  if (meetEl) meetEl.textContent = meetings;
  if (tasksEl) tasksEl.textContent = tasksLeft;

  // On-track heuristic: any not-done task whose scheduled window has already passed?
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const overdue = state.items.filter(i =>
    i.type === 'task' && !i.done && (toMinutes(i.start) + i.durationMin) < nowMin
  ).length;

  const onTrackEl = document.getElementById('statOnTrack');
  const onTrackSub = document.getElementById('statOnTrackSub');
  if (onTrackEl && onTrackSub) {
    if (overdue === 0) {
      onTrackEl.textContent = 'Yes';
      onTrackSub.textContent = "You're ahead! ✅";
    } else {
      onTrackEl.textContent = 'No';
      onTrackSub.textContent = `${overdue} task${overdue === 1 ? '' : 's'} behind`;
    }
  }

  // Focus delta vs yesterday, backed by a real running history log
  const today = dateStr();
  const yesterday = dateStr(new Date(Date.now() - 86400000));
  state.dailyFocusHistory[today] = focusMinutes;
  const yMin = state.dailyFocusHistory[yesterday];

  const deltaEl = document.getElementById('focusDelta');
  if (deltaEl) {
    if (yMin === undefined) {
      deltaEl.textContent = 'First day tracked — check back tomorrow';
      deltaEl.className = 'focus-delta neutral';
    } else {
      const diff = focusMinutes - yMin;
      if (diff > 0) { deltaEl.textContent = `↑ ${formatDuration(diff)} vs yesterday`; deltaEl.className = 'focus-delta'; }
      else if (diff < 0) { deltaEl.textContent = `↓ ${formatDuration(Math.abs(diff))} vs yesterday`; deltaEl.className = 'focus-delta behind'; }
      else { deltaEl.textContent = 'Same as yesterday'; deltaEl.className = 'focus-delta neutral'; }
    }
  }

  saveState();
}

// ============================================================
// DAY TIMELINE
// ============================================================

function iconBgClass(item) {
  if (item.type === 'meeting') return 'blue';
  if (item.type === 'break') return 'gray';
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

function renderDayTimeline() {
  const ul = document.getElementById('dayTimeline');
  if (!ul) return;
  ul.innerHTML = '';

  if (state.items.length === 0) {
    ul.innerHTML = '<li class="empty-state">Nothing planned yet — add your first item below.</li>';
    return;
  }

  const sorted = [...state.items].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  const currentItem = sorted.find(i => !i.done);

  sorted.forEach(item => {
    const isCurrent = !!currentItem && item.id === currentItem.id;
    const li = document.createElement('li');
    li.className = 'day-item' + (isCurrent ? ' current' : '') + (item.done ? ' done' : '');
    li.dataset.id = item.id;

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
      <button class="day-item-check" aria-label="Mark ${escapeHtml(item.title)} complete">✓</button>
      <div class="day-item-icon day-item-icon--${iconBg}">${item.icon || '📝'}</div>
      <div class="day-item-body">
        <span class="day-item-title">${escapeHtml(item.title)}</span>
        ${tagHtml}
      </div>
      <button class="day-item-delete" aria-label="Delete ${escapeHtml(item.title)}">✕</button>
      <div class="day-item-duration">${formatDuration(item.durationMin)}</div>
    `;
    ul.appendChild(li);
  });
}

function toggleItem(id) {
  const item = state.items.find(i => i.id === id);
  if (!item) return;
  item.done = !item.done;
  saveState();
  renderAll();
}

function deleteItem(id) {
  state.items = state.items.filter(i => i.id !== id);
  saveState();
  renderAll();
}

function addItem({ title, type, priority, start, durationMin }) {
  const iconMap = { task: '📝', meeting: '👥', break: '☕' };
  state.items.push({
    id: uid(),
    title: title.trim(),
    type,
    priority: type === 'task' ? priority : 'none',
    start,
    durationMin: Math.max(5, Number(durationMin) || 30),
    done: false,
    icon: iconMap[type] || '📝',
  });
  saveState();
  renderAll();
}

// ============================================================
// INSIGHT BANNER (cycles through real, data-derived tips)
// ============================================================

function getInsightTips() {
  const { tasksLeft, highPriority, focusMinutes } = computeStats();
  return [
    { title: 'You usually do your best work before 12 PM.', body: 'Morning slots tend to have the fewest interruptions — good time for deep work.' },
    { title: `${highPriority} high-priority item${highPriority === 1 ? '' : 's'} today.`, body: highPriority > 0 ? 'Tackle those first for the biggest impact.' : 'Nothing urgent — a good day to get ahead on other work.' },
    { title: `${formatDuration(focusMinutes)} of deep work planned.`, body: `${tasksLeft} task${tasksLeft === 1 ? '' : 's'} still to complete today.` },
  ];
}

function renderInsight() {
  const banner = document.getElementById('insightBanner');
  if (!banner) return;
  if (uiState.insightDismissed) { banner.classList.add('hidden'); return; }
  banner.classList.remove('hidden');
  const tips = getInsightTips();
  const tip = tips[uiState.insightIndex % tips.length];
  const titleEl = document.getElementById('insightTitle');
  const bodyEl = document.getElementById('insightBody');
  if (titleEl) titleEl.textContent = tip.title;
  if (bodyEl) bodyEl.textContent = tip.body;
}

// ============================================================
// SUGGESTION CARD
// ============================================================

function renderSuggestion() {
  const card = document.getElementById('suggestionCard');
  if (!card) return;
  const target = state.items.find(i => i.title === 'Database Schema Design');
  if (state.suggestionDismissed || !target || target.start === '14:00') {
    card.classList.add('hidden');
    return;
  }
  card.classList.remove('hidden');
  const targetEl = document.getElementById('suggestionTarget');
  const timeEl = document.getElementById('suggestionTime');
  if (targetEl) targetEl.textContent = target.title;
  if (timeEl) timeEl.textContent = '2:00 PM';
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
  renderStatsBar();
  renderDayTimeline();
  renderInsight();
  renderSuggestion();
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
// THEME
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

// ============================================================
// ASSISTANT PANEL
// ============================================================

function setListening(on) {
  uiState.listening = on;
  const orb = document.getElementById('assistantOrb');
  const status = document.getElementById('assistantStatus');
  const statusSub = document.getElementById('assistantStatusSub');
  const wave = document.getElementById('waveform');
  const micBtn = document.getElementById('micBtn');
  if (orb) orb.classList.toggle('listening', on);
  if (wave) wave.classList.toggle('active', on);
  if (micBtn) micBtn.classList.toggle('active', on);
  if (status) status.textContent = on ? 'Listening...' : 'Ready';
  if (statusSub) statusSub.textContent = on ? 'Speak now' : 'Tap the mic or type below';
}

// ============================================================
// EVENT WIRING
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  safeRun('theme init', initTheme);
  safeRun('core rendering', renderAll);

  safeRun('live greeting refresh', () => {
    setInterval(() => { updateGreeting(); renderStatsBar(); }, 30000);
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
    const timeline = document.getElementById('dayTimeline');
    if (!timeline) return;
    timeline.addEventListener('click', (e) => {
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

  safeRun('insight banner', () => {
    const viewBtn = document.getElementById('viewInsightsBtn');
    const closeBtn = document.getElementById('insightClose');
    if (viewBtn) viewBtn.addEventListener('click', () => { uiState.insightIndex++; renderInsight(); });
    if (closeBtn) closeBtn.addEventListener('click', () => { uiState.insightDismissed = true; renderInsight(); });
  });

  safeRun('suggestion card', () => {
    const moveBtn = document.getElementById('suggestionMove');
    const laterBtn = document.getElementById('suggestionLater');
    if (moveBtn) {
      moveBtn.addEventListener('click', () => {
        const target = state.items.find(i => i.title === 'Database Schema Design');
        if (target) { target.start = '14:00'; saveState(); renderAll(); }
      });
    }
    if (laterBtn) {
      laterBtn.addEventListener('click', () => {
        state.suggestionDismissed = true;
        saveState();
        renderSuggestion();
      });
    }
  });

  safeRun('auto-schedule toggle', () => {
    const toggle = document.getElementById('autoScheduleToggle');
    if (!toggle) return;
    toggle.checked = state.autoSchedule;
    toggle.addEventListener('change', () => {
      state.autoSchedule = toggle.checked;
      saveState();
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

  safeRun('assistant panel', () => {
    const orb = document.getElementById('assistantOrb');
    const micBtn = document.getElementById('micBtn');
    const closeBtn = document.getElementById('assistantCloseBtn');
    const navAssistant = document.getElementById('navAssistant');
    const panel = document.getElementById('assistantPanel');
    const input = document.getElementById('assistantInput');
    const sendBtn = document.getElementById('assistantSend');
    const status = document.getElementById('assistantStatus');
    const statusSub = document.getElementById('assistantStatusSub');

    if (orb) orb.addEventListener('click', () => setListening(!uiState.listening));
    if (micBtn) micBtn.addEventListener('click', () => setListening(!uiState.listening));

    if (closeBtn && panel) closeBtn.addEventListener('click', () => panel.classList.add('hidden'));
    if (navAssistant && panel) {
      navAssistant.addEventListener('click', (e) => {
        e.preventDefault();
        panel.classList.remove('hidden');
      });
    }

    function acknowledge() {
      if (!status || !statusSub) return;
      const prevStatus = status.textContent;
      const prevSub = statusSub.textContent;
      status.textContent = 'Got it';
      statusSub.textContent = "I'm not connected to a live AI backend yet, but I heard you.";
      setTimeout(() => {
        if (!uiState.listening) { status.textContent = 'Ready'; statusSub.textContent = 'Tap the mic or type below'; }
        else { status.textContent = prevStatus; statusSub.textContent = prevSub; }
      }, 2200);
    }

    if (sendBtn && input) {
      sendBtn.addEventListener('click', () => {
        if (input.value.trim() === '') return;
        input.value = '';
        acknowledge();
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (input.value.trim() === '') return;
          input.value = '';
          acknowledge();
        }
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
