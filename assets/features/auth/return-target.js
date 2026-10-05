import { RETURN_TO_KEY } from '../../core/config.js';
export function pageFileName() {
    const name = window.location.pathname.split('/').pop();
    return name || 'index.html';
  }

export function safeReturnTarget(value) {
    return typeof value === 'string' &&
      /^[a-z-]+\.html(?:\?[^#]*)?$/.test(value)
      ? value
      : null;
  }

export function rememberCurrentPage() {
    const file = pageFileName();
    if (file === 'index.html') return;
    const target = `${file}${window.location.search}`;
    if (safeReturnTarget(target)) sessionStorage.setItem(RETURN_TO_KEY, target);
  }

export function consumeReturnTarget() {
    const target = safeReturnTarget(sessionStorage.getItem(RETURN_TO_KEY));
    sessionStorage.removeItem(RETURN_TO_KEY);
    return target;
  }
