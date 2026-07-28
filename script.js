// ============================================================
// Trackler Dashboard - Central Data Store & Rendering
// ============================================================

const STORAGE_KEY = 'trackler_tasks_v1';

// ---- Seed data (matches original design) ----
const DEFAULT_TASKS = [
  { id: 't1', title: 'Finish Trackler UI', sub: 'Complete dashboard layout', priority: 'high', start: '09:00', end: '11:00', done: true },
  { id: 't2', title: 'Code Task Manager', sub: 'Implement CRUD operations', priority: 'high', start: '11:30', end: '13:00', done: true },
  { id: 't3', title: 'Design Database Schema', sub: 'Plan data structure', priority: 'medium', start: '14:00', end: '15:30', done: false },
  { id: 't4', title: 'Write Documentation', sub: 'API and user guide', priority: 'low', start: '16:00', end: '17:30', done: false },
];

const TL_DOT_COLORS = ['blue', 'green', 'purple', 'orange', 'pink'];

const state = {
  tasks: loadTasks(),
};

function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore corrupt storage */ }
  return DEFAULT_TASKS.slice();
}

function saveTasks() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));
  } catch (e) { /* storage unavailable, continue in-memory only */ }
}

function uid() {
  return 't' + Math.random().toString(36).slice(2, 9);
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
  saveTasks();
  renderAll();
}

function deleteTask(id) {
  state.tasks = state.tasks.filter(t => t.id !== id);
  saveTasks();
  renderAll();
}

function addTask({ title, sub, priority, start, end }) {
  state.tasks.push({
    id: uid(),
    title: title.trim(),
    sub: (sub || '').trim(),
    priority,
    start,
    end,
    done: false,
  });
  saveTasks();
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

document.addEventListener('DOMContentLoaded', () => {
  renderAll();

  // Open modal from any trigger
  document.querySelectorAll('.open-task-modal').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      openTaskModal();
    });
  });

  document.getElementById('taskModalClose').addEventListener('click', closeTaskModal);
  document.getElementById('taskModalCancel').addEventListener('click', closeTaskModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeTaskModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalOverlay.classList.contains('open')) closeTaskModal();
  });

  taskForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = document.getElementById('taskTitleInput').value;
    if (!title.trim()) return;
    addTask({
      title,
      sub: document.getElementById('taskSubInput').value,
      priority: document.getElementById('taskPriorityInput').value,
      start: document.getElementById('taskStartInput').value || '09:00',
      end: document.getElementById('taskEndInput').value || '10:00',
    });
    closeTaskModal();
  });

  // Delegate checkbox toggle + delete on task list (survives re-renders)
  document.getElementById('taskList').addEventListener('change', (e) => {
    if (e.target.matches('input[type=checkbox]')) {
      const li = e.target.closest('.task-item');
      if (li) toggleTask(li.dataset.id);
    }
  });
  document.getElementById('taskList').addEventListener('click', (e) => {
    const delBtn = e.target.closest('.task-delete');
    if (delBtn) {
      const li = delBtn.closest('.task-item');
      if (li) deleteTask(li.dataset.id);
    }
  });

  // ---- Focus mode timer (unrelated to task store) ----
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
      focusCaption.textContent = running ? 'Focusing...' : 'Paused';

      if (running) {
        timer = setInterval(() => {
          if (seconds > 0) {
            seconds--;
            focusTime.textContent = formatTime(seconds);
          } else {
            clearInterval(timer);
            running = false;
            playBtn.textContent = '▶';
            focusCaption.textContent = 'Session complete!';
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
      focusTime.textContent = formatTime(seconds);
      focusCaption.textContent = 'Ready to focus!';
      playBtn.textContent = '▶';
    });
  }

  // Quick action / chip buttons - simple visual feedback for not-yet-wired ones
  document.querySelectorAll('.qa-btn:not(.open-task-modal), .chip, .shortcut-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.style.opacity = '0.6';
      setTimeout(() => (btn.style.opacity = '1'), 150);
    });
  });

  // AI Assistant send (placeholder echo)
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
