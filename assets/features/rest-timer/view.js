export function renderMini(timer) {
    const data=timer.snapshot(); const {pause,reset,start}=timer;
    if (document.body?.dataset.page === 'training') return;
    let mini = document.getElementById('rest-mini');
    if (!mini) {
      mini = document.createElement('aside'); mini.id = 'rest-mini'; mini.className = 'rest-mini';
      mini.setAttribute('aria-label', '組間休息計時器');
      const link = document.createElement('a'); link.href = './training.html';
      const button = document.createElement('button'); button.type = 'button'; button.className = 'secondary-button';
      button.addEventListener('click', () => data.state === 'running' ? pause() : data.state === 'done' ? reset() : start());
      mini.append(link, button); document.body.append(mini);
    }
    const active = data.state !== 'idle'; mini.hidden = !active;
    document.body.classList.toggle('has-rest-mini', active);
    mini.querySelector('a').textContent = data.state === 'done' ? '✓ 休息結束' : `休息 ${data.formatted}${data.state === 'paused' ? ' · 已暫停' : ''}`;
    mini.querySelector('button').textContent = data.state === 'running' ? '暫停' : data.state === 'done' ? '收起' : '繼續';
  }
