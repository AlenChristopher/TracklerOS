
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
        <div class="timeline-content">
          <button class="task-check" type="button" data-toggle="${escapeHTML(item.id)}" aria-label="Mark ${escapeHTML(item.title)} complete">${typeIcon(item.type)}</button>
          <div class="event-icon">${typeIcon(item.type)}</div>
          <div class="event-info">
            <div class="event-title">${escapeHTML(item.title)}</div>
            <div class="event-meta">${time12(item.start)} · ${item.duration} min · ${typeLabel(item.type)}</div>
          </div>
          <span class="event-tag ${priorityClass(item.priority)}">${escapeHTML(item.priority)}</span>
          <button class="task-edit" type="button" data-edit="${escapeHTML(item.id)}" aria-label="Edit task">⋯</button>
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
        <div><div class="upcoming-event">${escapeHTML(item.title)}</div><div class="upcoming-type">${typeLabel(item.type)}</div></div>
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
    item.done = !item.done;
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

  function renderDayCalendar() {
    const canvas = $('#calendarCanvas');
    if (!canvas) return;
    const day = state.calendarDate;
    const events = itemsFor(day);
    const hours = Array.from({ length: 17 }, (_, i) => i + 6);
    canvas.innerHTML = `
      <div class="cal-day-header">
        <div></div>
        <div class="cal-day-name selected">${new Intl.DateTimeFormat('en', { weekday: 'long' }).format(day)}<strong>${day.getDate()}</strong></div>
      </div>
      <div class="cal-time-grid">
        <div class="cal-time-labels">${hours.map(h => `<div class="cal-time-label">${new Date(2000,0,1,h).toLocaleTimeString('en',{hour:'numeric'}).replace(':00','')}</div>`).join('')}</div>
        <div class="cal-day-column">${hours.map(h => `<div class="cal-time-column" data-hour="${h}"></div>`).join('')}
          ${events.map(item => {
            const top = (mins(item.start) - 360) / 60 * 58;
            const height = Math.max(28, item.duration / 60 * 58);
            return `<button type="button" class="cal-event ${item.type}" data-calendar-edit="${escapeHTML(item.id)}" style="top:${top}px;height:${height}px"><strong>${escapeHTML(item.title)}</strong><small>${time12(item.start)} · ${item.duration} min</small></button>`;
          }).join('')}
        </div>
      </div>`;
    const col = $('.cal-day-column', canvas);
    col?.addEventListener('click', event => {
      if (event.target.closest('[data-calendar-edit]')) return;
      const rect = col.getBoundingClientRect();
      const hour = Math.max(6, Math.min(22, 6 + Math.floor((event.clientY - rect.top) / 58)));
      openModal(null, { date: dateKey(day), start: `${pad(hour)}:00` });
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
          ${days.map(day => `<div class="${sameDate(day,new Date()) ? 'selected' : ''}">${new Intl.DateTimeFormat('en',{weekday:'short'}).format(day)}<strong>${day.getDate()}</strong></div>`).join('')}
        </div>
        <div class="cal-week-grid">
          <div>${hours.map(h => `<div class="cal-time-label">${new Date(2000,0,1,h).toLocaleTimeString('en',{hour:'numeric'}).replace(':00','')}</div>`).join('')}</div>
          ${days.map(day => `<div class="cal-week-day" data-week-date="${dateKey(day)}">
            ${hours.map(() => '<div class="cal-week-hour"></div>').join('')}
            ${itemsFor(day).map(item => {
              const top = (mins(item.start) - 360) / 60 * 58;
              const height = Math.max(28, item.duration / 60 * 58);
              return `<button type="button" class="cal-event ${item.type}" data-calendar-edit="${escapeHTML(item.id)}" style="top:${top}px;height:${height}px"><strong>${escapeHTML(item.title)}</strong><small>${time12(item.start)}</small></button>`;
            }).join('')}
          </div>`).join('')}
        </div>
      </div>`;
    $$('[data-week-date]', canvas).forEach(col => {
      col.addEventListener('click', event => {
        if (event.target.closest('[data-calendar-edit]')) return;
        const rect = col.getBoundingClientRect();
        const hour = Math.max(6, Math.min(22, 6 + Math.floor((event.clientY - rect.top) / 58)));
        openModal(null, { date: col.dataset.weekDate, start: `${pad(hour)}:00` });
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
          ${list.slice(0, 3).map(item => `<div class="cal-month-event ${item.type}" data-calendar-edit="${escapeHTML(item.id)}">${escapeHTML(item.title)}</div>`).join('')}
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
    if (!panel) return;
    state.assistantOpen = typeof force === 'boolean' ? force : !state.assistantOpen;
    panel.classList.toggle('assistant-open', state.assistantOpen);
    if (window.innerWidth <= 1250) {
      panel.style.display = state.assistantOpen ? 'flex' : 'none';
    }
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

  function sendAssistantMessage() {
    const input = $('#assistantInput');
    if (!input || !input.value.trim()) return;
    const message = input.value.trim();
    input.value = '';
    setAssistantState('thinking');
    const statusSub = $('#assistantStatusSub');
    if (statusSub) statusSub.textContent = `You said: “${message}”`;
    setTimeout(() => {
      setAssistantState('speaking', 'Assistant demo');
      if (statusSub) statusSub.textContent = 'Live AI connection has not been configured yet.';
      setTimeout(() => setAssistantState('idle'), 1800);
    }, 650);
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

    $('#navAssistant')?.addEventListener('click', () => toggleAssistant());

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
    $('#assistantSend')?.addEventListener('click', sendAssistantMessage);

    $('#assistantInput')?.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        sendAssistantMessage();
      }
    });

    $('#micBtn')?.addEventListener('click', () => {
      setAssistantState('listening', 'Voice input');
      toast('Voice input is not connected yet.');
      setTimeout(() => setAssistantState('idle'), 1800);
      toggleAssistant(true);
    });

    $('#assistantOrb')?.addEventListener('click', () => {
      setAssistantState('listening');
      setTimeout(() => setAssistantState('idle'), 1800);
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

  function init() {
    load();
    initThemeControls();
    initNavigation();
    initTaskControls();
    initCalendarControls();
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
