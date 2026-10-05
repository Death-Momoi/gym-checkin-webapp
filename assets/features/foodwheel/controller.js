import { uniqueItems, parseCustomItems, secureRandomIndex } from './model.js';
import { drawWheel as paintWheel } from './renderer.js';
import { FOOD_CATEGORIES } from './catalog.js';
import { readCustomItems, writeCustomItems, removeCustomItems } from './repository.js';
import { init as appInit } from '../auth/index.js';
import { setMessage as appSetMessage } from '../../shared/ui/messages.js';
export async function mount(){
const app = await appInit();
  if (!app) return;

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

  const drawWheel=()=>paintWheel(canvas,wheelItems,wheelAngle);
  let wheelItems = [];
  let wheelAngle = 0;
  let isSpinning = false;
  let animationFrame = null;



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



  function restoreCustomItems() {
    try {
      customInput.value = readCustomItems() || '';
    } catch (error) {
      console.warn('Custom restaurants could not be restored', error);
    }
  }

  function saveCustomItems(value) {
    try {
      writeCustomItems(value.trim());
    } catch (error) {
      console.warn('Custom restaurants could not be saved', error);
    }
  }

  function clearCustomItems() {
    customInput.value = '';
    try {
      removeCustomItems();
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
    appSetMessage('轉盤已建立，按下中央按鈕開始抽選。', 'success');
    wheelStage.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function buildPresetWheel() {
    if (isSpinning) return;
    const categories = selectedCategories();
    if (categories.length === 0) {
      appSetMessage('請至少勾選一個飲食分類。', 'error');
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
      appSetMessage('請至少輸入兩間不同的店家。', 'error');
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
    appSetMessage('請重新選擇分類或自訂店家。');
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
    appSetMessage(`抽選完成：${winner}`, 'success');
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
  appSetMessage('請選擇飲食分類，或開啟自訂轉盤。');
}
