import { formatTime as appFormatTime } from '../../shared/time.js';
import { init as appInit } from '../auth/index.js';
import { loadOpenPeople as appLoadOpenPeople } from '../attendance/index.js';
import { roleLabel as appRoleLabel } from '../../shared/profile-display.js';
import { setMessage as appSetMessage } from '../../shared/ui/messages.js';
export async function mount(){
const app = await appInit();
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
      time.textContent = `${appFormatTime(person.checked_in_at)} 簽到`;
      badge.className = 'role-badge';
      badge.textContent = appRoleLabel(person.gym_role);
      details.append(name, time);
      row.append(details, badge);
      peopleList.appendChild(row);
    }
  }

  async function loadPeople() {
    refreshButton.disabled = true;
    appSetMessage('正在讀取在場人員……');

    try {
      const people = await appLoadOpenPeople();
      renderPeople(people);
      appSetMessage(
        people.length > 0
          ? `目前共有 ${people.length} 人在場。`
          : '目前沒有已簽到的人員。',
        'success'
      );
    } catch (error) {
      console.error(error);
      appSetMessage(`讀取失敗：${error.message}`, 'error');
    } finally {
      refreshButton.disabled = false;
    }
  }

  refreshButton.addEventListener('click', loadPeople);
  await loadPeople();
}
