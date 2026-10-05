import { NAV_ITEMS } from '../../app/navigation.js';
import { profileName, profileAvatar } from '../profile-display.js';
export function mountShell() {
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
            <span>v1.5 現場 QR 簽到認證</span>
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
export function updateAuthShell(session, profile) {
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
