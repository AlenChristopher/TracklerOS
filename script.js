
/* TracklerOS — script.js
   Matched to the uploaded index.html and style.css.
   Local-first: tasks are stored in this browser's localStorage.
*/
(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const STORAGE_KEY = 'trackleros_tasks_v1';
  const THEME_KEY = 'trackleros_theme_v1';
  const MOTION_KEY = 'trackleros_reduced_motion_v1';

  const state = {
    items: [],
    calendarDate: new Date(),
    calendarView: 'day',
    activeView: 'today',
    editingId: null,
    showCompleted: false,
    assistantOpen: false,
  };
  
let pendingAssistantTask = null;
let pendingAssistantReminder = null;
let pendingAssistantDraft = null;

function parseAssistantDate(message) {
  const text = message.toLowerCase().trim();
  const today = new Date();
  today.setHours(12, 0, 0, 0);

  // Today and tomorrow.
  if (/\btoday\b/.test(text)) return today;

  if (/\btomorrow\b/.test(text)) {
    const result = new Date(today);
    result.setDate(result.getDate() + 1);
    return result;
  }

  // In N days.
  const daysMatch = text.match(/\bin\s+(\d+)\s+days?\b/);
  if (daysMatch) {
    const result = new Date(today);
    result.setDate(result.getDate() + Number(daysMatch[1]));
    return result;
  }

  // 25th of this month / 5th of next month.
  const monthDayMatch = text.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+of\s+(this|next)\s+month\b/
  );

  if (monthDayMatch) {
    const day = Number(monthDayMatch[1]);
    const monthOffset = monthDayMatch[2] === 'next' ? 1 : 0;
    const result = new Date(
      today.getFullYear(),
      today.getMonth() + monthOffset,
      day,
      12
    );

    if (result.getDate() !== day) return null;
    return result;
  }

  const months = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'
  ];

  // December 10th / 10th December.
  const monthNames = months.join('|');
  const monthFirst = text.match(
    new RegExp(`\\b(${monthNames})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i')
  );
  const dayFirst = text.match(
    new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthNames})\\b`, 'i')
  );

  if (monthFirst || dayFirst) {
    const month = months.indexOf(
      (monthFirst ? monthFirst[1] : dayFirst[2]).toLowerCase()
    );
    const day = Number(monthFirst ? monthFirst[2] : dayFirst[1]);

    let year = today.getFullYear();
    let result = new Date(year, month, day, 12);

    if (result.getDate() !== day || result.getMonth() !== month) {
      return null;
    }

    if (result < today) {
      year++;
      result = new Date(year, month, day, 12);
    }

    return result;
  }

  // Next Monday, next Tuesday, etc.
  const weekdays = [
    'sunday', 'monday', 'tuesday', 'wednesday',
    'thursday', 'friday', 'saturday'
  ];

  const weekdayMatch = text.match(
    /\bnext\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/
  );

  if (weekdayMatch) {
    const target = weekdays.indexOf(weekdayMatch[1]);
    const result = new Date(today);
    let difference = (target - today.getDay() + 7) % 7;

    if (difference === 0) difference = 7;

    result.setDate(result.getDate() + difference);
    return result;
  }

  return null;
}


function parseAssistantTaskRequest(message) {
  const now = new Date();
  const text = message.trim();

  // Extract time: 10 AM, 10:00 AM, 10:00 a.m., or 22:00.
  const timeMatch = text.match(
    /\b(\d{1,2})(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)\b|\b([01]?\d|2[0-3]):([0-5]\d)\b/i
  );

  if (!timeMatch) return { missing: 'time' };

  let hours;
  let minutes;

  if (timeMatch[3]) {
    const period = timeMatch[3].replace(/\./g, '').toLowerCase();

    hours = Number(timeMatch[1]) % 12;
    if (period === 'pm') hours += 12;

    minutes = Number(timeMatch[2] || 0);
  } else {
    hours = Number(timeMatch[4]);
    minutes = Number(timeMatch[5]);
  }

    // Extract date using natural language.
  const date = parseAssistantDate(text);

  if (!date) return { missing: 'date' };

  // Extract task title.
  const title = text
    .replace(/^(please\s+)?(create|add|make|schedule)\s+(a\s+)?(new\s+)?task\s+(to\s+)?/i, '')
    .replace(/\b(today|tomorrow|next\s+(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)|in\s+\d+\s+days?)\b/i, '')
.replace(/\b\d{1,2}(?:st|nd|rd|th)?\s+of\s+(?:this|next)\s+month\b/i, '')
.replace(/\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?\b/i, '')
.replace(/\b\d{1,2}(?:st|nd|rd|th)?\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)\b/i, '')
    .replace(/\b(at\s+)?\d{1,2}(?::[0-5]\d)?\s*(a\.?m\.?|p\.?m\.?)\b/i, '')
    .replace(/\b(at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!title) return { missing: 'title' };

  return {
    title: title.replace(/[.,!?]+$/, ''),
    date: dateKey(date),
    start: `${pad(hours)}:${pad(minutes)}`,
    duration: 30
  };
}

function parseAssistantReminderRequest(message) {
  const taskRequest = message.replace(
    /^remind\s+me\s+to\s+/i,
    'Create a task to '
  );

  const result = parseAssistantTaskRequest(taskRequest);

  if (!result.missing) {
    result.isReminder = true;
    result.reminderNotified = false;
  }

  return result;
}



  const pad = n => String(n).padStart(2, '0');
  const dateKey = (d = new Date()) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseDate = value => {
    const [y, m, d] = String(value).split('-').map(Number);
    return new Date(y, m - 1, d, 12);
  };
  const addDays = (d, n) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  };
  const startOfWeek = d => addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -d.getDay());
  const sameDate = (a, b) => dateKey(a) === dateKey(b);
  const mins = value => {
    const [h, m] = String(value || '09:00').split(':').map(Number);
    return h * 60 + m;
  };
  const timeString = value => `${pad(Math.floor(value / 60) % 24)}:${pad(value % 60)}`;
  const time12 = value => {
    const [h, m] = String(value || '09:00').split(':').map(Number);
    return `${h % 12 || 12}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`;
  };
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
  const uid = () => `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const data = raw ? JSON.parse(raw) : null;
      if (Array.isArray(data)) state.items = data;
      else if (data && Array.isArray(data.items)) state.items = data.items;
      else state.items = seedTasks();
    } catch (error) {
      console.warn('Trackler could not load saved tasks:', error);
      state.items = seedTasks();
    }
    state.items = state.items.map(item => ({
      id: item.id || uid(),
      title: item.title || 'Untitled task',
      type: ['task', 'meeting', 'focus', 'break'].includes(item.type) ? item.type : 'task',
      priority: item.priority || 'medium',
      date: item.date || dateKey(),
      start: item.start || '09:00',
      duration: Number(item.duration) > 0 ? Number(item.duration) :
        Math.max(15, mins(item.end || '09:30') - mins(item.start || '09:00')),
      done: Boolean(item.done),
      isReminder: Boolean(item.isReminder),
reminderNotified: Boolean(item.reminderNotified),
    }));
    save();
  }

  function seedTasks() {
    const today = dateKey();
    return [
      { id: uid(), title: 'Review your priorities', type: 'task', priority: 'high', date: today, start: '09:00', duration: 45, done: false },
      { id: uid(), title: 'Plan the day', type: 'focus', priority: 'medium', date: today, start: '10:00', duration: 30, done: false },
      { id: uid(), title: 'Take a break', type: 'break', priority: 'low', date: today, start: '11:00', duration: 15, done: false },
    ];
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ items: state.items })); }
    catch (error) { console.warn('Trackler could not save tasks:', error); }
  }

  function toast(message) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  function itemsFor(date) {
    const key = typeof date === 'string' ? date : dateKey(date);
    return state.items
      .filter(item => item.date === key)
      .sort((a, b) => mins(a.start) - mins(b.start));
  }

  function typeIcon(type) {
    return ({ task: '✓', meeting: '▦', focus: '◎', break: '☕' })[type] || '•';
  }

  function typeLabel(type) {
    return ({ task: 'Task', meeting: 'Meeting', focus: 'Focus block', break: 'Break' })[type] || 'Task';
  }

  function priorityClass(priority) {
    return ({ high: 'priority-high', medium: 'priority-medium', low: 'priority-low' })[priority] || '';
  }

  function renderGreeting() {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';
    const heading = $('#greetingHeading');
    const sub = $('#greetingSub');
    if (heading) heading.innerHTML = `${greeting}, Alen <span class="wave">👋</span>`;
    if (sub) sub.textContent = new Intl.DateTimeFormat('en', {
      weekday: 'long', month: 'long', day: 'numeric'
    }).format(new Date()) + ' · Here is your plan for today.';
  }

  function renderBriefing() {
    const el = $('#briefingText');
    if (!el) return;
    const today = itemsFor(new Date());
    const open = today.filter(x => !x.done);
    const next = open[0];
    el.textContent = open.length
      ? `You have ${open.length} item${open.length === 1 ? '' : 's'} planned today${next ? `. Your next item is “${next.title}” at ${time12(next.start)}.` : '.'}`
      : 'Your schedule is clear. Add a task or take a moment to plan what matters.';
  }

  function renderRecommendation() {
    const card = $('#recommendationCard');
    const title = $('#recTitle');
    const body = $('#recBody');
    if (!card || !title || !body) return;
    const open = itemsFor(new Date()).filter(x => !x.done);
    const urgent = open.find(x => x.priority === 'high');
    card.classList.remove('hidden');
    if (urgent) {
      title.textContent = 'A priority to focus on';
      body.textContent = `Consider starting with “${urgent.title}”. It is marked high priority.`;
    } else if (!open.length) {
      title.textContent = 'You’re all set.';
      body.textContent = 'No unfinished items for today. Enjoy the breathing room or add a new task.';
    } else {
      title.textContent = 'Keep your momentum';
      body.textContent = `You have ${open.length} unfinished item${open.length === 1 ? '' : 's'} today. Pick the next one and make a start.`;
    }
  }

  function renderDay() {
    const list = $('#dayTimeline');
    if (!list) return;
    const todayItems = itemsFor(new Date());
    const active = todayItems.filter(x => !x.done);
    const completed = todayItems.filter(x => x.done);
    list.innerHTML = active.length ? active.map(item => `
      <li class="timeline-item" data-item-id="${escapeHTML(item.id)}">
        <div class="timeline-time">${time12(item.start)}</div>
        <div class="timeline-track"><span class="timeline-dot"></span></div>
        <div class="timeline-content ${item.isReminder ? 'is-reminder' : ''}">
          <button
  class="task-check"
  type="button"
  data-toggle="${escapeHTML(item.id)}"
  aria-label="Mark ${escapeHTML(item.title)} complete"
  title="Mark complete"
>
  <span aria-hidden="true">✓</span>
</button>
          <div class="event-icon">${item.isReminder ? '🔔' : typeIcon(item.type)}</div>
          <div class="event-info">
            <div class="event-title">${escapeHTML(item.title)}</div>
            <div class="event-meta">${time12(item.start)} · ${item.duration} min · ${item.isReminder ? 'Reminder' : typeLabel(item.type)}</div>
          </div>
          <span class="event-tag ${priorityClass(item.priority)}">${escapeHTML(item.priority)}</span>
                   <div class="task-menu-wrap">
            <button
              class="task-edit"
              type="button"
              data-task-menu="${escapeHTML(item.id)}"
              aria-label="Task options"
              aria-expanded="false"
            >
  <svg width="18" height="18" viewBox="0 0 24 24"
       fill="none" stroke="currentColor" stroke-width="2"
       stroke-linecap="round" stroke-linejoin="round"
       aria-hidden="true">
    <circle cx="5" cy="12" r="1"/>
    <circle cx="12" cy="12" r="1"/>
    <circle cx="19" cy="12" r="1"/>
  </svg>
</button>

            <div class="task-menu hidden" data-task-menu-panel="${escapeHTML(item.id)}">
              <button type="button" data-edit="${escapeHTML(item.id)}">
                <span aria-hidden="true">✎</span>
                Edit task
              </button>
            </div>
          </div>
      </li>
    `).join('') : `<li class="empty-day">Nothing planned for today. Add a task to get started.</li>`;

    const toggle = $('#completedToggle');
    const completedList = $('#completedList');
    if (toggle && completedList) {
      toggle.classList.toggle('hidden', completed.length === 0);
      toggle.textContent = state.showCompleted ? `Hide completed (${completed.length})` : `Show completed (${completed.length})`;
      completedList.classList.toggle('hidden', !state.showCompleted);
      completedList.innerHTML = completed.map(item => `
        <li><button type="button" data-toggle="${escapeHTML(item.id)}">↶</button> ${escapeHTML(item.title)} · ${time12(item.start)}</li>
      `).join('');
    }
  }

  function renderUpcoming() {
    const list = $('#upcomingList');
    if (!list) return;
    const tomorrow = dateKey(addDays(new Date(), 1));
    const items = itemsFor(tomorrow).filter(item => !item.done).slice(0, 5);
    list.innerHTML = items.length ? items.map(item => `
      <li>
        <span class="upcoming-time">${time12(item.start)}</span>
        <div><div class="upcoming-event">${escapeHTML(item.title.trim())}</div><div class="upcoming-type">${item.isReminder ? 'Reminder' : typeLabel(item.type)}</div></div>
      </li>
    `).join('') : '<li><div class="upcoming-type">No events planned for tomorrow.</div></li>';
    const more = $('#moreEventsLink');
    if (more) {
      more.textContent = items.length ? 'Open calendar →' : '';
      more.onclick = event => { event.preventDefault(); navigate('schedule'); };
    }
  }

  function renderToday() {
    renderGreeting();
    renderBriefing();
    renderRecommendation();
    renderDay();
    renderUpcoming();
  }

  function navigate(view) {
    if (view === 'assistant') {
      toggleAssistant(true);
      $$('.mtab').forEach(btn => btn.classList.toggle('active', btn.dataset.view === 'assistant'));
      return;
    }
    const allowed = ['today', 'schedule', 'projects', 'insights', 'settings'];
    if (!allowed.includes(view)) return;
    state.activeView = view;
    $$('[data-view-panel]').forEach(panel => {
      if (panel.id === 'assistantPanel') return;
      panel.classList.toggle('hidden', panel.dataset.viewPanel !== view);
    });
    $$('[data-view]').forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
    if (view === 'today') renderToday();
    if (view === 'schedule') renderCalendar();
  }

  function openModal(item = null, preset = {}) {
    const overlay = $('#taskModalOverlay');
    const form = $('#taskForm');
    if (!overlay || !form) return;
    state.editingId = item ? item.id : null;
    $('#taskModalTitle').textContent = item ? 'Edit Task' : 'Add to Your Day';
    $('#taskTitleInput').value = item?.title || '';
    $('#taskTypeInput').value = item?.type || preset.type || 'task';
    $('#taskPriorityInput').value = item?.priority || preset.priority || 'medium';
    $('#taskDateInput').value = item?.date || preset.date || dateKey(state.calendarDate);
    $('#taskStartInput').value = item?.start || preset.start || '09:00';
    $('#taskDurationInput').value = item?.duration || preset.duration || 30;
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden', 'false');
    setTimeout(() => $('#taskTitleInput')?.focus(), 50);
  }

  function closeModal() {
    const overlay = $('#taskModalOverlay');
    if (!overlay) return;
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden', 'true');
    state.editingId = null;
  }

  function submitTask(event) {
    event.preventDefault();
    const title = $('#taskTitleInput').value.trim();
    const date = $('#taskDateInput').value || dateKey();
    const start = $('#taskStartInput').value || '09:00';
    const duration = Math.max(5, Number($('#taskDurationInput').value) || 30);
    if (!title) return toast('Please enter a task title.');
    const record = {
      title, date, start, duration,
      type: $('#taskTypeInput').value,
      priority: $('#taskPriorityInput').value,
    };
    if (state.editingId) {
      const existing = state.items.find(x => x.id === state.editingId);
      if (existing) Object.assign(existing, record);
      toast('Task updated.');
    } else {
      state.items.push({ id: uid(), ...record, done: false });
      toast('Task added.');
    }
    save();
    closeModal();
    renderAll();
  }

  function toggleTask(id) {
  const item = state.items.find(x => x.id === id);
  if (!item) return;

  const willComplete = !item.done;
  const taskCard = document.querySelector(
    `.timeline-item[data-item-id="${CSS.escape(id)}"]`
  );

  if (willComplete && taskCard) {
    taskCard.classList.add('task-completing');

    setTimeout(() => {
      item.done = true;
      save();
      renderAll();
    }, 350);

    return;
  }

  item.done = willComplete;
  save();
  renderAll();
}

  function editTask(id) {
    const item = state.items.find(x => x.id === id);
    if (item) openModal(item);
  }

  function renderMiniCalendar() {
    const grid = $('#miniCalendar');
    const label = $('#miniMonthLabel');
    if (!grid || !label) return;
    const selected = state.calendarDate;
    const first = startOfWeek(new Date(selected.getFullYear(), selected.getMonth(), 1));
    label.textContent = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(selected);
    const weekdays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    grid.innerHTML = weekdays.map(day => `<span class="mini-weekday">${day}</span>`).join('');
    for (let i = 0; i < 42; i++) {
      const day = addDays(first, i);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = day.getDate();
      if (day.getMonth() !== selected.getMonth()) btn.classList.add('other-month');
      if (sameDate(day, new Date())) btn.classList.add('today');
      if (sameDate(day, selected)) btn.classList.add('selected');
      if (itemsFor(day).length) btn.title = `${itemsFor(day).length} event(s)`;
      btn.addEventListener('click', () => {
        state.calendarDate = day;
        state.calendarView = 'day';
        setCalendarViewButtons();
        renderCalendar();
      });
      grid.appendChild(btn);
    }
  }

  function setCalendarViewButtons() {
    $$('[data-cal-view]').forEach(btn => btn.classList.toggle('active', btn.dataset.calView === state.calendarView));
  }

  function calendarEvent(item, compact = false) {
    const classes = ['cal-event', item.type, compact ? 'compact' : ''].filter(Boolean).join(' ');
    return `<button type="button" class="${classes}" data-calendar-edit="${escapeHTML(item.id)}">
      <strong>${escapeHTML(item.title)}</strong><small>${time12(item.start)}</small>
    </button>`;
  }

  // Arrange overlapping events into side-by-side lanes.
  function getCalendarEventLayouts(events) {
    const sorted = [...events].sort((a, b) =>
      mins(a.start) - mins(b.start) ||
      (mins(a.start) + a.duration) - (mins(b.start) + b.duration)
    );

    const layouts = new Map();
    let cluster = [];
    let clusterEnd = -Infinity;

    function finishCluster() {
      if (!cluster.length) return;

      const laneEnds = [];
      const assigned = [];

      cluster.forEach(item => {
        const start = mins(item.start);
        const end = start + item.duration;
        let lane = laneEnds.findIndex(laneEnd => laneEnd <= start);

        if (lane === -1) {
          lane = laneEnds.length;
          laneEnds.push(end);
        } else {
          laneEnds[lane] = end;
        }

        assigned.push({ item, lane });
      });

      const laneCount = Math.max(1, laneEnds.length);
      assigned.forEach(({ item, lane }) => {
        layouts.set(item.id, {
          left: lane * 100 / laneCount,
          width: 100 / laneCount
        });
      });

      cluster = [];
      clusterEnd = -Infinity;
    }

    sorted.forEach(item => {
      const start = mins(item.start);
      const end = start + item.duration;
      if (cluster.length && start >= clusterEnd) finishCluster();
      cluster.push(item);
      clusterEnd = Math.max(clusterEnd, end);
    });

    finishCluster();
    return layouts;
  }

  function calendarEventMarkup(item, layout, includeDuration = true) {
    const top = (mins(item.start) - 360) / 60 * 58;
    const height = Math.max(28, item.duration / 60 * 58);
    const left = layout ? layout.left : 0;
    const width = layout ? layout.width : 100;
    const showTime = includeDuration && height >= 40;

    return `<button
      type="button"
      class="cal-event ${item.type} ${item.isReminder ? 'is-reminder' : ''}"
      data-calendar-edit="${escapeHTML(item.id)}"
      data-calendar-event="${escapeHTML(item.id)}"
      data-calendar-date="${escapeHTML(item.date)}"
      title="${escapeHTML(item.title)} · ${time12(item.start)} · ${item.duration} min"
      style="top:${top}px;height:${height}px;left:calc(${left}% + 4px);width:calc(${width}% - 8px);right:auto"
    >
      <strong>${item.isReminder ? '🔔 ' : ''}${escapeHTML(item.title)}</strong>
${showTime ? `<small>${time12(item.start)} · ${item.duration} min${item.isReminder ? ' · Reminder' : ''}</small>` : ''}
      <span class="cal-event-resize" data-resize="${escapeHTML(item.id)}" aria-label="Resize event"></span>
    </button>`;
  }

  function renderDayCalendar() {
    const canvas = $('#calendarCanvas');
    if (!canvas) return;

    const day = state.calendarDate;
    const events = itemsFor(day);
    const layouts = getCalendarEventLayouts(events);
    const hours = Array.from({ length: 17 }, (_, i) => i + 6);

    canvas.innerHTML = `
      <div class="cal-day-header">
        <div></div>
        <div class="cal-day-name selected">${new Intl.DateTimeFormat('en', { weekday: 'long' }).format(day)}<strong>${day.getDate()}</strong></div>
      </div>
      <div class="cal-time-grid">
        <div class="cal-time-labels">
          ${hours.map(h => `<div class="cal-time-label">${new Date(2000, 0, 1, h).toLocaleTimeString('en', { hour: 'numeric' }).replace(':00', '')}</div>`).join('')}
        </div>
        <div class="cal-day-column">
          ${hours.map(h => `<div class="cal-time-column" data-hour="${h}"></div>`).join('')}
          ${events.map(item => calendarEventMarkup(item, layouts.get(item.id))).join('')}
        </div>
      </div>`;

    const col = $('.cal-day-column', canvas);
    col?.addEventListener('click', event => {
      if (event.target.closest('[data-calendar-edit]')) return;
      const rect = col.getBoundingClientRect();
      const minuteOffset = Math.floor(((event.clientY - rect.top) / 58 * 60) / 15) * 15;
      const start = Math.max(360, Math.min(1290, 360 + minuteOffset));
      openModal(null, { date: dateKey(day), start: timeString(start) });
    });
  }

  function renderWeekCalendar() {
    const canvas = $('#calendarCanvas');
    if (!canvas) return;

    const start = startOfWeek(state.calendarDate);
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    const hours = Array.from({ length: 17 }, (_, i) => i + 6);

    canvas.innerHTML = `
      <div class="cal-week-scroll">
        <div class="cal-week-header">
          <div></div>
          ${days.map(day => `<div class="${sameDate(day, new Date()) ? 'selected' : ''}">${new Intl.DateTimeFormat('en', { weekday: 'short' }).format(day)}<strong>${day.getDate()}</strong></div>`).join('')}
        </div>
        <div class="cal-week-grid">
          <div>${hours.map(h => `<div class="cal-time-label">${new Date(2000, 0, 1, h).toLocaleTimeString('en', { hour: 'numeric' }).replace(':00', '')}</div>`).join('')}</div>
          ${days.map(day => {
            const events = itemsFor(day);
            const layouts = getCalendarEventLayouts(events);
            return `<div class="cal-week-day" data-week-date="${dateKey(day)}">
              ${hours.map(() => '<div class="cal-week-hour"></div>').join('')}
              ${events.map(item => calendarEventMarkup(item, layouts.get(item.id))).join('')}
            </div>`;
          }).join('')}
        </div>
      </div>`;

    $$('[data-week-date]', canvas).forEach(col => {
      col.addEventListener('click', event => {
        if (event.target.closest('[data-calendar-edit]')) return;
        const rect = col.getBoundingClientRect();
        const minuteOffset = Math.floor(((event.clientY - rect.top) / 58 * 60) / 15) * 15;
        const start = Math.max(360, Math.min(1290, 360 + minuteOffset));
        openModal(null, { date: col.dataset.weekDate, start: timeString(start) });
      });
    });
  }

function renderMonthCalendar() {
    const canvas = $('#calendarCanvas');
    if (!canvas) return;
    const selected = state.calendarDate;
    const first = startOfWeek(new Date(selected.getFullYear(), selected.getMonth(), 1));
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const days = Array.from({ length: 42 }, (_, i) => addDays(first, i));
    canvas.innerHTML = `<div class="cal-month-grid">
      ${weekdays.map(d => `<div class="cal-month-weekday">${d}</div>`).join('')}
      ${days.map(day => {
        const list = itemsFor(day);
        const classes = ['cal-month-cell', day.getMonth() !== selected.getMonth() ? 'other-month' : ''].join(' ');
        return `<div class="${classes}" data-month-date="${dateKey(day)}">
          <div class="cal-month-date ${sameDate(day,new Date()) ? 'today' : ''}">${day.getDate()}</div>
          ${list.slice(0, 3).map(item => `<div class="cal-month-event ${item.type} ${item.isReminder ? 'is-reminder' : ''}" data-calendar-edit="${escapeHTML(item.id)}">${item.isReminder ? '🔔 Reminder · ' : ''}${escapeHTML(item.title)}</div>`).join('')}
          ${list.length > 3 ? `<div class="cal-empty">+${list.length - 3} more</div>` : ''}
        </div>`;
      }).join('')}
    </div>`;
    $$('[data-month-date]', canvas).forEach(cell => {
      cell.addEventListener('click', event => {
        if (event.target.closest('[data-calendar-edit]')) return;
        state.calendarDate = parseDate(cell.dataset.monthDate);
        state.calendarView = 'day';
        setCalendarViewButtons();
        renderCalendar();
      });
    });
  }

  function renderCalendar() {
    const heading = $('#calHeading');
    if (heading) {
      heading.textContent = new Intl.DateTimeFormat('en', {
        month: 'long', year: 'numeric'
      }).format(state.calendarDate);
    }
    renderMiniCalendar();
    setCalendarViewButtons();
    if (state.calendarView === 'month') renderMonthCalendar();
    else if (state.calendarView === 'week') renderWeekCalendar();
    else renderDayCalendar();
  }

  function shiftCalendar(amount) {
    const d = state.calendarDate;
    if (state.calendarView === 'month') state.calendarDate = new Date(d.getFullYear(), d.getMonth() + amount, 1);
    else state.calendarDate = addDays(d, amount * (state.calendarView === 'week' ? 7 : 1));
    renderCalendar();
  }

  function renderAll() {
    renderToday();
    renderCalendar();
  }

  function toggleAssistant(force) {
  const panel = $('#assistantPanel');
  const app = $('#app');

  if (!panel || !app) return;

  state.assistantOpen =
    typeof force === 'boolean' ? force : !state.assistantOpen;

  app.classList.toggle('assistant-visible', state.assistantOpen);
  panel.classList.toggle('assistant-open', state.assistantOpen);
}

  function setAssistantState(value, text) {
    const orb = $('#assistantOrb');
    const status = $('#assistantStatus');
    const sub = $('#assistantStatusSub');
    if (orb) orb.dataset.state = value;
    if (status) status.textContent = text || ({
      idle: 'Idle', listening: 'Listening…', thinking: 'Thinking…', speaking: 'Speaking…'
    })[value] || 'Working…';
    if (sub) sub.textContent = value === 'idle' ? 'Tap the mic or type below' : 'Trackler Assistant';
    $('#waveform')?.classList.toggle('active', value === 'listening' || value === 'speaking');
  }

  
  function appendAssistantMessage(message, sender) {
    const chat = $('#assistantChat');
    if (!chat) return;

    // Remove the welcome message when the first message is sent.
    chat.querySelector('.assistant-welcome')?.remove();

    const bubble = document.createElement('div');
    bubble.className = `chat-message ${sender}`;
    bubble.textContent = message;

    chat.appendChild(bubble);
    chat.scrollTop = chat.scrollHeight;
  }

  

function sendAssistantMessage() {
  const input = $('#assistantInput');
  if (!input || !input.value.trim()) return;

  const message = input.value.trim();
  input.value = '';

  appendAssistantMessage(message, 'user');
  setAssistantState('thinking');

  const lower = message.toLowerCase();

  // Confirm a pending reminder.
  if (pendingAssistantReminder) {
    if (/^(yes|yeah|yep|confirm|save|save it|go ahead)$/i.test(lower)) {
      const reminder = pendingAssistantReminder;
      pendingAssistantReminder = null;

      state.items.push({
        id: uid(),
        title: reminder.title,
        type: 'task',
        priority: 'medium',
        date: reminder.date,
        start: reminder.start,
        duration: reminder.duration,
        done: false,
        isReminder: true,
        reminderNotified: false
      });

      save();
      renderAll();

      appendAssistantMessage(
        `Reminder saved: "${reminder.title}" for ${time12(reminder.start)}. `,
        'assistant'
      );
      toast('Reminder saved.');
      if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission();
}
    } else if (/^(no|nope|cancel|don't save)$/i.test(lower)) {
      pendingAssistantReminder = null;
      appendAssistantMessage(
        "No problem. I haven't saved the reminder.",
        'assistant'
      );
    } else {
      appendAssistantMessage(
        'Please reply Yes to save this reminder, or No to cancel it.',
        'assistant'
      );
    }

    setAssistantState('idle');
    return;
  }

  // Confirm a pending task.
  if (pendingAssistantTask) {
    if (/^(yes|yeah|yep|confirm|save|save it|go ahead)$/i.test(lower)) {
      const task = pendingAssistantTask;
      pendingAssistantTask = null;

      state.items.push({
        id: uid(),
        title: task.title,
        type: 'task',
        priority: 'medium',
        date: task.date,
        start: task.start,
        duration: task.duration,
        done: false
      });

      save();
      renderAll();

      appendAssistantMessage(
        `Done! I've added "${task.title}" to your schedule.`,
        'assistant'
      );
      toast('Task created successfully.');
    } else if (/^(no|nope|cancel|don't save)$/i.test(lower)) {
      pendingAssistantTask = null;
      appendAssistantMessage(
        "No problem. I haven't saved the task.",
        'assistant'
      );
    } else {
      appendAssistantMessage(
        'Please reply Yes to save this task, or No to cancel it.',
        'assistant'
      );
    }

    setAssistantState('idle');
    return;
  }

  // Continue an incomplete assistant request.
  if (pendingAssistantDraft) {
    const draft = pendingAssistantDraft;
    const combinedMessage = `${draft.message} ${message}`;

    const result = draft.kind === 'reminder'
      ? parseAssistantReminderRequest(combinedMessage)
      : parseAssistantTaskRequest(combinedMessage);

    draft.message = combinedMessage;

    if (result.missing) {
      pendingAssistantDraft = {
  kind: draft.kind,
  message: combinedMessage
};
      const prompts = {
        date: 'What day should I schedule that?',
        time: 'What time should I schedule that?',
        title: 'What should I call it?'
      };

      appendAssistantMessage(prompts[result.missing], 'assistant');
      setAssistantState('idle');
      return;
    }

    pendingAssistantDraft = null;

    if (draft.kind === 'reminder') {
      pendingAssistantReminder = result;

      const readableDate = new Intl.DateTimeFormat('en', {
        weekday: 'long',
        month: 'long',
        day: 'numeric'
      }).format(parseDate(result.date));

      appendAssistantMessage(
        `Here's your reminder:\n\nReminder: ${result.title}\nDate: ${readableDate}\nTime: ${time12(result.start)}\n\nShould I save this reminder? Reply Yes or No.`,
        'assistant'
      );
    } else {
      pendingAssistantTask = result;

      const readableDate = new Intl.DateTimeFormat('en', {
        weekday: 'long',
        month: 'long',
        day: 'numeric'
      }).format(parseDate(result.date));

      appendAssistantMessage(
        `Here's the task I understood:\n\nTask: ${result.title}\nDate: ${readableDate}\nTime: ${time12(result.start)}\n\nShould I save this task? Reply Yes or No.`,
        'assistant'
      );
    }

    setAssistantState('idle');
    return;
  }

  // Detect reminder requests.
  if (/\bremind me to\b/i.test(lower)) {
    const result = parseAssistantReminderRequest(message);

    if (result.missing) {
      pendingAssistantDraft = { kind: 'reminder', message };
      const prompts = {
        date: 'What day should I remind you? Please say today or tomorrow.',
        time: 'What time should I remind you?',
        title: 'What should I remind you about?'
      };

      appendAssistantMessage(prompts[result.missing], 'assistant');
      setAssistantState('idle');
      return;
    }

    pendingAssistantReminder = result;

    const readableDate = new Intl.DateTimeFormat('en', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    }).format(parseDate(result.date));

    appendAssistantMessage(
      `Here's your reminder:\n\n` +
      `Reminder: ${result.title}\n` +
      `Date: ${readableDate}\n` +
      `Time: ${time12(result.start)}\n\n` +
      `Should I save this reminder? Reply Yes or No.`,
      'assistant'
    );

    setAssistantState('idle');
    return;
  }

  // Detect ordinary task requests.
  if (
  /\b(create|add|make|schedule)\b/i.test(lower) &&
  /\btask\b/i.test(lower) ||
  /^(call|email|text|message|finish|complete|buy|pick up|send|meet|review|prepare|submit|check|visit|book)\b/i.test(lower)
) {
    const result = parseAssistantTaskRequest(message);

    if (result.missing) {
      pendingAssistantDraft = { kind: 'task', message };
      const prompts = {
        date: 'What day should I schedule this task? Please say today or tomorrow.',
        time: 'What time should I schedule this task?',
        title: 'What should I call this task?'
      };

      appendAssistantMessage(prompts[result.missing], 'assistant');
      setAssistantState('idle');
      return;
    }

    pendingAssistantTask = result;

    const readableDate = new Intl.DateTimeFormat('en', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    }).format(parseDate(result.date));

    appendAssistantMessage(
      `Here's the task I understood:\n\n` +
      `Task: ${result.title}\n` +
      `Date: ${readableDate}\n` +
      `Time: ${time12(result.start)}\n` +
      `Duration: ${result.duration} minutes\n\n` +
      `Should I save this task? Reply Yes or No.`,
      'assistant'
    );

    setAssistantState('idle');
    return;
  }

  appendAssistantMessage(
    'Try: "Create a task to finish my project tomorrow at 10 AM" or "Remind me to call John tomorrow at 4 PM."',
    'assistant'
  );

  setAssistantState('idle');
}



  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    document.body.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
    const themeBtn = $('#themeBtn');
    if (themeBtn) themeBtn.textContent = theme === 'light' ? '🌙' : '☀️';
  }

  function initThemeControls() {
    const savedTheme = localStorage.getItem(THEME_KEY) || 'dark';
    applyTheme(savedTheme);

    $('#lightModeBtn')?.addEventListener('click', () => applyTheme('light'));
    $('#darkModeBtn')?.addEventListener('click', () => applyTheme('dark'));
    $('#themeBtn')?.addEventListener('click', () => {
      const current = document.documentElement.dataset.theme || 'dark';
      applyTheme(current === 'dark' ? 'light' : 'dark');
    });

    const reduced = localStorage.getItem(MOTION_KEY) === 'true';
    if (reduced) document.documentElement.classList.add('reduced-motion');

    const motionBtn = $('#reducedMotionBtn');
    if (motionBtn) {
      motionBtn.setAttribute('aria-pressed', String(reduced));
      motionBtn.addEventListener('click', () => {
        const enabled = !document.documentElement.classList.contains('reduced-motion');
        document.documentElement.classList.toggle('reduced-motion', enabled);
        motionBtn.setAttribute('aria-pressed', String(enabled));
        localStorage.setItem(MOTION_KEY, String(enabled));
      });
    }
  }

  function initNavigation() {
    $$('[data-view]').forEach(button => {
      button.addEventListener('click', event => {
        event.preventDefault();
        navigate(button.dataset.view);
      });
    });

    $('#navAssistant')?.addEventListener('click', () => {
  toggleAssistant(!state.assistantOpen);
});

    $('#assistantCloseBtn')?.addEventListener('click', () => toggleAssistant(false));

    $('#sidebarCollapseBtn')?.addEventListener('click', () => {
      const sidebar = $('.sidebar3');
      if (!sidebar) return;
      sidebar.classList.toggle('collapsed');
      toast(sidebar.classList.contains('collapsed') ? 'Sidebar collapsed.' : 'Sidebar expanded.');
    });
  }

  function initTaskControls() {
    $$('.open-task-modal').forEach(button => {
      button.addEventListener('click', () => openModal());
    });

    $('#taskForm')?.addEventListener('submit', submitTask);
    $('#taskModalClose')?.addEventListener('click', closeModal);
    $('#taskModalCancel')?.addEventListener('click', closeModal);

    $('#taskModalOverlay')?.addEventListener('click', event => {
      if (event.target === $('#taskModalOverlay')) closeModal();
    });

    $('#completedToggle')?.addEventListener('click', () => {
      state.showCompleted = !state.showCompleted;
      renderDay();
    });

    document.addEventListener('click', event => {

      const menuButton = event.target.closest('[data-task-menu]');

      if (menuButton) {
        event.stopPropagation();

        const id = menuButton.dataset.taskMenu;
        const panel = document.querySelector(
          `[data-task-menu-panel="${CSS.escape(id)}"]`
        );

        const wasOpen = panel && !panel.classList.contains('hidden');

        document.querySelectorAll('[data-task-menu-panel]').forEach(menu => {
          menu.classList.add('hidden');
        });

        document.querySelectorAll('[data-task-menu]').forEach(button => {
          button.setAttribute('aria-expanded', 'false');
        });

        if (panel && !wasOpen) {
          panel.classList.remove('hidden');
          menuButton.setAttribute('aria-expanded', 'true');
        }

        return;
      }

      if (!event.target.closest('.task-menu-wrap')) {
        document.querySelectorAll('[data-task-menu-panel]').forEach(menu => {
          menu.classList.add('hidden');
        });

        document.querySelectorAll('[data-task-menu]').forEach(button => {
          button.setAttribute('aria-expanded', 'false');
        });
      }

      const toggle = event.target.closest('[data-toggle]');
      if (toggle) {
        toggleTask(toggle.dataset.toggle);
        return;
      }

      const edit = event.target.closest('[data-edit]');
      if (edit) {
        editTask(edit.dataset.edit);
        return;
      }

      const calendarEdit = event.target.closest('[data-calendar-edit]');
      if (calendarEdit) {
        event.stopPropagation();
        editTask(calendarEdit.dataset.calendarEdit);
      }
    });
  }

  function initCalendarInteractions() {
    const canvas = $('#calendarCanvas');
    if (!canvas) return;

    let gesture = null;
    let suppressEventClick = false;

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const snap15 = value => Math.round(value / 15) * 15;

    canvas.addEventListener('pointerdown', event => {
      const eventCard = event.target.closest('[data-calendar-event]');
      if (!eventCard || !canvas.contains(eventCard) || event.button !== 0) return;

      const item = state.items.find(entry => entry.id === eventCard.dataset.calendarEvent);
      if (!item) return;

      gesture = {
        pointerId: event.pointerId,
        item,
        element: eventCard,
        mode: event.target.closest('[data-resize]') ? 'resize' : 'move',
        startX: event.clientX,
        startY: event.clientY,
        originalStart: mins(item.start),
        originalDuration: item.duration,
        originalDate: item.date,
        moved: false
      };
    });

    document.addEventListener('pointermove', event => {
      if (!gesture || event.pointerId !== gesture.pointerId) return;

      const deltaX = event.clientX - gesture.startX;
      const deltaY = event.clientY - gesture.startY;
      if (!gesture.moved && Math.hypot(deltaX, deltaY) < 4) return;

      gesture.moved = true;
      gesture.element.classList.add('is-dragging');
      event.preventDefault();

      const deltaMinutes = deltaY / 58 * 60;

      if (gesture.mode === 'resize') {
        const previewDuration = clamp(
          gesture.originalDuration + deltaMinutes,
          15,
          1320 - gesture.originalStart
        );
        gesture.element.style.height = `${Math.max(28, previewDuration / 60 * 58)}px`;
      } else {
        const previewStart = clamp(
          gesture.originalStart + deltaMinutes,
          360,
          1320 - gesture.originalDuration
        );
        gesture.element.style.top = `${(previewStart - 360) / 60 * 58}px`;
      }
    }, { passive: false });

    function finishGesture(event) {
      if (!gesture || (event && event.pointerId !== gesture.pointerId)) return;

      const current = gesture;
      gesture = null;
      current.element.classList.remove('is-dragging');
      if (!current.moved) return;

      const deltaMinutes = snap15((event.clientY - current.startY) / 58 * 60);

      if (current.mode === 'resize') {
        current.item.duration = clamp(
          snap15(current.originalDuration + deltaMinutes),
          15,
          1320 - current.originalStart
        );
      } else {
        const newStart = clamp(
          snap15(current.originalStart + deltaMinutes),
          360,
          1320 - current.originalDuration
        );
        current.item.start = timeString(newStart);
      }

      if (state.calendarView === 'week' && current.mode === 'move' && event) {
        const target = document.elementFromPoint(event.clientX, event.clientY);
        const targetDay = target?.closest('[data-week-date]');
        if (targetDay && canvas.contains(targetDay)) {
          current.item.date = targetDay.dataset.weekDate;
        }
      }

      save();
      suppressEventClick = true;
      renderAll();
      toast(current.mode === 'resize' ? 'Event duration updated.' : 'Event time updated.');
      setTimeout(() => { suppressEventClick = false; }, 500);
    }

    document.addEventListener('pointerup', finishGesture);
    document.addEventListener('pointercancel', () => {
      if (!gesture) return;
      gesture.element.classList.remove('is-dragging');
      gesture = null;
      renderCalendar();
    });

    canvas.addEventListener('click', event => {
      if (!suppressEventClick || !event.target.closest('[data-calendar-event]')) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      suppressEventClick = false;
    }, true);
  }

  function initCalendarControls() {
    $('#calPrev')?.addEventListener('click', () => shiftCalendar(-1));
    $('#calNext')?.addEventListener('click', () => shiftCalendar(1));
    $('#miniPrev')?.addEventListener('click', () => shiftCalendar(-1));
    $('#miniNext')?.addEventListener('click', () => shiftCalendar(1));

    $('#calToday')?.addEventListener('click', () => {
      state.calendarDate = new Date();
      renderCalendar();
    });

    $('#calAddEvent')?.addEventListener('click', () => {
      openModal(null, { date: dateKey(state.calendarDate) });
    });

    $('#calSideCreate')?.addEventListener('click', () => {
      openModal(null, { date: dateKey(state.calendarDate) });
    });

    $$('[data-cal-view]').forEach(button => {
      button.addEventListener('click', () => {
        const view = button.dataset.calView;
        if (!['day', 'week', 'month'].includes(view)) return;
        state.calendarView = view;
        renderCalendar();
      });
    });
  }

  
function initAssistant() {
  const input = $('#assistantInput');
  const orb = $('#assistantOrb');

  $('#assistantSend')?.addEventListener('click', sendAssistantMessage);

  input?.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      sendAssistantMessage();
    }
  });

  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  let recognition = null;
  let isListening = false;

  function startVoiceInput() {
    if (!SpeechRecognition) {
      toast('Voice recognition is not supported in this browser. Try Chrome.');
      return;
    }

    if (isListening && recognition) {
      recognition.stop();
      return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => {
      isListening = true;
      setAssistantState('listening', 'Listening...');
    };

    recognition.onresult = event => {
      let transcript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }

      if (input) {
        input.value = transcript;
      }

      const finalResult = event.results[event.results.length - 1];

      if (finalResult.isFinal) {
        input.value = transcript.trim();
        recognition.stop();

        if (input.value) {
          sendAssistantMessage();
        }
      }
    };

    recognition.onerror = event => {
      console.error('Speech recognition error:', event.error);

      if (event.error !== 'no-speech' &&
          event.error !== 'aborted') {
        toast('Voice input error: ' + event.error);
      }
    };

    recognition.onend = () => {
      isListening = false;
      setAssistantState('idle');
    };

    try {
      recognition.start();
    } catch (error) {
      console.error('Could not start voice recognition:', error);
      toast('Could not start microphone. Please try again.');
    }
  }

  orb?.addEventListener('click', startVoiceInput);

  // Keep the existing top microphone shortcut working.
  $('#micBtn')?.addEventListener('click', () => {
    toggleAssistant(true);
    startVoiceInput();
  });
}


  function initQuickActions() {
    $('#quickFocusBtn')?.addEventListener('click', () => {
      const now = new Date();
      const start = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
      openModal(null, {
        type: 'focus',
        date: dateKey(),
        start,
        duration: 25,
        priority: 'high',
      });
    });

    $('#recClose')?.addEventListener('click', () => {
      $('#recommendationCard')?.classList.add('hidden');
    });

    $('#autoScheduleToggle')?.addEventListener('change', event => {
      toast(event.target.checked
        ? 'Auto-schedule preference enabled for this session.'
        : 'Auto-schedule preference disabled.');
    });

    $('#searchInput')?.addEventListener('input', event => {
      const query = event.target.value.trim().toLowerCase();
      const list = $('#dayTimeline');
      if (!list) return;

      if (!query) {
        renderDay();
        return;
      }

      const matches = itemsFor(new Date()).filter(item =>
        item.title.toLowerCase().includes(query) ||
        item.type.toLowerCase().includes(query)
      );

      list.innerHTML = matches.length ? matches.map(item => `
        <li class="timeline-item" data-item-id="${escapeHTML(item.id)}">
          <div class="timeline-time">${time12(item.start)}</div>
          <div class="timeline-track"><span class="timeline-dot"></span></div>
          <div class="timeline-content">
            <div class="event-icon">${typeIcon(item.type)}</div>
            <div class="event-info">
              <div class="event-title">${escapeHTML(item.title)}</div>
              <div class="event-meta">${time12(item.start)} · ${item.duration} min · ${typeLabel(item.type)}</div>
            </div>
            <button type="button" data-edit="${escapeHTML(item.id)}">Edit</button>
          </div>
        </li>
      `).join('') : '<li class="empty-day">No matching tasks found.</li>';
    });
  }

  function initKeyboardControls() {
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        closeModal();
        toggleAssistant(false);
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        $('#searchInput')?.focus();
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        openModal();
      }
    });
  }
function initNotificationControls() {
  const button = document.getElementById('notificationBtn');
  const panel = document.getElementById('notificationPanel');

  if (!button || !panel) {
    console.warn('Notification elements not found.');
    return;
  }

  function closeNotifications() {
    panel.classList.add('hidden');
    button.setAttribute('aria-expanded', 'false');
  }

  button.addEventListener('click', event => {
    event.stopPropagation();

    const isOpen = !panel.classList.contains('hidden');

    panel.classList.toggle('hidden', isOpen);
    button.setAttribute('aria-expanded', String(!isOpen));
  });

  panel.addEventListener('click', event => {
    event.stopPropagation();
  });

  document.addEventListener('click', closeNotifications);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeNotifications();
    }
  });
}

function checkDueReminders() {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  const now = new Date();
  let changed = false;

  state.items.forEach(item => {
    if (!item.isReminder || item.reminderNotified || item.done) return;

    const reminderTime = new Date(`${item.date}T${item.start}:00`);

    if (Number.isNaN(reminderTime.getTime()) || now < reminderTime) return;

    new Notification('Trackler Reminder', {
      body: item.title,
      tag: item.id
    });

    item.reminderNotified = true;
    changed = true;
  });

  if (changed) save();
}

function initReminderNotifications() {
  checkDueReminders();

  setInterval(checkDueReminders, 15000);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      checkDueReminders();
    }
  });

  window.addEventListener('focus', checkDueReminders);
}

function initDashboardClock() {
  const clock = document.getElementById('liveClock');
  const date = document.getElementById('liveDate');

  if (!clock || !date) return;

  function updateClock() {
    const now = new Date();

    clock.textContent = now.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    date.textContent = now.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });
  }

  updateClock();
  setInterval(updateClock, 1000);
}


  function init() {
    if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js')
    .then(() => console.info('TracklerOS service worker registered.'))
    .catch(error => console.error('Service worker registration failed:', error));
}
    load();
    initDashboardClock();
    initThemeControls();
    initNotificationControls();
    initReminderNotifications();
    initNavigation();
    initTaskControls();
    initCalendarControls();
    initCalendarInteractions();
    initAssistant();
    initQuickActions();
    initKeyboardControls();

    renderAll();

    // Set the default page and active navigation item.
    navigate('today');

    console.info('TracklerOS initialized successfully.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
