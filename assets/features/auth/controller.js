import { client, initializeClient } from '../../core/client.js';
import { REDIRECT_URL, RETURN_TO_KEY } from '../../core/config.js';
import { setMessage } from '../../shared/ui/messages.js';
import { mountShell, updateAuthShell } from '../../shared/ui/shell.js';
import { fetchProfile } from '../profiles/index.js';
import { rememberCurrentPage } from './return-target.js';
import { mountNameForm, ensureConfirmedName } from './onboarding.js';
let currentSession=null,currentProfile=null,authSubscription=null,sessionRefreshPromise=null;
export async function signInWithGoogle() {
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

export async function signOut() {
    const { error } = await client.auth.signOut();
    if (error) throw error;
    sessionStorage.removeItem(RETURN_TO_KEY);
    window.location.href = './index.html';
  }
export async function init({ requireAuth = true } = {}) {
    mountShell();

    mountNameForm();
    try { await initializeClient(); } catch {setMessage('Supabase 程式庫載入失敗，請重新整理頁面。','error');return null;}

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

    if (currentSession && currentProfile && !currentProfile.name_confirmed) {
      try {
        currentProfile = await ensureConfirmedName(currentSession, currentProfile, signOut);
        updateAuthShell(currentSession, currentProfile);
      } catch (nameError) {
        console.error('Name onboarding failed', nameError);
        setMessage(`姓名設定失敗：${nameError.message}`, 'error');
        return null;
      }
    }

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
export async function refreshCurrentSession() {
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

export async function currentAccessToken(forceRefresh = false) {
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
