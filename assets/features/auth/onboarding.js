import { confirmName } from '../profiles/index.js';
import { profileName } from '../../shared/profile-display.js';
export function mountNameForm(){if(!document.getElementById('name-onboarding-overlay'))document.body.insertAdjacentHTML('beforeend',`      <div id="name-onboarding-overlay" class="name-onboarding-overlay hidden"
        role="dialog" aria-modal="true" aria-labelledby="name-onboarding-title"
        aria-describedby="name-onboarding-description">
        <form id="name-onboarding-form" class="name-onboarding-card" novalidate>
          <div class="name-onboarding-icon" aria-hidden="true">👤</div>
          <h2 id="name-onboarding-title">首次登入姓名設定</h2>
          <p id="name-onboarding-description">
            請輸入方便辨識的真實姓名。今後的簽到、簽退、借用紀錄與問題回報都會顯示這個姓名。
          </p>
          <label for="name-onboarding-input">姓名</label>
          <input id="name-onboarding-input" type="text" minlength="2" maxlength="80"
            autocomplete="name" placeholder="例如：王小明" required>
          <p id="name-onboarding-status" class="name-onboarding-status"
            aria-live="polite">每個 Google 帳號只需設定一次。</p>
          <div class="name-onboarding-actions">
            <button id="name-onboarding-save" class="primary-button" type="submit">
              儲存姓名並繼續
            </button>
            <button id="name-onboarding-signout" class="secondary-button" type="button">
              登出並切換帳號
            </button>
          </div>
        </form>
      </div>
`)}
export function ensureConfirmedName(session, profile, signOut) {
    if (!session || profile?.name_confirmed) return Promise.resolve(profile);

    const overlay = document.getElementById('name-onboarding-overlay');
    const form = document.getElementById('name-onboarding-form');
    const input = document.getElementById('name-onboarding-input');
    const status = document.getElementById('name-onboarding-status');
    const saveButton = document.getElementById('name-onboarding-save');
    const signoutButton = document.getElementById('name-onboarding-signout');

    if (!overlay || !form || !input || !status || !saveButton || !signoutButton) {
      return Promise.reject(new Error('姓名設定視窗初始化失敗'));
    }

    const suggestedName = profile?.display_name || profileName(profile, session);
    input.value = suggestedName === '未命名使用者' ? '' : suggestedName;
    status.textContent = '每個 Google 帳號只需設定一次。';
    status.className = 'name-onboarding-status';
    overlay.classList.remove('hidden');
    document.body.classList.add('name-onboarding-open');

    function setBusy(isBusy) {
      input.disabled = isBusy;
      saveButton.disabled = isBusy;
      signoutButton.disabled = isBusy;
      saveButton.textContent = isBusy ? '儲存中……' : '儲存姓名並繼續';
    }

    function cleanUp() {
      form.onsubmit = null;
      signoutButton.onclick = null;
      overlay.classList.add('hidden');
      document.body.classList.remove('name-onboarding-open');
    }

    setTimeout(() => {
      input.focus();
      input.select();
    }, 0);

    return new Promise(resolve => {
      form.onsubmit = async event => {
        event.preventDefault();
        const confirmedName = input.value.trim().replace(/\s+/g, ' ');

        if (confirmedName.length < 2 || confirmedName.length > 80) {
          status.textContent = '請輸入 2 至 80 個字元的姓名。';
          status.className = 'name-onboarding-status error';
          input.focus();
          return;
        }

        setBusy(true);
        status.textContent = '正在將姓名綁定到這個 Google 帳號……';
        status.className = 'name-onboarding-status';

        const { data, error } = await confirmName(confirmedName);

        if (error) {
          status.textContent = `儲存失敗：${error.message}`;
          status.className = 'name-onboarding-status error';
          setBusy(false);
          input.focus();
          return;
        }

        const updatedProfile = Array.isArray(data) ? data[0] : data;
        const confirmedProfile = {
          ...profile,
          ...updatedProfile,
          display_name: updatedProfile?.display_name || confirmedName,
          name_confirmed: true
        };
        cleanUp();
        resolve(confirmedProfile);
      };

      signoutButton.onclick = async () => {
        setBusy(true);
        status.textContent = '正在登出……';
        status.className = 'name-onboarding-status';
        try {
          await signOut();
        } catch (error) {
          status.textContent = `登出失敗：${error.message}`;
          status.className = 'name-onboarding-status error';
          setBusy(false);
        }
      };
    });
  }
