(async function () {
  'use strict';

  const app = await GymApp.init({ requireAuth: false });
  if (!app) return;

  const signedOutCard = document.getElementById('signed-out-card');
  const signedInContent = document.getElementById('signed-in-content');
  const loginButton = document.getElementById('login-button');
  const logoutButton = document.getElementById('home-logout-button');

  if (!app.session) {
    signedOutCard.classList.remove('hidden');
    signedInContent.classList.add('hidden');

    const requiresLogin = new URLSearchParams(window.location.search)
      .get('login') === 'required';
    GymApp.setMessage(
      requiresLogin ? '請先使用 Google 帳號登入。' : '尚未登入'
    );
  } else {
    const returnTarget = GymApp.consumeReturnTarget();
    if (returnTarget && returnTarget !== 'index.html') {
      window.location.replace(`./${returnTarget}`);
      return;
    }

    signedOutCard.classList.add('hidden');
    signedInContent.classList.remove('hidden');

    document.getElementById('home-name').textContent =
      GymApp.profileName(app.profile, app.session);
    document.getElementById('home-email').textContent =
      app.session.user.email || '無 Email';
    document.getElementById('home-avatar').src =
      GymApp.profileAvatar(app.profile, app.session);

    try {
      const { data: attendance, error } = await app.client
        .from('attendance_sessions')
        .select('gym_role, checked_in_at')
        .eq('user_id', app.session.user.id)
        .is('checked_out_at', null)
        .maybeSingle();

      if (error) throw error;

      document.getElementById('home-attendance-state').textContent = attendance
        ? `目前已簽到｜${GymApp.roleLabel(attendance.gym_role)}｜` +
          `${GymApp.formatTime(attendance.checked_in_at)}`
        : '目前尚未簽到';
      GymApp.setMessage('登入成功，請選擇功能。', 'success');
    } catch (error) {
      console.error(error);
      GymApp.setMessage(`讀取簽到狀態失敗：${error.message}`, 'error');
    }
  }

  loginButton.addEventListener('click', async () => {
    loginButton.disabled = true;
    try {
      await GymApp.signInWithGoogle();
    } catch {
      loginButton.disabled = false;
    }
  });

  logoutButton.addEventListener('click', async () => {
    logoutButton.disabled = true;
    try {
      await GymApp.signOut();
    } catch (error) {
      GymApp.setMessage(`登出失敗：${error.message}`, 'error');
      logoutButton.disabled = false;
    }
  });
})();
