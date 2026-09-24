(async function () {
  'use strict';

  const app = await GymApp.init();
  if (!app) return;

  const peopleList = document.getElementById('people-list');
  const emptyPeople = document.getElementById('empty-people');
  const refreshButton = document.getElementById('refresh-button');

  function renderPeople(people) {
    peopleList.replaceChildren();
    emptyPeople.classList.toggle('hidden', people.length > 0);

    for (const person of people) {
      const row = document.createElement('li');
      const details = document.createElement('div');
      const name = document.createElement('strong');
      const time = document.createElement('span');
      const badge = document.createElement('div');

      row.className = 'person-row';
      name.textContent = person.profile.display_name;
      time.textContent = `${GymApp.formatTime(person.checked_in_at)} 簽到`;
      badge.className = 'role-badge';
      badge.textContent = GymApp.roleLabel(person.gym_role);
      details.append(name, time);
      row.append(details, badge);
      peopleList.appendChild(row);
    }
  }

  async function loadPeople() {
    refreshButton.disabled = true;
    GymApp.setMessage('正在讀取在場人員……');

    try {
      const people = await GymApp.loadOpenPeople();
      renderPeople(people);
      GymApp.setMessage(
        people.length > 0
          ? `目前共有 ${people.length} 人在場。`
          : '目前沒有已簽到的人員。',
        'success'
      );
    } catch (error) {
      console.error(error);
      GymApp.setMessage(`讀取失敗：${error.message}`, 'error');
    } finally {
      refreshButton.disabled = false;
    }
  }

  refreshButton.addEventListener('click', loadPeople);
  await loadPeople();
})();
