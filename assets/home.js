(async function () {
  'use strict';

  const app = await GymApp.init({ requireAuth: false });
  if (!app) return;

  const signedOutCard = document.getElementById('signed-out-card');
  const signedInContent = document.getElementById('signed-in-content');
  const loginButton = document.getElementById('login-button');
  const logoutButton = document.getElementById('home-logout-button');
  const attendanceState = document.getElementById('attendance-state');
  const checkInControls = document.getElementById('check-in-controls');
  const checkOutControls = document.getElementById('check-out-controls');
  const primaryCheckoutControls = document.getElementById('primary-checkout-controls');
  const transferUser = document.getElementById('transfer-user');
  const equipmentChecks = document.getElementById('equipment-checks');
  const checkInButton = document.getElementById('check-in-button');
  const checkOutButton = document.getElementById('check-out-button');
  const refreshButton = document.getElementById('refresh-button');

  let openPeople = [];
  let currentAttendance = null;
  let pageBusy = false;

  loginButton.addEventListener('click', async () => {
    loginButton.disabled = true;
    try {
      await GymApp.signInWithGoogle();
    } catch {
      loginButton.disabled = false;
    }
  });

  if (!app.session) {
    signedOutCard.classList.remove('hidden');
    signedInContent.classList.add('hidden');
    const requiresLogin = new URLSearchParams(window.location.search)
      .get('login') === 'required';
    GymApp.setMessage(
      requiresLogin ? '請先使用 Google 帳號登入。' : '請先登入後再進行簽到。'
    );
    return;
  }

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

  function updateEquipmentState() {
    const isTransferring = Boolean(transferUser.value);
    equipmentChecks.style.opacity = isTransferring ? '0.45' : '1';
    transferUser.disabled = pageBusy;

    for (const checkbox of equipmentChecks.querySelectorAll('input')) {
      checkbox.disabled = pageBusy || isTransferring;
    }
  }

  function setBusy(isBusy) {
    pageBusy = isBusy;
    checkInButton.disabled = isBusy;
    checkOutButton.disabled = isBusy;
    refreshButton.disabled = isBusy;
    logoutButton.disabled = isBusy;
    for (const radio of document.querySelectorAll('input[name="gym-role"]')) {
      radio.disabled = isBusy;
    }
    updateEquipmentState();
  }

  function renderTransferOptions() {
    const previousValue = transferUser.value;
    transferUser.replaceChildren();

    const noTransfer = document.createElement('option');
    noTransfer.value = '';
    noTransfer.textContent = '不交接，由我完成設備檢查';
    transferUser.appendChild(noTransfer);

    for (const person of openPeople) {
      if (person.user_id === app.session.user.id) continue;
      const option = document.createElement('option');
      option.value = person.user_id;
      option.textContent =
        `${person.profile.display_name}（${GymApp.roleLabel(person.gym_role)}）`;
      transferUser.appendChild(option);
    }

    if ([...transferUser.options].some(option => option.value === previousValue)) {
      transferUser.value = previousValue;
    }
  }

  function renderState() {
    checkInControls.classList.toggle('hidden', Boolean(currentAttendance));
    checkOutControls.classList.toggle('hidden', !currentAttendance);

    attendanceState.textContent = currentAttendance
      ? `目前已簽到｜${GymApp.roleLabel(currentAttendance.gym_role)}｜` +
        `${GymApp.formatTime(currentAttendance.checked_in_at)}`
      : '目前尚未簽到';

    const isPrimary = currentAttendance?.gym_role === 'primary';
    primaryCheckoutControls.classList.toggle('hidden', !isPrimary);
    renderTransferOptions();
    updateEquipmentState();
  }

  async function loadState(successMessage = '') {
    setBusy(true);
    GymApp.setMessage('正在同步簽到狀態……');

    try {
      openPeople = await GymApp.loadOpenPeople();
      currentAttendance = openPeople.find(
        person => person.user_id === app.session.user.id
      ) || null;
      renderState();
      GymApp.setMessage(successMessage || '簽到狀態已同步。', 'success');
    } catch (error) {
      console.error(error);
      GymApp.setMessage(`讀取資料失敗：${error.message}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  checkInButton.addEventListener('click', async () => {
    const selectedRole = document.querySelector(
      'input[name="gym-role"]:checked'
    ).value;
    setBusy(true);
    GymApp.setMessage('正在簽到……');

    const { error } = await app.client.rpc('gym_check_in', {
      requested_role: selectedRole
    });

    if (error) {
      GymApp.setMessage(`簽到失敗：${error.message}`, 'error');
      setBusy(false);
      return;
    }

    await loadState('簽到成功。');
  });

  checkOutButton.addEventListener('click', async () => {
    const isPrimary = currentAttendance?.gym_role === 'primary';
    const transferTo = isPrimary && transferUser.value
      ? transferUser.value
      : null;
    const trashChecked = document.getElementById('trash-check').checked;
    const acLightsChecked = document.getElementById('ac-lights-check').checked;
    const dehumidifierChecked = document.getElementById('dehumidifier-check').checked;

    if (
      isPrimary &&
      !transferTo &&
      !(trashChecked && acLightsChecked && dehumidifierChecked)
    ) {
      GymApp.setMessage(
        '主要借用者必須完成三項設備檢查，或選擇責任交接。',
        'error'
      );
      return;
    }

    setBusy(true);
    GymApp.setMessage('正在簽退……');

    const { error } = await app.client.rpc('gym_check_out', {
      transfer_to_user_id: transferTo,
      trash_is_checked: trashChecked,
      ac_lights_are_checked: acLightsChecked,
      dehumidifier_is_checked: dehumidifierChecked
    });

    if (error) {
      GymApp.setMessage(`簽退失敗：${error.message}`, 'error');
      setBusy(false);
      return;
    }

    document.getElementById('trash-check').checked = false;
    document.getElementById('ac-lights-check').checked = false;
    document.getElementById('dehumidifier-check').checked = false;
    transferUser.value = '';
    await loadState('簽退成功。');
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

  transferUser.addEventListener('change', updateEquipmentState);
  refreshButton.addEventListener('click', () => loadState());
  await loadState('登入成功，請進行簽到或簽退。');
})();
