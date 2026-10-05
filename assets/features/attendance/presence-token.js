export function createPresenceTokenStore(){
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


return {capturePresenceToken,clearStoredPresenceToken};
}
