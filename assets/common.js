(function () {
  'use strict';

  const SUPABASE_URL = 'https://rihibyswtlqsyljarerr.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY =
    'sb_publishable_gS2aS6imvz3_AH9ZgmJXtg_gAXd-wYO';
  const REDIRECT_URL = 'https://death-momoi.github.io/gym-checkin-webapp/';
  const RETURN_TO_KEY = 'gym-checkin-return-to';
  const FALLBACK_AVATAR =
    'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80">' +
      '<rect width="100%" height="100%" fill="#1f2937"/>' +
      '<text x="50%" y="56%" text-anchor="middle" fill="#67e8f9" font-size="32">👤</text>' +
      '</svg>'
    );

  const NAV_ITEMS = [
    { key: 'home', href: 'index.html', icon: '✓', label: '簽到／簽退' },
    {
      key: 'borrowing',
      icon: '▤',
      label: '借用狀態',
      children: [
        { key: 'overview', href: 'overview.html', icon: '▥', label: '總覽圖表' },
        { key: 'present', href: 'present.html', icon: '●', label: '目前在場' },
        { key: 'calendar', href: 'calendar.html', icon: '▦', label: '預約月曆' },
        { key: 'history', href: 'history.html', icon: '≡', label: '簽到紀錄' }
      ]
    },
    { key: 'assist', href: 'assist.html', icon: '↪', label: '協助簽退' },
    { key: 'foodwheel', href: 'foodwheel.html', icon: '◉', label: '美食轉盤' },
    { key: 'report', href: 'report.html', icon: '!', label: '問題回報' },
    { key: 'guide', href: 'guide.html', icon: '?', label: '系統使用說明' },
    {
      key: 'admin',
      href: 'admin.html',
      icon: '⚙',
      label: '問題回報管理',
      adminOnly: true
    }
  ];

  let client = null;
  let currentSession = null;
  let currentProfile = null;
  let authSubscription = null;
  let sessionRefreshPromise = null;

  function pageFileName() {
    const name = window.location.pathname.split('/').pop();
    return name || 'index.html';
  }

  function mountShell() {
    if (document.getElementById('side-drawer')) return;

    const activePage = document.body.dataset.page || 'home';
    const pageTitle = document.body.dataset.title || '首頁';
    const navigation = NAV_ITEMS.map(item => {
      if (Array.isArray(item.children)) {
        const groupIsActive = item.children.some(child => child.key === activePage);
        const children = item.children.map(child => `
          <li>
            <a href="./${child.href}" data-nav-key="${child.key}"
              ${child.key === activePage ? 'aria-current="page"' : ''}>
              <span class="nav-icon" aria-hidden="true">${child.icon}</span>
              <span>${child.label}</span>
            </a>
          </li>
        `).join('');

        return `
          <li class="drawer-nav-group${groupIsActive ? ' active' : ''}">
            <button class="drawer-submenu-toggle" type="button"
              data-submenu-toggle="${item.key}"
              aria-controls="drawer-subnav-${item.key}"
              aria-expanded="${String(groupIsActive)}">
              <span class="nav-icon" aria-hidden="true">${item.icon}</span>
              <span>${item.label}</span>
              <span class="nav-chevron" aria-hidden="true">›</span>
            </button>
            <ul id="drawer-subnav-${item.key}"
              class="drawer-subnav${groupIsActive ? '' : ' hidden'}">
              ${children}
            </ul>
          </li>
        `;
      }

      return `
        <li${item.adminOnly ? ' class="admin-only hidden"' : ''}>
          <a href="./${item.href}" data-nav-key="${item.key}"
            ${item.key === activePage ? 'aria-current="page"' : ''}>
            <span class="nav-icon" aria-hidden="true">${item.icon}</span>
            <span>${item.label}</span>
          </a>
        </li>
      `;
    }).join('');

    document.body.insertAdjacentHTML('afterbegin', `
      <header class="topbar">
        <button id="menu-button" class="menu-button" type="button"
          aria-label="開啟功能選單" aria-controls="side-drawer" aria-expanded="false">☰</button>
        <div class="topbar-title">
          <span class="site-name">運動科學實驗室簽到系統</span>
          <span class="page-context">｜${pageTitle}</span>
        </div>
        <div id="topbar-user" class="topbar-user hidden">
          <img id="topbar-avatar" alt="使用者頭像">
          <span id="topbar-user-name">—</span>
        </div>
      </header>

      <div id="drawer-overlay" class="drawer-overlay" aria-hidden="true"></div>
      <aside id="side-drawer" class="side-drawer" aria-label="功能選單" aria-hidden="true">
        <div class="drawer-header">
          <div class="drawer-brand">
            <strong>功能選單</strong>
            <span>v1.2 日曆標記與登入修正</span>
          </div>
          <button id="drawer-close-button" class="drawer-close-button"
            type="button" aria-label="關閉功能選單">×</button>
        </div>
        <nav aria-label="主要功能">
          <ul class="drawer-nav">${navigation}</ul>
        </nav>
        <div class="drawer-footer">
          <div class="drawer-legal-links">
            <a href="./privacy.html">隱私權政策</a>
            <a href="./terms.html">服務條款</a>
          </div>
          <button id="drawer-logout-button" class="secondary-button hidden" type="button">
            登出 Google 帳號
          </button>
        </div>
      </aside>
    `);

    const menuButton = document.getElementById('menu-button');
    const closeButton = document.getElementById('drawer-close-button');
    const drawer = document.getElementById('side-drawer');
    const overlay = document.getElementById('drawer-overlay');

    function setDrawerOpen(isOpen) {
      drawer.classList.toggle('open', isOpen);
      overlay.classList.toggle('open', isOpen);
      document.body.classList.toggle('drawer-open', isOpen);
      drawer.setAttribute('aria-hidden', String(!isOpen));
      overlay.setAttribute('aria-hidden', String(!isOpen));
      menuButton.setAttribute('aria-expanded', String(isOpen));

      if (isOpen) closeButton.focus();
      else menuButton.focus();
    }

    menuButton.addEventListener('click', () => setDrawerOpen(true));
    closeButton.addEventListener('click', () => setDrawerOpen(false));
    overlay.addEventListener('click', () => setDrawerOpen(false));
    drawer.addEventListener('click', event => {
      const submenuToggle = event.target.closest('[data-submenu-toggle]');
      if (submenuToggle) {
        const submenu = document.getElementById(
          `drawer-subnav-${submenuToggle.dataset.submenuToggle}`
        );
        const shouldOpen = submenu.classList.contains('hidden');
        submenu.classList.toggle('hidden', !shouldOpen);
        submenuToggle.setAttribute('aria-expanded', String(shouldOpen));
        submenuToggle.closest('.drawer-nav-group')
          ?.classList.toggle('expanded', shouldOpen);
        return;
      }

      if (event.target.closest('a')) setDrawerOpen(false);
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && drawer.classList.contains('open')) {
        setDrawerOpen(false);
      }
    });
  }

  function setMessage(text, type = '') {
    const element = document.getElementById('message');
    if (!element) return;
    element.textContent = text;
    element.className = `message${type ? ` ${type}` : ''}`;
    element.classList.remove('hidden');
  }

  function hideMessage() {
    document.getElementById('message')?.classList.add('hidden');
  }

  function profileName(profile, session) {
    const metadata = session?.user?.user_metadata || {};
    return profile?.display_name || metadata.full_name || metadata.name || '未命名使用者';
  }

  function profileAvatar(profile, session) {
    const metadata = session?.user?.user_metadata || {};
    return profile?.avatar_url || metadata.avatar_url || metadata.picture || FALLBACK_AVATAR;
  }

  function updateAuthShell(session, profile) {
    const userArea = document.getElementById('topbar-user');
    const logoutButton = document.getElementById('drawer-logout-button');
    if (!userArea || !logoutButton) return;

    const signedIn = Boolean(session);
    const isAdmin = signedIn &&
      profile?.app_role === 'admin' &&
      profile?.status === 'active';
    userArea.classList.toggle('hidden', !signedIn);
    logoutButton.classList.toggle('hidden', !signedIn);
    document.querySelectorAll('.admin-only').forEach(element => {
      element.classList.toggle('hidden', !isAdmin);
    });

    if (signedIn) {
      document.getElementById('topbar-user-name').textContent =
        profileName(profile, session);
      document.getElementById('topbar-avatar').src = profileAvatar(profile, session);
    }
  }

  async function fetchProfile(session) {
    if (!session) return null;

    const { data, error } = await client
      .from('profiles')
      .select('id, display_name, avatar_url, status, app_role')
      .eq('id', session.user.id)
      .single();

    if (error) throw error;
    return data;
  }

  function safeReturnTarget(value) {
    return typeof value === 'string' &&
      /^[a-z-]+\.html(?:\?[^#]*)?$/.test(value)
      ? value
      : null;
  }

  function rememberCurrentPage() {
    const file = pageFileName();
    if (file === 'index.html') return;
    const target = `${file}${window.location.search}`;
    if (safeReturnTarget(target)) sessionStorage.setItem(RETURN_TO_KEY, target);
  }

  function consumeReturnTarget() {
    const target = safeReturnTarget(sessionStorage.getItem(RETURN_TO_KEY));
    sessionStorage.removeItem(RETURN_TO_KEY);
    return target;
  }

  async function signInWithGoogle() {
    setMessage('正在前往 Google 登入……');
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: REDIRECT_URL }
    });

    if (error) {
      setMessage(`登入失敗：${error.message}`, 'error');
      throw error;
    }
  }

  async function signOut() {
    const { error } = await client.auth.signOut();
    if (error) throw error;
    sessionStorage.removeItem(RETURN_TO_KEY);
    window.location.href = './index.html';
  }

  async function init({ requireAuth = true } = {}) {
    mountShell();

    if (!window.supabase?.createClient) {
      setMessage('Supabase 程式庫載入失敗，請重新整理頁面。', 'error');
      return null;
    }

    if (!client) {
      client = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY,
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
          }
        }
      );
    }

    const { data, error } = await client.auth.getSession();
    if (error) {
      setMessage(`讀取登入狀態失敗：${error.message}`, 'error');
      return null;
    }

    currentSession = data.session;
    if (!currentSession && requireAuth) {
      rememberCurrentPage();
      window.location.replace('./index.html?login=required');
      return null;
    }

    if (currentSession) {
      try {
        currentProfile = await fetchProfile(currentSession);
      } catch (profileError) {
        console.error('Profile loading failed', profileError);
        setMessage(`讀取個人資料失敗：${profileError.message}`, 'error');
        return null;
      }
    } else {
      currentProfile = null;
    }

    updateAuthShell(currentSession, currentProfile);

    const logoutButton = document.getElementById('drawer-logout-button');
    if (logoutButton && !logoutButton.dataset.bound) {
      logoutButton.dataset.bound = 'true';
      logoutButton.addEventListener('click', async () => {
        logoutButton.disabled = true;
        try {
          await signOut();
        } catch (logoutError) {
          setMessage(`登出失敗：${logoutError.message}`, 'error');
          logoutButton.disabled = false;
        }
      });
    }

    if (!authSubscription) {
      const result = client.auth.onAuthStateChange((event, session) => {
        currentSession = session;
        if (event === 'SIGNED_OUT' && requireAuth) {
          window.location.replace('./index.html');
        }
      });
      authSubscription = result.data.subscription;
    }

    return {
      client,
      session: currentSession,
      profile: currentProfile
    };
  }

  async function refreshCurrentSession() {
    if (!sessionRefreshPromise) {
      sessionRefreshPromise = (async () => {
        const { data, error } = await client.auth.refreshSession();
        if (error) throw error;
        if (!data.session?.access_token) {
          throw new Error('登入狀態已失效，請登出後重新登入');
        }
        currentSession = data.session;
        updateAuthShell(currentSession, currentProfile);
        return currentSession;
      })().finally(() => {
        sessionRefreshPromise = null;
      });
    }

    return sessionRefreshPromise;
  }

  async function currentAccessToken(forceRefresh = false) {
    if (!client) throw new Error('Supabase 尚未初始化');

    if (forceRefresh) {
      const refreshedSession = await refreshCurrentSession();
      return refreshedSession.access_token;
    }

    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (!data.session?.access_token) {
      throw new Error('請先使用 Google 帳號登入');
    }

    currentSession = data.session;
    const expiresAtMs = Number(currentSession.expires_at || 0) * 1000;
    if (expiresAtMs && expiresAtMs <= Date.now() + 60_000) {
      const refreshedSession = await refreshCurrentSession();
      return refreshedSession.access_token;
    }

    return currentSession.access_token;
  }

  function isUnauthorizedFunctionResult(result) {
    const responseStatus = Number(result?.error?.context?.status || 0);
    const errorText = [
      result?.error?.message,
      result?.data?.error
    ].filter(Boolean).join(' ');
    return responseStatus === 401 ||
      /\b401\b|JWT|\u767b\u5165\u72c0\u614b\u7121\u6548|\u8acb\u5148\u767b\u5165/i.test(errorText);
  }

  async function invokeUserFunction(functionName, body) {
    let accessToken = await currentAccessToken(false);
    let result = await client.functions.invoke(functionName, {
      body,
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (isUnauthorizedFunctionResult(result)) {
      accessToken = await currentAccessToken(true);
      result = await client.functions.invoke(functionName, {
        body,
        headers: { Authorization: `Bearer ${accessToken}` }
      });
    }

    return result;
  }

  function formatTime(value) {
    return new Intl.DateTimeFormat('zh-TW', {
      timeZone: 'Asia/Taipei',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(new Date(value));
  }

  function formatDateTime(value) {
    return new Intl.DateTimeFormat('zh-TW', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(new Date(value));
  }

  function taipeiDateString(value = new Date()) {
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(value);
    const partMap = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${partMap.year}-${partMap.month}-${partMap.day}`;
  }

  async function loadAttendanceActiveDates(startDate, endDate) {
    const { data, error } = await client
      .from('attendance_sessions')
      .select('checked_in_at')
      .gte('checked_in_at', `${startDate}T00:00:00+08:00`)
      .lt('checked_in_at', `${endDate}T00:00:00+08:00`)
      .order('checked_in_at', { ascending: true })
      .limit(5000);

    if (error) throw error;
    return [...new Set(
      (data || []).map(record => taipeiDateString(new Date(record.checked_in_at)))
    )];
  }

  function createRecordDatePicker({
    input,
    initialDate,
    loadActiveDates,
    onChange
  }) {
    if (!input) return null;

    if (typeof window.flatpickr !== 'function') {
      input.type = 'date';
      input.value = initialDate;
      return null;
    }

    const monthCache = new Map();
    let activeDates = new Set();
    let loadSequence = 0;

    function localDateString(date) {
      return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0')
      ].join('-');
    }

    function monthRange(year, monthIndex) {
      const start = new Date(Date.UTC(year, monthIndex, 1))
        .toISOString()
        .slice(0, 10);
      const end = new Date(Date.UTC(year, monthIndex + 1, 1))
        .toISOString()
        .slice(0, 10);
      return { start, end, month: start.slice(0, 7) };
    }

    async function refreshMonth(instance) {
      const range = monthRange(instance.currentYear, instance.currentMonth);
      const currentLoad = ++loadSequence;

      try {
        let dates = monthCache.get(range.month);
        if (!dates) {
          dates = await loadActiveDates(range);
          dates = Array.isArray(dates) ? dates : [];
          monthCache.set(range.month, dates);
        }
        if (currentLoad !== loadSequence) return;
        activeDates = new Set(dates);
        instance.redraw();
      } catch (error) {
        if (currentLoad !== loadSequence) return;
        activeDates = new Set();
        console.warn('Active date markers could not be loaded', error);
        instance.redraw();
      }
    }

    const locale = {
      firstDayOfWeek: 1,
      weekdays: {
        shorthand: ['日', '一', '二', '三', '四', '五', '六'],
        longhand: [
          '星期日', '星期一', '星期二', '星期三',
          '星期四', '星期五', '星期六'
        ]
      },
      months: {
        shorthand: [
          '1月', '2月', '3月', '4月', '5月', '6月',
          '7月', '8月', '9月', '10月', '11月', '12月'
        ],
        longhand: [
          '1月', '2月', '3月', '4月', '5月', '6月',
          '7月', '8月', '9月', '10月', '11月', '12月'
        ]
      }
    };

    return window.flatpickr(input, {
      allowInput: false,
      dateFormat: 'Y-m-d',
      defaultDate: initialDate,
      disableMobile: true,
      locale,
      onReady: (_dates, _dateText, instance) => refreshMonth(instance),
      onMonthChange: (_dates, _dateText, instance) => refreshMonth(instance),
      onYearChange: (_dates, _dateText, instance) => refreshMonth(instance),
      onChange: (_dates, dateText) => {
        if (dateText && typeof onChange === 'function') onChange(dateText);
      },
      onDayCreate: (_dates, _dateText, _instance, dayElement) => {
        const dateText = localDateString(dayElement.dateObj);
        if (!activeDates.has(dateText)) return;
        dayElement.classList.add('has-records');
        dayElement.title = `${dateText}（有紀錄）`;
      }
    });
  }

  function nextDateString(dateString) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return null;
    const [year, month, day] = dateString.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));

    if (
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day
    ) {
      return null;
    }

    return new Date(Date.UTC(year, month - 1, day + 1))
      .toISOString()
      .slice(0, 10);
  }

  function roleLabel(role) {
    return role === 'primary' ? '主要借用者' : '共同使用者';
  }

  async function loadProfiles(profileIds) {
    const ids = [...new Set((profileIds || []).filter(Boolean))];
    if (ids.length === 0) return new Map();

    const { data, error } = await client
      .from('profiles')
      .select('id, display_name, avatar_url')
      .in('id', ids);

    if (error) throw error;
    return new Map((data || []).map(profile => [profile.id, profile]));
  }

  async function loadOpenPeople() {
    const { data: sessions, error } = await client
      .from('attendance_sessions')
      .select('id, user_id, gym_role, checked_in_at')
      .is('checked_out_at', null)
      .order('checked_in_at', { ascending: true });

    if (error) throw error;

    const profileMap = await loadProfiles((sessions || []).map(item => item.user_id));
    return (sessions || []).map(session => ({
      ...session,
      profile: profileMap.get(session.user_id) || {
        display_name: '未知使用者',
        avatar_url: null
      }
    }));
  }

  async function functionErrorMessage(error, fallbackMessage) {
    const response = error?.context;
    if (response && typeof response.clone === 'function') {
      try {
        const payload = await response.clone().json();
        if (typeof payload?.error === 'string' && payload.error) {
          return payload.error;
        }
      } catch {
        // 使用一般錯誤訊息。
      }
    }
    return error?.message || fallbackMessage;
  }

  window.GymApp = {
    FALLBACK_AVATAR,
    consumeReturnTarget,
    formatDateTime,
    formatTime,
    functionErrorMessage,
    hideMessage,
    init,
    invokeUserFunction,
    loadAttendanceActiveDates,
    loadOpenPeople,
    loadProfiles,
    nextDateString,
    profileAvatar,
    profileName,
    roleLabel,
    setMessage,
    signInWithGoogle,
    signOut,
    taipeiDateString,
    createRecordDatePicker
  };
})();
