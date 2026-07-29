// ============================================================
// Trackler Dashboard - Central Data Store & Rendering
// ============================================================

const OLD_STORAGE_KEY = 'trackler_tasks_v1'; // v1: tasks-only (kept for migration)
const STORAGE_KEY = 'trackler_data_v2';       // v2: { tasks, completionLog }
const USER_NAME = 'Alen';

// ---- Seed data (matches original design) ----
const DEFAULT_TASKS = [
  { id: 't1', title: 'Finish Trackler UI', sub: 'Complete dashboard layout', priority: 'high', category: 'Work', start: '09:00', end: '11:00', done: true },
  { id: 't2', title: 'Code Task Manager', sub: 'Implement CRUD operations', priority: 'high', category: 'Work', start: '11:30', end: '13:00', done: true },
  { id: 't3', title: 'Design Database Schema', sub: 'Plan data structure', priority: 'medium', category: 'Work', start: '14:00', end: '15:30', done: false },
  { id: 't4', title: 'Write Documentation', sub: 'API and user guide', priority: 'low', category: 'Work', start: '16:00', end: '17:30', done: false },
];

const TL_DOT_COLORS = ['blue', 'green', 'purple', 'orange', 'pink'];

// 'YYYY-MM-DD' for a given date (local time, so it matches what the user sees)
function dateStr(d) {
  d = d || new Date();
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// For freshly-seeded tasks that start "done", log them as completed today so
// analytics has real (if minimal) data to show on first load.
function seedCompletionLog(tasks) {
  const ds = dateStr();
  return tasks.filter(t => t.done).map(t => ({ taskId: t.id, date: ds }));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks : DEFAULT_TASKS.slice(),
        completionLog: Array.isArray(parsed.completionLog) ? parsed.completionLog : [],
      };
    }
  } catch (e) { /* ignore corrupt storage */ }

  // Migrate from the old tasks-only storage format if present
  try {
    const oldRaw = localStorage.getItem(OLD_STORAGE_KEY);
    if (oldRaw) {
      const tasks = JSON.parse(oldRaw).map(t => ({ category: 'Work', ...t }));
      return { tasks, completionLog: seedCompletionLog(tasks) };
    }
  } catch (e) { /* ignore corrupt storage */ }

  return { tasks: DEFAULT_TASKS.slice(), completionLog: seedCompletionLog(DEFAULT_TASKS) };
}

const state = loadState();

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tasks: state.tasks, completionLog: state.completionLog }));
  } catch (e) { /* storage unavailable, continue in-memory only */ }
}

// Records or un-records a completion event for today, used to drive real
// (non-hardcoded) analytics like the weekly bar chart and productivity score.
function logCompletion(taskId, done) {
  const ds = dateStr();
  if (done) {
    if (!state.completionLog.some(e => e.taskId === taskId && e.date === ds)) {
      state.completionLog.push({ taskId, date: ds });
    }
  } else {
    state.completionLog = state.completionLog.filter(e => !(e.taskId === taskId && e.date === ds));
  }
}

function uid() {
  return 't' + Math.random().toString(36).slice(2, 9);
}

// Runs a block of init code in isolation - if this section throws (e.g. because
// an expected element is missing from the HTML), it's logged to the console and
// every OTHER section still runs normally instead of the whole page breaking.
function safeRun(label, fn) {
  try {
    fn();
  } catch (err) {
    console.error(`[Trackler] "${label}" failed to initialize:`, err);
  }
}

function toMinutes(hhmm) {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function to12h(hhmm) {
  if (!hhmm) return '';
  let [h, m] = hhmm.split(':').map(Number);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ---- Derived stats ----
function getStats() {
  const total = state.tasks.length;
  const completed = state.tasks.filter(t => t.done).length;
  const pending = total - completed;
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { total, completed, pending, pct };
}

// ============================================================
// RENDER FUNCTIONS
// ============================================================

function renderTaskList() {
  const ul = document.getElementById('taskList');
  if (!ul) return;
  ul.innerHTML = '';

  if (state.tasks.length === 0) {
    ul.innerHTML = '<li class="empty-state">No tasks yet — add your first one below.</li>';
    return;
  }

  const sorted = [...state.tasks].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));

  sorted.forEach(task => {
    const li = document.createElement('li');
    li.className = 'task-item' + (task.done ? ' done' : '');
    li.dataset.id = task.id;
    li.innerHTML = `
      <input type="checkbox" ${task.done ? 'checked' : ''} aria-label="Mark ${escapeHtml(task.title)} complete">
      <div class="task-info">
        <div class="task-title">${escapeHtml(task.title)}</div>
        <div class="task-sub">${escapeHtml(task.sub || '')}</div>
      </div>
      <span class="pill pill-${task.priority}">${task.priority}</span>
      <button class="task-delete" aria-label="Delete task">✕</button>
      <span class="task-time">${to12h(task.start)} - ${to12h(task.end)}</span>
    `;
    ul.appendChild(li);
  });
}

function renderTimeline() {
  const ul = document.getElementById('timelineList');
  if (!ul) return;
  ul.innerHTML = '';

  if (state.tasks.length === 0) {
    ul.innerHTML = '<li class="empty-state">Nothing scheduled today.</li>';
    return;
  }

  const sorted = [...state.tasks].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));

  sorted.forEach((task, i) => {
    const li = document.createElement('li');
    const color = TL_DOT_COLORS[i % TL_DOT_COLORS.length];
    li.innerHTML = `
      <div class="tl-time">${to12h(task.start)}</div>
      <div class="tl-dot tl-dot--${color}"></div>
      <div class="tl-body">
        <div class="tl-title">${escapeHtml(task.title)}</div>
        <div class="tl-sub">${to12h(task.start)} - ${to12h(task.end)}</div>
      </div>
    `;
    ul.appendChild(li);
  });
}

function setRing(circleEl, pct, circumference) {
  if (!circleEl) return;
  const offset = circumference - (circumference * pct) / 100;
  circleEl.style.strokeDasharray = circumference;
  circleEl.style.strokeDashoffset = offset;
}

function renderStats() {
  const { total, completed, pending, pct } = getStats();

  const totalEl = document.getElementById('statTotal');
  const completedEl = document.getElementById('statCompleted');
  const pendingEl = document.getElementById('statPending');
  const completionEl = document.getElementById('statCompletion');
  if (totalEl) totalEl.textContent = total;
  if (completedEl) completedEl.textContent = completed;
  if (pendingEl) pendingEl.textContent = pending;
  if (completionEl) completionEl.textContent = pct + '%';

  // Hero ring (circumference = 2*pi*60)
  const heroRingFg = document.getElementById('heroRingFg');
  const heroRingPct = document.getElementById('heroRingPct');
  setRing(heroRingFg, pct, 376.99);
  if (heroRingPct) heroRingPct.textContent = pct + '%';

  // Sidebar ring (circumference = 2*pi*52)
  const sidebarRingFg = document.getElementById('sidebarRingFg');
  const sidebarRingPct = document.getElementById('sidebarRingPct');
  setRing(sidebarRingFg, pct, 326.7);
  if (sidebarRingPct) sidebarRingPct.textContent = pct + '%';

  const footerBarFill = document.getElementById('footerBarFill');
  const footerSub = document.getElementById('footerSub');
  if (footerBarFill) footerBarFill.style.width = pct + '%';
  if (footerSub) footerSub.textContent = `${completed} of ${total} tasks completed`;

  const footerMsg = document.getElementById('footerMsg');
  if (footerMsg) {
    footerMsg.textContent = pct >= 100 ? 'All done! Amazing work 🎉'
      : pct >= 50 ? 'Great job! Keep going 🎉'
      : pending === 0 ? 'Nothing pending right now 🎉'
      : 'You can do this 💪';
  }

  // Daily goal: "Complete N tasks" - goal target = total tasks (or 5, whichever bigger)
  const goalTarget = Math.max(total, 5);
  const goalLabel = document.getElementById('goalTasksLabel');
  const goalVal = document.getElementById('goalTasksVal');
  const goalFill = document.getElementById('goalTasksFill');
  if (goalLabel) goalLabel.textContent = `Complete ${goalTarget} tasks`;
  if (goalVal) goalVal.textContent = `${completed}/${goalTarget}`;
  if (goalFill) goalFill.style.width = Math.min(100, Math.round((completed / goalTarget) * 100)) + '%';
}

function renderAll() {
  renderTaskList();
  renderTimeline();
  renderStats();
  renderAnalytics();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ============================================================
// TASK ACTIONS
// ============================================================

function toggleTask(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;
  task.done = !task.done;
  logCompletion(id, task.done);
  saveState();
  renderAll();
}

function deleteTask(id) {
  state.tasks = state.tasks.filter(t => t.id !== id);
  state.completionLog = state.completionLog.filter(e => e.taskId !== id);
  saveState();
  renderAll();
}

function addTask({ title, sub, priority, category, start, end }) {
  state.tasks.push({
    id: uid(),
    title: title.trim(),
    sub: (sub || '').trim(),
    priority,
    category: category || 'Work',
    start,
    end,
    done: false,
  });
  saveState();
  renderAll();
}

// ============================================================
// MODAL
// ============================================================

const modalOverlay = document.getElementById('taskModalOverlay');
const taskForm = document.getElementById('taskForm');

function openTaskModal() {
  taskForm.reset();
  document.getElementById('taskStartInput').value = '09:00';
  document.getElementById('taskEndInput').value = '10:00';
  modalOverlay.classList.add('open');
  document.getElementById('taskTitleInput').focus();
}

function closeTaskModal() {
  modalOverlay.classList.remove('open');
}

// ============================================================
// EVENT WIRING
// ============================================================

// ============================================================
// LIVE GREETING (name, time-of-day message, live clock)
// ============================================================

function updateGreeting() {
  const now = new Date();
  const hour = now.getHours();

  let greetingWord, emoji;
  if (hour >= 5 && hour < 12) { greetingWord = 'Good Morning'; emoji = '👋'; }
  else if (hour >= 12 && hour < 17) { greetingWord = 'Good Afternoon'; emoji = '☀️'; }
  else if (hour >= 17 && hour < 21) { greetingWord = 'Good Evening'; emoji = '🌆'; }
  else { greetingWord = 'Good Night'; emoji = '🌙'; }

  const heading = document.getElementById('greetingHeading');
  if (heading) {
    heading.innerHTML = `${greetingWord}, ${USER_NAME}! <span class="wave" id="greetingWave">${emoji}</span>`;
  }

  const dateEl = document.getElementById('greetingDate');
  const timeEl = document.getElementById('greetingTime');
  if (dateEl) {
    dateEl.textContent = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }
  if (timeEl) {
    timeEl.textContent = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
}

// ============================================================
// CALENDAR (month navigation)
// ============================================================

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const calendarState = (() => {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth(), selected: null };
})();

// Convert JS getDay() (0=Sun..6=Sat) to Monday-first index (0=Mon..6=Sun)
function mondayIndex(jsDay) {
  return (jsDay + 6) % 7;
}

function renderCalendar() {
  const label = document.getElementById('calLabel');
  const daysWrap = document.getElementById('calDays');
  if (!label || !daysWrap) return;

  const { year, month } = calendarState;
  label.textContent = `${MONTH_NAMES[month]} ${year}`;

  const firstOfMonth = new Date(year, month, 1);
  const startOffset = mondayIndex(firstOfMonth.getDay());
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

  const realToday = new Date();
  const isRealTodayMonth = realToday.getFullYear() === year && realToday.getMonth() === month;

  let html = '';
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - startOffset + 1;
    let cellDate, muted = false;

    if (dayNum < 1) {
      cellDate = daysInPrevMonth + dayNum;
      muted = true;
    } else if (dayNum > daysInMonth) {
      cellDate = dayNum - daysInMonth;
      muted = true;
    } else {
      cellDate = dayNum;
    }

    const isToday = !muted && isRealTodayMonth && cellDate === realToday.getDate();
    const isSelected = !muted && calendarState.selected === cellDate;

    const classes = ['cal-day'];
    if (muted) classes.push('muted');
    if (isToday) classes.push('today');
    if (isSelected) classes.push('selected');

    html += `<div class="${classes.join(' ')}" data-day="${cellDate}" data-muted="${muted}">${cellDate}</div>`;
  }
  daysWrap.innerHTML = html;
}

function shiftCalendarMonth(delta) {
  calendarState.month += delta;
  if (calendarState.month > 11) { calendarState.month = 0; calendarState.year++; }
  if (calendarState.month < 0) { calendarState.month = 11; calendarState.year--; }
  calendarState.selected = null;
  renderCalendar();
}

// ============================================================
// WEEKLY PLANNER (week navigation)
// ============================================================

const DOW_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

function startOfWeek(date) {
  const d = new Date(date);
  const offset = mondayIndex(d.getDay());
  d.setDate(d.getDate() - offset);
  d.setHours(0, 0, 0, 0);
  return d;
}

const weeklyState = { weekStart: startOfWeek(new Date()) };

function renderWeeklyPlanner() {
  const label = document.getElementById('weekLabel');
  if (!label) return;

  const start = weeklyState.weekStart;
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  const sameMonth = start.getMonth() === end.getMonth();
  const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endStr = end.toLocaleDateString('en-US', { month: sameMonth ? undefined : 'short', day: 'numeric' });
  label.textContent = `${startStr} - ${endStr}`;

  const realToday = new Date();
  realToday.setHours(0, 0, 0, 0);

  for (let i = 0; i < 7; i++) {
    const head = document.getElementById('wkHead' + i);
    if (!head) continue;
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    head.innerHTML = `${DOW_LABELS[i]}<br><span>${d.getDate()}</span>`;
    head.classList.toggle('wk-head--today', d.getTime() === realToday.getTime());
  }
}

function shiftWeek(delta) {
  const d = new Date(weeklyState.weekStart);
  d.setDate(d.getDate() + delta * 7);
  weeklyState.weekStart = d;
  renderWeeklyPlanner();
}

// ============================================================
// ANALYTICS (real data: task categories + completion history)
// ============================================================

const CATEGORY_META = {
  Work:     { segId: 'segWork',     legId: 'legWork' },
  Personal: { segId: 'segPersonal', legId: 'legPersonal' },
  Health:   { segId: 'segHealth',   legId: 'legHealth' },
  Study:    { segId: 'segStudy',    legId: 'legStudy' },
  Other:    { segId: 'segOther',    legId: 'legOther' },
};
const CATEGORY_ORDER = ['Work', 'Personal', 'Health', 'Study', 'Other'];

// Bar chart: real count of tasks completed each day of the current week (Mon-Sun)
function renderAnalyticsBars() {
  const weekStart = startOfWeek(new Date());
  const counts = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const ds = dateStr(d);
    counts.push(state.completionLog.filter(e => e.date === ds).length);
  }
  const max = Math.max(...counts, 1);
  counts.forEach((c, i) => {
    const bar = document.getElementById('bar' + i);
    if (!bar) return;
    const heightPct = c === 0 ? 2 : Math.max(8, Math.round((c / max) * 100));
    bar.style.height = heightPct + '%';
    bar.title = `${c} task${c === 1 ? '' : 's'} completed`;
  });
}

// Donut: real breakdown of all current tasks by category
function renderCategoryDonut() {
  const total = state.tasks.length;
  const counts = { Work: 0, Personal: 0, Health: 0, Study: 0, Other: 0 };
  state.tasks.forEach(t => {
    const cat = counts.hasOwnProperty(t.category) ? t.category : 'Other';
    counts[cat]++;
  });

  let cumulative = 0;
  CATEGORY_ORDER.forEach(cat => {
    const count = counts[cat];
    const pct = total === 0 ? 0 : Math.round((count / total) * 100);
    const meta = CATEGORY_META[cat];
    const seg = document.getElementById(meta.segId);
    const leg = document.getElementById(meta.legId);
    if (leg) leg.textContent = pct + '%';
    if (seg) {
      seg.setAttribute('stroke-dasharray', `${pct} ${100 - pct}`);
      seg.setAttribute('stroke-dashoffset', 25 - cumulative);
    }
    cumulative += pct;
  });
}

// Productivity score: today's real completion %, with a week-over-week comparison
// derived from the completion log (not a hardcoded number)
function renderProductivityScore() {
  const { pct } = getStats();

  const ringFg = document.getElementById('scoreRingFg');
  const scoreVal = document.getElementById('scoreVal');
  const scoreCaption = document.getElementById('scoreCaption');
  const scoreSub = document.getElementById('scoreSub');

  setRing(ringFg, pct, 326.7);
  if (scoreVal) scoreVal.textContent = pct + '%';

  let caption;
  if (pct >= 80) caption = 'Excellent!';
  else if (pct >= 50) caption = 'Good pace';
  else if (pct > 0) caption = 'Keep going';
  else caption = 'Just starting';
  if (scoreCaption) scoreCaption.textContent = caption;

  const weekStart = startOfWeek(new Date());
  const lastWeekStart = new Date(weekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekEnd = new Date(weekStart);
  lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
  lastWeekEnd.setHours(23, 59, 59, 999);

  const thisWeekCount = state.completionLog.filter(e => new Date(e.date + 'T00:00:00') >= weekStart).length;
  const lastWeekCount = state.completionLog.filter(e => {
    const d = new Date(e.date + 'T00:00:00');
    return d >= lastWeekStart && d <= lastWeekEnd;
  }).length;

  let subText;
  if (lastWeekCount === 0 && thisWeekCount === 0) {
    subText = 'No completions logged yet';
  } else if (lastWeekCount === 0) {
    subText = `${thisWeekCount} completed this week`;
  } else {
    const delta = Math.round(((thisWeekCount - lastWeekCount) / lastWeekCount) * 100);
    if (delta > 0) subText = `↑ ${delta}% from last week`;
    else if (delta < 0) subText = `↓ ${Math.abs(delta)}% from last week`;
    else subText = 'Same as last week';
  }
  if (scoreSub) scoreSub.textContent = subText;
}

function renderAnalytics() {
  renderAnalyticsBars();
  renderCategoryDonut();
  renderProductivityScore();
}

// ============================================================
// EVENT WIRING
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  safeRun('core task rendering', () => {
    renderAll();
  });

  safeRun('live greeting', () => {
    updateGreeting();
    setInterval(updateGreeting, 30000);
  });

  safeRun('calendar', () => {
    renderCalendar();
    const calPrev = document.getElementById('calPrev');
    const calNext = document.getElementById('calNext');
    const calDays = document.getElementById('calDays');
    if (calPrev) calPrev.addEventListener('click', () => shiftCalendarMonth(-1));
    if (calNext) calNext.addEventListener('click', () => shiftCalendarMonth(1));
    if (calDays) {
      calDays.addEventListener('click', (e) => {
        const cell = e.target.closest('.cal-day');
        if (!cell || cell.dataset.muted === 'true') return;
        const day = Number(cell.dataset.day);
        calendarState.selected = calendarState.selected === day ? null : day;
        renderCalendar();
      });
    }
  });

  safeRun('weekly planner', () => {
    renderWeeklyPlanner();
    const weekPrev = document.getElementById('weekPrev');
    const weekNext = document.getElementById('weekNext');
    if (weekPrev) weekPrev.addEventListener('click', () => shiftWeek(-1));
    if (weekNext) weekNext.addEventListener('click', () => shiftWeek(1));
  });

  safeRun('task modal wiring', () => {
    document.querySelectorAll('.open-task-modal').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        openTaskModal();
      });
    });

    const closeBtn = document.getElementById('taskModalClose');
    const cancelBtn = document.getElementById('taskModalCancel');
    if (closeBtn) closeBtn.addEventListener('click', closeTaskModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeTaskModal);
    if (modalOverlay) {
      modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeTaskModal();
      });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modalOverlay && modalOverlay.classList.contains('open')) closeTaskModal();
    });

    if (taskForm) {
      taskForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const title = document.getElementById('taskTitleInput').value;
        if (!title.trim()) return;
        const categoryEl = document.getElementById('taskCategoryInput');
        addTask({
          title,
          sub: document.getElementById('taskSubInput').value,
          priority: document.getElementById('taskPriorityInput').value,
          category: categoryEl ? categoryEl.value : 'Work',
          start: document.getElementById('taskStartInput').value || '09:00',
          end: document.getElementById('taskEndInput').value || '10:00',
        });
        closeTaskModal();
      });
    }
  });

  safeRun('task list interactions', () => {
    const taskListEl = document.getElementById('taskList');
    if (!taskListEl) return;
    taskListEl.addEventListener('change', (e) => {
      if (e.target.matches('input[type=checkbox]')) {
        const li = e.target.closest('.task-item');
        if (li) toggleTask(li.dataset.id);
      }
    });
    taskListEl.addEventListener('click', (e) => {
      const delBtn = e.target.closest('.task-delete');
      if (delBtn) {
        const li = delBtn.closest('.task-item');
        if (li) deleteTask(li.dataset.id);
      }
    });
  });

  safeRun('focus mode timer', () => {
    const playBtn = document.querySelector('.focus-btn.play');
    const focusTime = document.querySelector('.focus-time');
    const focusCaption = document.querySelector('.focus-caption');
    let timer = null;
    let seconds = 25 * 60;
    let running = false;

    function formatTime(s) {
      const m = Math.floor(s / 60).toString().padStart(2, '0');
      const sec = (s % 60).toString().padStart(2, '0');
      return `${m}:${sec}`;
    }

    if (playBtn) {
      playBtn.addEventListener('click', () => {
        running = !running;
        playBtn.textContent = running ? '⏸' : '▶';
        if (focusCaption) focusCaption.textContent = running ? 'Focusing...' : 'Paused';

        if (running) {
          timer = setInterval(() => {
            if (seconds > 0) {
              seconds--;
              if (focusTime) focusTime.textContent = formatTime(seconds);
            } else {
              clearInterval(timer);
              running = false;
              playBtn.textContent = '▶';
              if (focusCaption) focusCaption.textContent = 'Session complete!';
            }
          }, 1000);
        } else {
          clearInterval(timer);
        }
      });
    }

    const resetBtn = document.querySelector('.focus-btn.small');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        clearInterval(timer);
        running = false;
        seconds = 25 * 60;
        if (focusTime) focusTime.textContent = formatTime(seconds);
        if (focusCaption) focusCaption.textContent = 'Ready to focus!';
        if (playBtn) playBtn.textContent = '▶';
      });
    }
  });

  safeRun('quick action button feedback', () => {
    document.querySelectorAll('.qa-btn:not(.open-task-modal), .chip, .shortcut-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.style.opacity = '0.6';
        setTimeout(() => (btn.style.opacity = '1'), 150);
      });
    });
  });

  safeRun('AI assistant input', () => {
    const aiInput = document.querySelector('.ai-input-wrap input');
    const aiSend = document.querySelector('.ai-send');
    if (aiSend && aiInput) {
      aiSend.addEventListener('click', () => {
        if (aiInput.value.trim() !== '') {
          aiInput.value = '';
        }
      });
    }
  });
});
