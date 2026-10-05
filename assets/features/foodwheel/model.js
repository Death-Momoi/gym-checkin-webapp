  function uniqueItems(items) {
    const seen = new Set();
    return items
      .map(item => String(item || '').trim())
      .filter(item => {
        if (!item || seen.has(item)) return false;
        seen.add(item);
        return true;
      });
  }

  function parseCustomItems(value) {
    return uniqueItems(String(value || '').split(/[\n,，;；]+/));
  }

  function secureRandomIndex(max) {
    if (max <= 1) return 0;
    if (window.crypto?.getRandomValues) {
      const buffer = new Uint32Array(1);
      const limit = Math.floor(0x100000000 / max) * max;
      do {
        window.crypto.getRandomValues(buffer);
      } while (buffer[0] >= limit);
      return buffer[0] % max;
    }
    return Math.floor(Math.random() * max);
  }
export {uniqueItems,parseCustomItems,secureRandomIndex};
