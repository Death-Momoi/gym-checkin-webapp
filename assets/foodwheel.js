(async function () {
  'use strict';

  const app = await GymApp.init();
  if (!app) return;

  const FOOD_CATEGORIES = Object.freeze({
    '今天吃貴一點': [
      '久千代', '富美海鮮火鍋', '涮乃葉', '藏壽司', '壽司郎', '聚(火鍋)', '錢都', '肉多多',
      '鰭兵衛', '糧2燒肉', '成功牛排', '獅子座牛排', '八方悅', '霖川鍋物', '御廷鐵板燒'
    ],
    '吃乾淨一點': [
      'SELFree纖活餐盒', '逐日', '沐暮沙拉', '便利商店健康餐盒'
    ],
    '隨便吃一吃': [
      'PhoWild越式生牛肉河粉', '維縈碳烤雞排', 'E炸G', '麥當勞', '老先覺', '六扇門',
      '三杯香滷味', '福品滷味', '上野烤肉飯', '銀萊蚵仔煎', '甜屋', '銅螺灣螺獅粉',
      '長旺鐵板燒', '人吉牛肉洞飯', '舞吉臭臭鍋', '方便食鐵板燒', '梁杜漢'
    ],
    '月底救星': [
      '日誠便當', '再一碗便當', '老圓環飯包', '五叉路傳統美食', '7-11乞丐時光', '全家乞丐時光'
    ]
  });

  const WHEEL_COLORS = [
    '#e11d48', '#f97316', '#eab308', '#16a34a', '#0891b2', '#2563eb',
    '#7c3aed', '#c026d3', '#db2777', '#0d9488', '#65a30d', '#ea580c'
  ];
  const CUSTOM_STORAGE_KEY = 'food_wheel_custom_restaurants';

  const categoryCheckboxes = [...document.querySelectorAll('.food-category-checkbox')];
  const categorySummary = document.getElementById('food-category-summary');
  const presetButton = document.getElementById('food-preset-button');
  const customToggleButton = document.getElementById('food-custom-toggle-button');
  const customPanel = document.getElementById('food-custom-panel');
  const customCloseButton = document.getElementById('food-custom-close-button');
  const customInput = document.getElementById('food-custom-input');
  const customClearButton = document.getElementById('food-custom-clear-button');
  const customApplyButton = document.getElementById('food-custom-apply-button');
  const wheelStage = document.getElementById('food-wheel-stage');
  const modeLabel = document.getElementById('food-wheel-mode-label');
  const countLabel = document.getElementById('food-wheel-count-label');
  const resetButton = document.getElementById('food-wheel-reset-button');
  const canvas = document.getElementById('food-wheel-canvas');
  const centerButton = document.getElementById('food-wheel-center-button');
  const result = document.getElementById('food-wheel-result');
  const celebrationLayer = document.getElementById('food-celebration-layer');

  let wheelItems = [];
  let wheelAngle = 0;
  let isSpinning = false;
  let animationFrame = null;

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

  function selectedCategories() {
    return categoryCheckboxes
      .filter(checkbox => checkbox.checked)
      .map(checkbox => checkbox.value);
  }

  function updateCategorySummary() {
    const categories = selectedCategories();
    const items = uniqueItems(
      categories.flatMap(category => FOOD_CATEGORIES[category] || [])
    );

    categorySummary.textContent = categories.length === 0
      ? '尚未選擇分類'
      : `已選 ${categories.length} 個分類，共 ${items.length} 間不重複店家`;
  }

  function toggleCustomPanel(forceOpen) {
    const shouldOpen = typeof forceOpen === 'boolean'
      ? forceOpen
      : customPanel.classList.contains('hidden');

    customPanel.classList.toggle('hidden', !shouldOpen);
    customToggleButton.setAttribute('aria-expanded', String(shouldOpen));
    if (shouldOpen) customInput.focus();
  }

  function parseCustomItems(value) {
    return uniqueItems(String(value || '').split(/[\n,，;；]+/));
  }

  function restoreCustomItems() {
    try {
      customInput.value = localStorage.getItem(CUSTOM_STORAGE_KEY) || '';
    } catch (error) {
      console.warn('Custom restaurants could not be restored', error);
    }
  }

  function saveCustomItems(value) {
    try {
      localStorage.setItem(CUSTOM_STORAGE_KEY, value.trim());
    } catch (error) {
      console.warn('Custom restaurants could not be saved', error);
    }
  }

  function clearCustomItems() {
    customInput.value = '';
    try {
      localStorage.removeItem(CUSTOM_STORAGE_KEY);
    } catch (error) {
      console.warn('Custom restaurants could not be cleared', error);
    }
    customInput.focus();
  }

  function setResultIdle() {
    result.replaceChildren();
    const icon = document.createElement('span');
    const message = document.createElement('span');
    icon.className = 'food-result-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '🍽️';
    message.textContent = '按下轉盤中央開始抽選';
    result.append(icon, message);
  }

  function setResultLoading() {
    result.replaceChildren();
    const spinner = document.createElement('span');
    const message = document.createElement('span');
    spinner.className = 'food-spinner';
    spinner.setAttribute('aria-hidden', 'true');
    message.textContent = '命運正在幫你選餐廳……';
    result.append(spinner, message);
  }

  function setResultWinner(winner) {
    result.replaceChildren();
    const eyebrow = document.createElement('span');
    const name = document.createElement('strong');
    const note = document.createElement('span');
    eyebrow.className = 'food-result-eyebrow';
    name.className = 'food-result-name';
    note.className = 'food-result-note';
    eyebrow.textContent = '今天就吃';
    name.textContent = winner;
    note.textContent = '不准重抽……除非大家都同意 😎';
    result.append(eyebrow, name, note);
  }

  function fitLabel(label, itemCount) {
    const maxChars = itemCount > 42 ? 7 : itemCount > 28 ? 9 :
      itemCount > 18 ? 12 : 18;
    return label.length > maxChars
      ? `${label.slice(0, Math.max(1, maxChars - 1))}…`
      : label;
  }

  function prepareCanvas() {
    const parentWidth = canvas.parentElement?.clientWidth || 320;
    const cssSize = Math.max(220, Math.min(parentWidth, 420));
    const density = Math.min(window.devicePixelRatio || 1, 2);
    const pixelSize = Math.round(cssSize * density);

    if (canvas.width !== pixelSize || canvas.height !== pixelSize) {
      canvas.width = pixelSize;
      canvas.height = pixelSize;
      canvas.style.width = `${cssSize}px`;
      canvas.style.height = `${cssSize}px`;
    }

    const context = canvas.getContext('2d');
    if (!context) return null;
    context.setTransform(density, 0, 0, density, 0, 0);
    return { context, size: cssSize, center: cssSize / 2 };
  }

  function drawWheel() {
    const prepared = prepareCanvas();
    if (!prepared || wheelItems.length === 0) return;

    const { context, size, center } = prepared;
    const radius = center - 7;
    const itemCount = wheelItems.length;
    const arc = (Math.PI * 2) / itemCount;
    const fontSize = itemCount > 42 ? 7 : itemCount > 30 ? 8 :
      itemCount > 20 ? 9 : itemCount > 12 ? 10 : 12;

    context.clearRect(0, 0, size, size);
    context.save();
    context.translate(center, center);

    wheelItems.forEach((restaurant, index) => {
      const startAngle = wheelAngle + index * arc - Math.PI / 2;
      const endAngle = startAngle + arc;
      const middleAngle = startAngle + arc / 2;

      context.beginPath();
      context.moveTo(0, 0);
      context.arc(0, 0, radius, startAngle, endAngle);
      context.closePath();
      context.fillStyle = WHEEL_COLORS[index % WHEEL_COLORS.length];
      context.fill();
      context.strokeStyle = 'rgba(17, 24, 39, 0.88)';
      context.lineWidth = itemCount > 30 ? 1 : 2;
      context.stroke();

      context.save();
      const normalizedMiddle =
        ((middleAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const onLeft = normalizedMiddle > Math.PI / 2 &&
        normalizedMiddle < Math.PI * 1.5;
      context.rotate(onLeft ? middleAngle + Math.PI : middleAngle);
      context.textAlign = onLeft ? 'left' : 'right';
      context.textBaseline = 'middle';
      context.font =
        `700 ${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;
      context.fillStyle = '#fff';
      context.shadowColor = 'rgba(0, 0, 0, 0.7)';
      context.shadowBlur = 2;
      context.fillText(
        fitLabel(restaurant, itemCount),
        onLeft ? -(radius - 14) : radius - 14,
        0
      );
      context.restore();
    });

    context.beginPath();
    context.arc(0, 0, radius, 0, Math.PI * 2);
    context.strokeStyle = '#facc15';
    context.lineWidth = 5;
    context.stroke();

    context.beginPath();
    context.arc(0, 0, Math.max(48, size * 0.145), 0, Math.PI * 2);
    context.fillStyle = '#030712';
    context.fill();
    context.strokeStyle = '#facc15';
    context.lineWidth = 4;
    context.stroke();
    context.restore();
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

  function launchCelebration() {
    celebrationLayer.replaceChildren();
    const colors = [
      '#f43f5e', '#f97316', '#facc15', '#22c55e',
      '#06b6d4', '#3b82f6', '#a855f7', '#ec4899'
    ];
    const fragment = document.createDocumentFragment();

    for (let index = 0; index < 70; index += 1) {
      const piece = document.createElement('span');
      piece.className = 'food-confetti';
      piece.style.left = `${Math.random() * 100}vw`;
      piece.style.backgroundColor = colors[index % colors.length];
      piece.style.setProperty('--drift', `${Math.round((Math.random() - 0.5) * 240)}px`);
      piece.style.setProperty('--rotation', `${Math.round(540 + Math.random() * 900)}deg`);
      piece.style.setProperty('--delay', `${(Math.random() * 0.6).toFixed(2)}s`);
      piece.style.setProperty('--duration', `${(2.8 + Math.random() * 1.7).toFixed(2)}s`);
      fragment.appendChild(piece);
    }

    celebrationLayer.appendChild(fragment);
    window.setTimeout(() => celebrationLayer.replaceChildren(), 5200);
  }

  function setWheelItems(items, description) {
    wheelItems = uniqueItems(items);
    wheelAngle = 0;
    wheelStage.classList.remove('hidden');
    modeLabel.textContent = description;
    countLabel.textContent = `共 ${wheelItems.length} 間店家`;
    centerButton.disabled = false;
    centerButton.lastElementChild.textContent = '開轉';
    setResultIdle();
    drawWheel();
    GymApp.setMessage('轉盤已建立，按下中央按鈕開始抽選。', 'success');
    wheelStage.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function buildPresetWheel() {
    if (isSpinning) return;
    const categories = selectedCategories();
    if (categories.length === 0) {
      GymApp.setMessage('請至少勾選一個飲食分類。', 'error');
      return;
    }

    const items = uniqueItems(
      categories.flatMap(category => FOOD_CATEGORIES[category] || [])
    );
    setWheelItems(items, categories.join('＋'));
  }

  function buildCustomWheel() {
    if (isSpinning) return;
    const items = parseCustomItems(customInput.value);
    if (items.length < 2) {
      GymApp.setMessage('請至少輸入兩間不同的店家。', 'error');
      customInput.focus();
      return;
    }

    saveCustomItems(customInput.value);
    setWheelItems(items, '自訂轉盤');
    toggleCustomPanel(false);
  }

  function resetWheel() {
    if (isSpinning) return;
    wheelItems = [];
    wheelAngle = 0;
    wheelStage.classList.add('hidden');
    GymApp.setMessage('請重新選擇分類或自訂店家。');
    document.getElementById('food-selection-card')
      .scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function finishSpin(winnerIndex, targetAngle) {
    wheelAngle = targetAngle % (Math.PI * 2);
    drawWheel();
    isSpinning = false;
    centerButton.disabled = false;
    centerButton.lastElementChild.textContent = '再轉';
    const winner = wheelItems[winnerIndex];
    setResultWinner(winner);
    GymApp.setMessage(`抽選完成：${winner}`, 'success');
    launchCelebration();
  }

  function spinWheel() {
    if (isSpinning || wheelItems.length < 2) return;

    isSpinning = true;
    centerButton.disabled = true;
    centerButton.lastElementChild.textContent = '轉動中';
    setResultLoading();

    const winnerIndex = secureRandomIndex(wheelItems.length);
    const fullCircle = Math.PI * 2;
    const arc = fullCircle / wheelItems.length;
    const normalizedCurrent = ((wheelAngle % fullCircle) + fullCircle) % fullCircle;
    const desired = ((-(winnerIndex + 0.5) * arc % fullCircle) + fullCircle) % fullCircle;
    let forwardDelta = desired - normalizedCurrent;
    if (forwardDelta < 0) forwardDelta += fullCircle;

    const startAngle = wheelAngle;
    const targetAngle = wheelAngle +
      (6 + secureRandomIndex(3)) * fullCircle + forwardDelta;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = reducedMotion ? 450 : 4700;
    const startTime = performance.now();

    if (animationFrame) cancelAnimationFrame(animationFrame);

    function animate(now) {
      const progress = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - progress, 5);
      wheelAngle = startAngle + (targetAngle - startAngle) * eased;
      drawWheel();

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      } else {
        finishSpin(winnerIndex, targetAngle);
      }
    }

    animationFrame = requestAnimationFrame(animate);
  }

  categoryCheckboxes.forEach(checkbox => {
    checkbox.addEventListener('change', updateCategorySummary);
  });
  presetButton.addEventListener('click', buildPresetWheel);
  customToggleButton.addEventListener('click', () => toggleCustomPanel());
  customCloseButton.addEventListener('click', () => toggleCustomPanel(false));
  customClearButton.addEventListener('click', clearCustomItems);
  customApplyButton.addEventListener('click', buildCustomWheel);
  resetButton.addEventListener('click', resetWheel);
  centerButton.addEventListener('click', spinWheel);
  window.addEventListener('resize', () => {
    if (!wheelStage.classList.contains('hidden') && wheelItems.length > 0) {
      requestAnimationFrame(drawWheel);
    }
  });

  restoreCustomItems();
  updateCategorySummary();
  GymApp.setMessage('請選擇飲食分類，或開啟自訂轉盤。');
})();
