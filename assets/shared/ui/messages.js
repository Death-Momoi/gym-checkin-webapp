export function setMessage(text, type = '') {
    const element = document.getElementById('message');
    if (!element) return;
    element.textContent = text;
    element.className = `message${type ? ` ${type}` : ''}`;
    element.classList.remove('hidden');
  }

export function hideMessage() {
    document.getElementById('message')?.classList.add('hidden');
  }
