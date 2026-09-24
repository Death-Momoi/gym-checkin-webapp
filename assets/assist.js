(async function () {
  'use strict';

  const app = await GymApp.init();
  if (!app) return;

  const assistList = document.getElementById('assist-list');
  const emptyAssist = document.getElementById('empty-assist');
  const refreshButton = document.getElementById('refresh-button');
  let openPeople = [];

  function setBusy(isBusy) {
    refreshButton.disabled = isBusy;
    for (const button of assistList.querySelectorAll('[data-assist-user-id]')) {
      button.disabled = isBusy;
    }
  }

  function renderPeople() {
    assistList.replaceChildren();
    const otherPeople = openPeople.filter(
      person => person.user_id !== app.session.user.id
    );
    emptyAssist.classList.toggle('hidden', otherPeople.length > 0);

    for (const person of otherPeople) {
      const row = document.createElement('li');
      const details = document.createElement('div');
      const name = document.createElement('strong');
      const time = document.createElement('span');
      const actions = document.createElement('div');
      const badge = document.createElement('div');

      row.className = 'person-row';
      actions.className = 'row-actions';
      name.textContent = person.profile.display_name;
      time.textContent = `${GymApp.formatTime(person.checked_in_at)} 簽到`;
      badge.className = 'role-badge';
      badge.textContent = GymApp.roleLabel(person.gym_role);
      details.append(name, time);
      actions.appendChild(badge);

      if (person.gym_role === 'primary') {
        const locked = document.createElement('div');
        locked.className = 'locked-label';
        locked.textContent = '需本人簽退';
        actions.appendChild(locked);
      } else {
        const button = document.createElement('button');
        button.className = 'assist-button';
        button.type = 'button';
        button.dataset.assistUserId = person.user_id;
        button.textContent = '協助簽退';
        actions.appendChild(button);
      }

      row.append(details, actions);
      assistList.appendChild(row);
    }
  }

  async function loadPeople(successMessage = '') {
    setBusy(true);
    GymApp.setMessage('正在讀取可協助簽退的人員……');

    try {
      openPeople = await GymApp.loadOpenPeople();
      renderPeople();
      GymApp.setMessage(successMessage || '名單已同步。', 'success');
    } catch (error) {
      console.error(error);
      GymApp.setMessage(`讀取失敗：${error.message}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  assistList.addEventListener('click', async event => {
    const button = event.target.closest('[data-assist-user-id]');
    if (!button) return;

    const target = openPeople.find(
      person => person.user_id === button.dataset.assistUserId
    );
    if (!target) {
      GymApp.setMessage('找不到最新簽到狀態，請重新整理。', 'error');
      return;
    }

    if (!window.confirm(`確定要協助「${target.profile.display_name}」簽退嗎？`)) {
      return;
    }

    setBusy(true);
    GymApp.setMessage(`正在協助「${target.profile.display_name}」簽退……`);

    const { error } = await app.client.rpc('gym_assist_check_out', {
      target_user_id: target.user_id
    });

    if (error) {
      GymApp.setMessage(`協助簽退失敗：${error.message}`, 'error');
      setBusy(false);
      return;
    }

    await loadPeople(`已協助「${target.profile.display_name}」完成簽退。`);
  });

  refreshButton.addEventListener('click', () => loadPeople());
  await loadPeople();
})();
