(async function () {
  'use strict';

  const PRESENCE_QUERY_KEY = 'presence_token';
  const PRESENCE_STORAGE_KEY = 'gym-presence-token-v1';
  const PRESENCE_STORAGE_MAX_AGE_MS = 10 * 60 * 1000;
  const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,200}$/;

  function availableStorages() {
    const stores = [];
    for (const name of ['sessionStorage', 'localStorage']) {
      try {
        const store = window[name];
        const testKey = `${PRESENCE_STORAGE_KEY}-test`;
        store.setItem(testKey, '1');
        store.removeItem(testKey);
        stores.push(store);
      } catch {
        // Safari privacy settings can make an individual storage unavailable.
      }
    }
    return stores;
  }

  const tokenStores = availableStorages();

  function clearStoredPresenceToken() {
    for (const store of tokenStores) {
      try {
        store.removeItem(PRESENCE_STORAGE_KEY);
      } catch {
        // Ignore a storage becoming unavailable during the session.
      }
    }
  }

  function storePresenceToken(token) {
    const value = JSON.stringify({ token, captured_at: Date.now() });
    for (const store of tokenStores) {
      try {
        store.setItem(PRESENCE_STORAGE_KEY, value);
      } catch {
        // One successful storage is enough to survive the OAuth round trip.
      }
    }
  }

  function readStoredPresenceToken() {
    for (const store of tokenStores) {
      try {
        const raw = store.getItem(PRESENCE_STORAGE_KEY);
        if (!raw) continue;
        const value = JSON.parse(raw);
        if (
          TOKEN_PATTERN.test(value?.token || '') &&
          Number.isFinite(value?.captured_at) &&
          Date.now() - value.captured_at <= PRESENCE_STORAGE_MAX_AGE_MS
        ) {
          return value.token;
        }
      } catch {
        // Try the next available storage.
      }
    }
    clearStoredPresenceToken();
    return null;
  }

  function capturePresenceToken() {
    const url = new URL(window.location.href);
    const scannedValue = url.searchParams.get(PRESENCE_QUERY_KEY);

    if (scannedValue !== null) {
      url.searchParams.delete(PRESENCE_QUERY_KEY);
      window.history.replaceState({}, document.title, url.toString());

      if (TOKEN_PATTERN.test(scannedValue)) {
        storePresenceToken(scannedValue);
        return { token: scannedValue, malformed: false };
      }

      clearStoredPresenceToken();
      return { token: null, malformed: true };
    }

    return { token: readStoredPresenceToken(), malformed: false };
  }

  const capturedPresence = capturePresenceToken();
  let presenceToken = capturedPresence.token;

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
  const presenceCard = document.getElementById('presence-card');
  const presenceStatus = document.getElementById('presence-status');
  const presenceDetail = document.getElementById('presence-detail');

  let openPeople = [];
  let currentAttendance = null;
  let pageBusy = false;
  let presenceState = {
    valid: false,
    kind: capturedPresence.malformed ? 'invalid' : presenceToken ? 'checking' : 'missing',
    message: capturedPresence.malformed
      ? '這個連結的現場認證碼格式不正確。'
      : presenceToken
        ? '正在確認現場 QR Code……'
        : '簽到前請在現場感應裝置並掃描 QR Code。',
    expiresAt: null
  };

  function updateActionAvailability() {
    checkInButton.disabled = pageBusy || !presenceState.valid;
    checkOutButton.disabled = pageBusy;
    refreshButton.disabled = pageBusy;
    logoutButton.disabled = pageBusy;
    for (const radio of document.querySelectorAll('input[name="gym-role"]')) {
      radio.disabled = pageBusy;
    }
  }

  function renderPresenceState() {
    if (currentAttendance) {
      presenceCard.dataset.state = 'checkout';
      presenceStatus.textContent = '簽退不需要現場 QR Code';
      presenceDetail.textContent = presenceToken
        ? '已讀取 QR 連結；你目前已簽到，可直接完成簽退。'
        : '你目前已簽到，可直接完成簽退。';
      updateActionAvailability();
      return;
    }

    if (presenceState.valid && presenceState.expiresAt) {
      const seconds = Math.max(
        0,
        Math.ceil((presenceState.expiresAt - Date.now()) / 1000)
      );

      if (seconds <= 0) {
        presenceState = {
          valid: false,
          kind: 'expired',
          message: '這個 QR Code 已過期，請在現場重新感應並掃描。',
          expiresAt: presenceState.expiresAt
        };
      } else {
        presenceCard.dataset.state = 'valid';
        presenceStatus.textContent = '現場認證有效';
        presenceDetail.textContent = `請在 ${seconds} 秒內完成簽到；同一 QR Code 在有效時間內可供多人使用。`;
        updateActionAvailability();
        return;
      }
    }

    presenceCard.dataset.state = presenceState.kind;
    presenceStatus.textContent = presenceState.kind === 'checking'
      ? '正在確認現場 QR Code'
      : presenceState.kind === 'expired'
        ? 'QR Code 已過期'
        : presenceState.kind === 'invalid'
          ? 'QR Code 無效'
          : '尚未取得現場認證';
    presenceDetail.textContent = presenceState.message;
    updateActionAvailability();
  }

  async function validatePresenceToken() {
    if (!presenceToken) {
      presenceState = {
        valid: false,
        kind: capturedPresence.malformed ? 'invalid' : 'missing',
        message: capturedPresence.malformed
          ? '這個連結的現場認證碼格式不正確。'
          : '簽到前請在現場感應裝置並掃描 QR Code。',
        expiresAt: null
      };
      renderPresenceState();
      return;
    }

    presenceState = {
      valid: false,
      kind: 'checking',
      message: '正在向伺服器確認現場 QR Code……',
      expiresAt: null
    };
    renderPresenceState();

    const { data, error } = await app.client.rpc('presence_token_status', {
      presence_token: presenceToken
    });

    if (error) {
      presenceState = {
        valid: false,
        kind: 'invalid',
        message: `無法驗證現場 QR Code：${error.message}`,
        expiresAt: null
      };
      renderPresenceState();
      return;
    }

    const result = Array.isArray(data) ? data[0] : data;
    const expiresAt = result?.expires_at
      ? new Date(result.expires_at).getTime()
      : null;
    const valid = Boolean(result?.is_valid) && Number.isFinite(expiresAt);

    presenceState = {
      valid,
      kind: valid ? 'valid' : expiresAt && expiresAt <= Date.now()
        ? 'expired'
        : 'invalid',
      message: result?.message || '現場認證碼無效。',
      expiresAt
    };

    if (!valid) clearStoredPresenceToken();
    renderPresenceState();
  }

  window.setInterval(() => {
    if (!currentAttendance && presenceState.valid) renderPresenceState();
  }, 1000);

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
    if (presenceToken) await validatePresenceToken();
    else renderPresenceState();
    const requiresLogin = new URLSearchParams(window.location.search)
      .get('login') === 'required';
    GymApp.setMessage(
      requiresLogin
        ? '請先使用 Google 帳號登入。'
        : presenceState.valid
          ? '已讀取現場 QR Code，請登入後完成簽到。'
          : presenceToken
            ? '這個現場 QR Code 已無法用於簽到；仍可登入使用其他功能。'
          : '請先登入；簽到時另需掃描現場 QR Code。'
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
    updateActionAvailability();
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
    renderPresenceState();
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

      if (!currentAttendance) await validatePresenceToken();
      renderState();
      const defaultMessage = currentAttendance
        ? '簽到狀態已同步；簽退不需要現場 QR Code。'
        : presenceState.valid
          ? '現場認證有效，請選擇身分並完成簽到。'
          : '簽到狀態已同步；簽到前請掃描現場 QR Code。';
      GymApp.setMessage(successMessage || defaultMessage, 'success');
    } catch (error) {
      console.error(error);
      GymApp.setMessage(`讀取資料失敗：${error.message}`, 'error');
    } finally {
      setBusy(false);
      renderPresenceState();
    }
  }

  async function showDailyStamp(kind, data) {
    try {
      await window.FootprintsUI.present(kind, app, data);
      if (kind === 'in') await window.MonthlyCards.afterCheckIn(app, data);
    } catch (error) {
      // A local add-on must never turn a successful attendance operation into failure.
      console.warn('Local stamp view unavailable', error);
      GymApp.setMessage('簽到／簽退已成功，但本機集章畫面未能開啟。', 'error');
    }
  }

  checkInButton.addEventListener('click', async () => {
    if (pageBusy) return;
    if (!presenceState.valid || !presenceToken) {
      GymApp.setMessage('請先在現場感應裝置並掃描有效的 QR Code。', 'error');
      return;
    }

    const selectedRole = document.querySelector(
      'input[name="gym-role"]:checked'
    ).value;
    setBusy(true);
    GymApp.setMessage('正在驗證現場 QR Code 並簽到……');

    const { data, error } = await app.client.rpc('gym_check_in_with_presence', {
      presence_token: presenceToken,
      requested_role: selectedRole
    });

    if (error) {
      GymApp.setMessage(`簽到失敗：${error.message}`, 'error');
      await validatePresenceToken();
      setBusy(false);
      return;
    }

    presenceToken = null;
    clearStoredPresenceToken();
    // Save from the successful RPC response, never from button clicks or page views.
    await showDailyStamp('in', data);
    await loadState('現場認證成功，簽到完成。');
  });

  checkOutButton.addEventListener('click', async () => {
    if (pageBusy || !currentAttendance) return;
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

    const { data, error } = await app.client.rpc('gym_check_out', {
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

    presenceToken = null;
    clearStoredPresenceToken();
    presenceState = {
      valid: false,
      kind: 'missing',
      message: '下次簽到時，請重新掃描現場 QR Code。',
      expiresAt: null
    };
    document.getElementById('trash-check').checked = false;
    document.getElementById('ac-lights-check').checked = false;
    document.getElementById('dehumidifier-check').checked = false;
    transferUser.value = '';
    await showDailyStamp('out', data);
    await loadState('簽退成功。下次簽到請重新掃描現場 QR Code。');
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

  app.client.auth.onAuthStateChange((_event, session) => {
    if (session?.user?.id !== app.session.user.id) {
      document.getElementById('stamp-dialog')?.close();
      window.location.replace('./index.html');
    }
  });

  transferUser.addEventListener('change', updateEquipmentState);
  refreshButton.addEventListener('click', () => loadState());

  await loadState();
})();
