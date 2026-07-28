// Trackler dashboard - basic interactivity

document.addEventListener('DOMContentLoaded', () => {

  // Toggle task checkboxes -> strike-through + update stats
  document.querySelectorAll('.task-item input[type=checkbox]').forEach(cb => {
    cb.addEventListener('change', (e) => {
      e.target.closest('.task-item').classList.toggle('done', e.target.checked);
    });
  });

  // Focus mode play/pause (simple countdown demo)
  const playBtn = document.querySelector('.focus-btn.play');
  const focusTime = document.querySelector('.focus-time');
  const focusCaption = document.querySelector('.focus-caption');
  let timer = null;
  let seconds = 25 * 60;
  let running = false;

  function formatTime(s){
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

  // Reset button
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

  // Quick action / chip buttons - simple visual feedback (no-op actions)
  document.querySelectorAll('.qa-btn, .chip, .shortcut-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.style.opacity = '0.6';
      setTimeout(() => (btn.style.opacity = '1'), 150);
    });
  });

  // AI Assistant send
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
