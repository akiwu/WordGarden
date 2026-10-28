import {
  createIcons,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  Lock,
  Map as MapIcon,
  Mic,
  Play,
  RotateCcw,
  ShoppingBasket,
  Sprout,
  Star,
  Trophy,
  Volume2,
  VolumeX,
  X,
} from 'lucide';
import { levels, parts, produce, produceIcon } from './produce.js';

const iconSet = { ArrowRight, ArrowUpRight, Check, ChevronRight, Lock, Map: MapIcon, Mic, Play, RotateCcw, ShoppingBasket, Sprout, Star, Trophy, Volume2, VolumeX, X };
const refreshIcons = () => createIcons({ icons: iconSet, attrs: { 'stroke-width': 1.8 } });
const $ = (selector) => document.querySelector(selector);
const STORAGE_KEY = 'akiko-word-orchard-v2';
const LEGACY_STORAGE_KEY = 'akiko-word-orchard-v1';
const SOUND_KEY = 'akiko-word-orchard-sound';
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const validIds = new Set(produce.map((item) => item.id));
const treePositions = [
  { x: 31, y: 34, tilt: -5 },
  { x: 66, y: 31, tilt: 5 },
  { x: 38, y: 57, tilt: 4 },
  { x: 69, y: 58, tilt: -4 },
];
const levelNames = ['初识新词', '快乐进阶', '小小挑战'];

const elements = {
  orchard: $('#orchard'),
  treeArea: $('#tree-area'),
  fruitLayer: $('#fruit-layer'),
  partEyebrow: $('#part-eyebrow'),
  levelTitle: $('#level-title'),
  levelSubtitle: $('#level-subtitle'),
  levelDots: $('#level-dots'),
  levelProgressCopy: $('#level-progress-copy'),
  pickMode: $('#pick-mode'),
  pickModeLabel: $('#pick-mode-label'),
  mapButton: $('#map-button'),
  basketButton: $('#basket-button'),
  sceneBasket: $('#scene-basket'),
  basketCount: $('#basket-count'),
  basketPreview: $('#basket-preview'),
  readingPanel: $('#reading-panel'),
  readingFruit: $('#reading-fruit'),
  readingWord: $('#reading-word'),
  readingMeaning: $('#reading-meaning'),
  micButton: $('#mic-button'),
  listeningStatus: $('#listening-status'),
  manualConfirm: $('#manual-confirm'),
  closeReading: $('#close-reading'),
  pronounceButton: $('#pronounce-button'),
  toast: $('#toast'),
  basketDialog: $('#basket-dialog'),
  closeBasket: $('#close-basket'),
  drawerCount: $('#drawer-count'),
  collectedTabCount: $('#collected-tab-count'),
  progressFill: $('#progress-fill'),
  basketContent: $('#basket-content'),
  resetButton: $('#reset-button'),
  confirmDialog: $('#confirm-dialog'),
  cancelReset: $('#cancel-reset'),
  confirmReset: $('#confirm-reset'),
  mapDialog: $('#map-dialog'),
  closeMap: $('#close-map'),
  mapContent: $('#level-map-content'),
  mapProgressCopy: $('#map-progress-copy'),
  mapProgressFill: $('#map-progress-fill'),
  completionDialog: $('#completion-dialog'),
  completionKicker: $('#completion-kicker'),
  completionTitle: $('#completion-title'),
  completionMessage: $('#completion-message'),
  completionWords: $('#completion-words'),
  confetti: $('#confetti'),
  replayLevel: $('#replay-level'),
  nextLevel: $('#next-level'),
  soundToggle: $('#sound-toggle'),
};

let progress = loadProgress();
let collected = new Set(progress.mastered);
let selectedProduce = null;
let recognition = null;
let listening = false;
let collecting = false;
let pickEnabled = true;
let activeTab = 'collected';
let soundEnabled = loadSoundPreference();
let toastTimer;
let listeningTimer;
let completionTimer;
let growthTimer;
let audioContext;

function freshProgress() {
  return { currentLevel: 0, unlockedLevel: 0, pickedByLevel: {}, mastered: [] };
}

function loadProgress() {
  try {
    const savedV2 = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    const legacy = savedV2 ? null : JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || 'null');
    if (!savedV2 && !Array.isArray(legacy)) return freshProgress();

    const saved = savedV2 || { mastered: legacy };
    const mastered = [...new Set((Array.isArray(saved.mastered) ? saved.mastered : []).filter((id) => validIds.has(id)))];
    const masteredSet = new Set(mastered);
    const pickedByLevel = {};

    levels.forEach((level, index) => {
      const allowed = new Set(level.items.map((item) => item.id));
      const savedPicks = savedV2 && saved.pickedByLevel && Array.isArray(saved.pickedByLevel[index])
        ? saved.pickedByLevel[index]
        : level.items.map((item) => item.id).filter((id) => masteredSet.has(id));
      const picks = [...new Set(savedPicks.filter((id) => allowed.has(id)))];
      pickedByLevel[index] = picks;
      picks.forEach((id) => {
        if (!masteredSet.has(id)) {
          masteredSet.add(id);
          mastered.push(id);
        }
      });
    });

    let inferredUnlock = 0;
    for (let index = 0; index < levels.length; index += 1) {
      if (!levels[index].items.every((item) => masteredSet.has(item.id))) break;
      inferredUnlock = Math.min(index + 1, levels.length - 1);
    }
    const savedUnlock = Number.isInteger(saved.unlockedLevel) ? saved.unlockedLevel : 0;
    const unlockedLevel = Math.max(0, Math.min(levels.length - 1, Math.max(savedUnlock, inferredUnlock)));
    const savedCurrent = Number.isInteger(saved.currentLevel) ? saved.currentLevel : inferredUnlock;
    const currentLevel = Math.max(0, Math.min(unlockedLevel, savedCurrent));
    return { currentLevel, unlockedLevel, pickedByLevel, mastered };
  } catch {
    return freshProgress();
  }
}

function loadSoundPreference() {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
}

function saveProgress() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Persistence is optional; gameplay continues when storage is unavailable.
  }
}

function currentLevel() {
  return levels[progress.currentLevel];
}

function currentPicks() {
  return progress.pickedByLevel[progress.currentLevel] || [];
}

function isRoundComplete(index) {
  return (progress.pickedByLevel[index] || []).length === levels[index].items.length;
}

function isLevelMastered(index) {
  return levels[index].items.every((item) => collected.has(item.id));
}

function completedLevelCount() {
  return levels.filter((_, index) => isLevelMastered(index)).length;
}

function updateTreeGrowth() {
  const growth = progress.unlockedLevel / (levels.length - 1);
  const mobile = window.matchMedia('(max-width: 700px)').matches;
  const startScale = mobile ? 0.88 : 0.76;
  const scale = startScale + (1 - startScale) * growth;
  elements.treeArea.style.setProperty('--tree-scale', scale.toFixed(3));
  elements.treeArea.style.setProperty('--item-scale', (1 / scale).toFixed(3));
  elements.treeArea.dataset.growth = String(progress.unlockedLevel + 1);
}

function renderHeader() {
  const level = currentLevel();
  const picked = new Set(currentPicks());
  elements.partEyebrow.innerHTML = `<i data-lucide="sprout"></i> PART ${level.partIndex + 1} / ${parts.length} · ${level.partEnglish} · ${level.cefr}`;
  elements.levelTitle.textContent = `${level.partTitle} · 第 ${level.levelInPart + 1} 关`;
  elements.levelSubtitle.textContent = `${levelNames[level.levelInPart]}：读出 4 个单词，让小树再长高一点。`;
  elements.levelDots.innerHTML = level.items.map((item) => `<span class="${picked.has(item.id) ? 'is-done' : ''}" title="${item.word}"></span>`).join('');
  elements.levelProgressCopy.textContent = `本关 ${picked.size} / ${level.items.length}`;
}

function renderTree() {
  const level = currentLevel();
  const picked = new Set(currentPicks());
  elements.fruitLayer.innerHTML = level.items.map((item, index) => {
    const position = treePositions[index];
    return `
      <button
        class="fruit-button ${picked.has(item.id) ? 'is-picked' : ''}"
        style="left:${position.x}%;top:${position.y}%;--tilt:${position.tilt}deg;--delay:-${index * 0.63}s"
        data-id="${item.id}"
        type="button"
        aria-label="采摘${item.zh}，英文 ${item.word}"
        ${picked.has(item.id) ? 'tabindex="-1"' : ''}
      >
        <span class="fruit-float">
          ${produceIcon(item.id)}
          <span class="fruit-label">${item.word}</span>
        </span>
      </button>`;
  }).join('');
}

function renderBasket() {
  const count = collected.size;
  elements.basketCount.textContent = count;
  elements.drawerCount.textContent = count;
  elements.collectedTabCount.textContent = count;
  elements.progressFill.style.width = `${(count / produce.length) * 100}%`;
  elements.basketPreview.innerHTML = progress.mastered.slice(-3).map((id) => produceIcon(id)).join('');
  elements.sceneBasket.setAttribute('aria-label', `查看篮子里的收获，已收集 ${count} 个单词`);
  renderBasketContent();
}

function renderBasketContent() {
  document.querySelectorAll('[data-tab]').forEach((tab) => {
    tab.setAttribute('aria-selected', String(tab.dataset.tab === activeTab));
    tab.tabIndex = tab.dataset.tab === activeTab ? 0 : -1;
  });

  const items = activeTab === 'collected'
    ? progress.mastered.map((id) => produce.find((item) => item.id === id)).filter(Boolean)
    : produce;

  if (activeTab === 'collected' && items.length === 0) {
    elements.basketContent.innerHTML = `
      <div class="empty-basket">
        <span class="empty-icon"><i data-lucide="shopping-basket"></i></span>
        <h3>小篮子还空着呢</h3>
        <p>果园里的第一颗果实，正等着听你大声读出它的名字。</p>
        <button class="primary-button" type="button" data-action="go-pick">去果园看看</button>
      </div>`;
  } else {
    elements.basketContent.innerHTML = `<div class="basket-grid">${items.map((item) => {
      const isCollected = collected.has(item.id);
      return `
        <article class="produce-card ${isCollected ? '' : 'is-locked'}">
          ${produceIcon(item.id)}
          <strong>${item.word}</strong>
          <small>${item.zh}</small>
          ${isCollected
            ? `<button class="card-sound" type="button" data-speak="${item.word}" aria-label="播放 ${item.word} 的发音"><i data-lucide="volume-2"></i></button>`
            : `<span class="card-status" title="还未收集"><i data-lucide="lock"></i></span>`}
        </article>`;
    }).join('')}</div>`;
  }
  refreshIcons();
}

function renderMap() {
  const completed = completedLevelCount();
  elements.mapProgressCopy.textContent = `${completed} / ${levels.length} 关`;
  elements.mapProgressFill.style.width = `${(completed / levels.length) * 100}%`;
  elements.mapContent.innerHTML = parts.map((part, partIndex) => {
    const partLevels = levels.filter((level) => level.partIndex === partIndex);
    const partDone = partLevels.every((level) => isLevelMastered(levels.indexOf(level)));
    return `
      <section class="map-part ${partDone ? 'is-complete' : ''}">
        <header class="map-part-header">
          <span class="part-number">${String(partIndex + 1).padStart(2, '0')}</span>
          <div><h3>${part.title}</h3><span>${part.english}</span></div>
          <span class="cefr-badge">${part.cefr}</span>
          ${partDone ? '<span class="part-done"><i data-lucide="check"></i> 已完成</span>' : ''}
        </header>
        <div class="map-levels">
          ${partLevels.map((level) => {
            const index = levels.indexOf(level);
            const locked = index > progress.unlockedLevel;
            const complete = isLevelMastered(index);
            const current = index === progress.currentLevel;
            const action = locked ? '未解锁' : current && !isRoundComplete(index) ? '继续' : complete ? '复习' : '开始';
            return `
              <button class="map-level ${complete ? 'is-complete' : ''} ${current ? 'is-current' : ''}" type="button" data-level="${index}" ${locked ? 'disabled' : ''} aria-label="${part.title}第 ${level.levelInPart + 1} 关，${action}">
                <span class="map-level-top"><span>第 ${level.levelInPart + 1} 关</span><i data-lucide="${locked ? 'lock' : complete ? 'check' : 'play'}"></i></span>
                <strong>${levelNames[level.levelInPart]}</strong>
                <span class="map-level-words">${level.items.map((item) => item.word).join(' · ')}</span>
                <span class="map-level-action">${action}<i data-lucide="chevron-right"></i></span>
              </button>`;
          }).join('')}
        </div>
      </section>`;
  }).join('');
  refreshIcons();
}

function renderAll() {
  renderHeader();
  renderTree();
  renderBasket();
  updateTreeGrowth();
  if (elements.mapDialog.open) renderMap();
  refreshIcons();
}

function showToast(message, duration = 2500) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  toastTimer = setTimeout(() => { elements.toast.hidden = true; }, duration);
}

function setPickMode(enabled) {
  pickEnabled = enabled;
  elements.orchard.classList.toggle('pick-enabled', enabled);
  elements.pickMode.classList.toggle('is-active', enabled);
  elements.pickMode.setAttribute('aria-pressed', String(enabled));
  elements.pickModeLabel.textContent = enabled ? '小手准备好了' : '点这里，继续采摘';
  if (!enabled) closeReadingPanel();
}

function selectProduce(id) {
  const item = currentLevel().items.find((entry) => entry.id === id);
  if (!item || currentPicks().includes(id)) return;
  if (!pickEnabled) {
    showToast('先点一点左下角的小手，再来采摘吧');
    return;
  }

  stopListening();
  selectedProduce = item;
  collecting = false;
  elements.readingFruit.innerHTML = produceIcon(item.id);
  elements.readingWord.textContent = item.word;
  elements.readingMeaning.textContent = item.zh;
  elements.manualConfirm.hidden = true;
  setListeningStatus('点击麦克风，再大声读单词');
  setMicState(false);
  elements.readingPanel.hidden = false;
  elements.micButton.focus({ preventScroll: true });
}

function closeReadingPanel() {
  stopListening();
  elements.readingPanel.hidden = true;
  selectedProduce = null;
  collecting = false;
}

function setListeningStatus(message, type = '') {
  elements.listeningStatus.textContent = message;
  elements.listeningStatus.className = `listening-status ${type}`;
}

function setMicState(isListening) {
  listening = isListening;
  elements.micButton.classList.toggle('listening', isListening);
  elements.micButton.innerHTML = isListening
    ? '<i data-lucide="mic"></i><span>停止聆听</span>'
    : '<i data-lucide="mic"></i><span>开始朗读</span>';
  refreshIcons();
}

function showManualFallback(message) {
  setListeningStatus(message, 'retry');
  elements.manualConfirm.hidden = false;
}

function stopListening() {
  clearTimeout(listeningTimer);
  if (recognition) {
    recognition.onend = null;
    try { recognition.stop(); } catch { /* Recognition may already be stopped. */ }
  }
  recognition = null;
  if (listening) setMicState(false);
}

function startListening() {
  if (!selectedProduce || collecting) return;
  if (listening) {
    stopListening();
    setListeningStatus('已停止，点击麦克风可以重试');
    return;
  }
  if (!SpeechRecognition) {
    showManualFallback('此浏览器暂不支持语音识别，大声读完后点下方确认');
    return;
  }

  stopListening();
  recognition = new SpeechRecognition();
  const target = selectedProduce;
  recognition.lang = 'en-US';
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.maxAlternatives = 3;

  recognition.onstart = () => {
    setMicState(true);
    setListeningStatus(`正在听… 大声说 “${target.word}”`);
    clearTimeout(listeningTimer);
    listeningTimer = setTimeout(() => {
      if (listening && selectedProduce?.id === target.id) {
        stopListening();
        setListeningStatus('没听清，再试一次吧', 'retry');
      }
    }, 10000);
  };

  recognition.onresult = (event) => {
    const transcripts = [];
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      for (let j = 0; j < event.results[i].length; j += 1) {
        transcripts.push(event.results[i][j].transcript.toLowerCase().trim());
      }
    }
    const matched = transcripts.some((transcript) => {
      const normalized = transcript.replace(/[^a-z]/g, ' ');
      return normalized.split(/\s+/).includes(target.word);
    });
    if (matched) {
      clearTimeout(listeningTimer);
      setMicState(false);
      try { recognition.stop(); } catch { /* No active recognition to stop. */ }
      collectProduce(target);
    } else if (transcripts.length) {
      setListeningStatus(`听到 “${transcripts.at(-1)}”，再试一次`, 'retry');
    }
  };

  recognition.onerror = (event) => {
    clearTimeout(listeningTimer);
    setMicState(false);
    if (event.error === 'aborted') return;
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      showManualFallback('麦克风未开启，也可以大声读完后点下方确认');
    } else if (event.error === 'network') {
      showManualFallback('浏览器连不上在线语音识别，可大声读完后点下方确认');
    } else if (event.error === 'no-speech') {
      setListeningStatus('没有听到声音，靠近麦克风再试一次', 'retry');
    } else {
      setListeningStatus('这次没听清，再试一次吧', 'retry');
    }
  };

  recognition.onend = () => {
    clearTimeout(listeningTimer);
    if (listening) {
      setMicState(false);
      if (!collecting) setListeningStatus('没听清，再大声试一次吧', 'retry');
    }
  };

  try {
    recognition.start();
    setListeningStatus('正在开启麦克风…');
  } catch {
    setMicState(false);
    showManualFallback('麦克风暂时不可用，大声读完后点下方确认');
  }
}

function collectProduce(item) {
  if (!item || currentPicks().includes(item.id) || collecting || progress.currentLevel !== levels.findIndex((level) => level.items.some((entry) => entry.id === item.id))) return;
  collecting = true;
  const levelIndex = progress.currentLevel;
  const fruit = elements.fruitLayer.querySelector(`[data-id="${item.id}"] .produce-svg`);
  const sourceRect = fruit?.getBoundingClientRect();

  stopListening();
  progress.pickedByLevel[levelIndex] = [...currentPicks(), item.id];
  if (!collected.has(item.id)) {
    collected.add(item.id);
    progress.mastered.push(item.id);
  }
  const completed = isRoundComplete(levelIndex);
  if (completed) progress.unlockedLevel = Math.max(progress.unlockedLevel, Math.min(levelIndex + 1, levels.length - 1));
  saveProgress();
  elements.readingPanel.hidden = true;
  selectedProduce = null;
  renderAll();
  animateFlight(item, sourceRect);
  playSuccessSound();
  collecting = false;

  if (completed) {
    animateTreeGrowth();
    showToast('本关完成，小树要长高啦！', 2200);
    clearTimeout(completionTimer);
    completionTimer = setTimeout(() => showCompletion(levelIndex), 950);
  } else {
    showToast(`太棒了！${item.word} 摘下来啦`);
  }
}

function animateTreeGrowth() {
  clearTimeout(growthTimer);
  updateTreeGrowth();
  elements.treeArea.classList.remove('is-growing');
  void elements.treeArea.offsetWidth;
  elements.treeArea.classList.add('is-growing');
  growthTimer = setTimeout(() => elements.treeArea.classList.remove('is-growing'), 1400);
}

function showCompletion(levelIndex) {
  if (levelIndex !== progress.currentLevel || !isRoundComplete(levelIndex) || elements.mapDialog.open || elements.basketDialog.open) return;
  const level = levels[levelIndex];
  const partComplete = level.levelInPart === parts[level.partIndex].levels.length - 1;
  const journeyComplete = levelIndex === levels.length - 1;
  elements.completionKicker.textContent = journeyComplete ? 'LEARNING JOURNEY COMPLETE' : partComplete ? `PART ${level.partIndex + 1} COMPLETE` : `LEVEL ${levelIndex + 1} COMPLETE`;
  elements.completionTitle.textContent = journeyComplete ? '单词树长成啦！' : partComplete ? `${level.partTitle}主题完成！` : `第 ${levelIndex + 1} 关完成！`;
  elements.completionMessage.textContent = journeyComplete
    ? '6 个主题、72 个单词都收集齐了。你有一双会读英语的神奇小手！'
    : partComplete
      ? `小树又长大了一点，下一站是${levels[levelIndex + 1].partTitle}主题。`
      : '小树又长高了，4 个新单词也住进了篮子。';
  elements.completionWords.innerHTML = level.items.map((item) => `
    <div class="completion-word">${produceIcon(item.id)}<strong>${item.word}</strong><span>${item.zh}</span></div>`).join('');
  elements.nextLevel.innerHTML = journeyComplete
    ? '查看成长地图 <i data-lucide="trophy"></i>'
    : partComplete ? `进入${levels[levelIndex + 1].partTitle}主题 <i data-lucide="arrow-right"></i>` : '前往下一关 <i data-lucide="arrow-right"></i>';
  refreshIcons();
  launchConfetti();
  if (!elements.completionDialog.open) elements.completionDialog.showModal();
}

function launchConfetti() {
  const colors = ['#efbd45', '#e66f61', '#6ca767', '#72a5bd', '#a37ba5', '#f29a65'];
  elements.confetti.innerHTML = '';
  for (let index = 0; index < 42; index += 1) {
    const piece = document.createElement('span');
    piece.style.left = `${(index * 37 + 11) % 100}%`;
    piece.style.setProperty('--drift', `${(index % 7 - 3) * 24}px`);
    piece.style.setProperty('--spin', `${240 + (index % 5) * 90}deg`);
    piece.style.setProperty('--delay', `${(index % 9) * 0.055}s`);
    piece.style.background = colors[index % colors.length];
    elements.confetti.appendChild(piece);
  }
  setTimeout(() => { elements.confetti.innerHTML = ''; }, 3200);
}

function selectLevel(index, { replay = false, announce = false } = {}) {
  if (index < 0 || index > progress.unlockedLevel || index >= levels.length) return;
  clearTimeout(completionTimer);
  closeReadingPanel();
  const previousPart = currentLevel().partId;
  if (replay) progress.pickedByLevel[index] = [];
  progress.currentLevel = index;
  saveProgress();
  [elements.completionDialog, elements.mapDialog, elements.basketDialog].forEach((dialog) => {
    if (dialog.open) dialog.close();
  });
  renderAll();
  if (announce) {
    const level = currentLevel();
    showToast(replay ? '复习不会清空篮子，再大声读一遍吧' : previousPart !== level.partId ? `新主题解锁：${level.partTitle}` : `第 ${index + 1} 关开始啦`);
  }
}

function animateFlight(item, sourceRect) {
  const targetRect = elements.sceneBasket.getBoundingClientRect();
  if (!sourceRect || !targetRect.width) return;
  const flyer = document.createElement('div');
  flyer.className = 'flight-fruit';
  flyer.innerHTML = produceIcon(item.id);
  flyer.style.left = `${sourceRect.left}px`;
  flyer.style.top = `${sourceRect.top}px`;
  document.body.appendChild(flyer);

  const deltaX = targetRect.left + targetRect.width / 2 - (sourceRect.left + sourceRect.width / 2);
  const deltaY = targetRect.top + targetRect.height * 0.35 - (sourceRect.top + sourceRect.height / 2);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const animation = flyer.animate([
    { transform: 'translate(0, 0) scale(1) rotate(0deg)', opacity: 1 },
    { transform: `translate(${deltaX * 0.52}px, ${deltaY * 0.4 - 75}px) scale(.9) rotate(-14deg)`, opacity: 1, offset: .55 },
    { transform: `translate(${deltaX}px, ${deltaY}px) scale(.35) rotate(18deg)`, opacity: .45 },
  ], { duration: reduceMotion ? 1 : 850, easing: 'cubic-bezier(.45,.05,.35,1)' });
  animation.onfinish = () => {
    flyer.remove();
    elements.sceneBasket.classList.remove('bump');
    elements.basketButton.classList.remove('bump');
    void elements.sceneBasket.offsetWidth;
    elements.sceneBasket.classList.add('bump');
    elements.basketButton.classList.add('bump');
  };
}

function speakWord(word, button) {
  if (!('speechSynthesis' in window)) {
    showToast('此浏览器暂时无法播放发音');
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = 'en-US';
  utterance.rate = 0.72;
  utterance.pitch = 1.05;
  const voices = window.speechSynthesis.getVoices();
  const englishVoice = voices.find((voice) => voice.lang === 'en-US') || voices.find((voice) => voice.lang.startsWith('en'));
  if (englishVoice) utterance.voice = englishVoice;
  if (button) {
    button.classList.add('speaking');
    utterance.onend = () => button.classList.remove('speaking');
    utterance.onerror = () => button.classList.remove('speaking');
  }
  window.speechSynthesis.speak(utterance);
}

function playSuccessSound() {
  if (!soundEnabled) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume();
    [523.25, 659.25, 783.99].forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const start = audioContext.currentTime + index * 0.09;
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.09, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.32);
    });
  } catch {
    // Audio feedback is optional and never blocks collecting.
  }
}

function updateSoundButton() {
  elements.soundToggle.innerHTML = `<i data-lucide="${soundEnabled ? 'volume-2' : 'volume-x'}"></i>`;
  elements.soundToggle.setAttribute('aria-pressed', String(soundEnabled));
  elements.soundToggle.setAttribute('aria-label', soundEnabled ? '关闭音效' : '打开音效');
  refreshIcons();
}

function openBasket() {
  closeReadingPanel();
  renderBasket();
  if (!elements.basketDialog.open) elements.basketDialog.showModal();
}

function openMap() {
  closeReadingPanel();
  renderMap();
  if (!elements.mapDialog.open) elements.mapDialog.showModal();
}

function closeOnBackdrop(event, dialog) {
  if (event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
}

elements.fruitLayer.addEventListener('click', (event) => {
  const button = event.target.closest('[data-id]');
  if (button) selectProduce(button.dataset.id);
});
elements.pickMode.addEventListener('click', () => {
  setPickMode(!pickEnabled);
  if (pickEnabled) showToast('小手准备好啦，选一个单词吧');
});
elements.closeReading.addEventListener('click', closeReadingPanel);
elements.micButton.addEventListener('click', startListening);
elements.manualConfirm.addEventListener('click', () => collectProduce(selectedProduce));
elements.pronounceButton.addEventListener('click', () => {
  if (selectedProduce) speakWord(selectedProduce.word, elements.pronounceButton);
});
elements.basketButton.addEventListener('click', openBasket);
elements.sceneBasket.addEventListener('click', openBasket);
elements.closeBasket.addEventListener('click', () => elements.basketDialog.close());
elements.basketDialog.addEventListener('click', (event) => closeOnBackdrop(event, elements.basketDialog));
elements.mapButton.addEventListener('click', openMap);
elements.closeMap.addEventListener('click', () => elements.mapDialog.close());
elements.mapDialog.addEventListener('click', (event) => closeOnBackdrop(event, elements.mapDialog));
elements.mapContent.addEventListener('click', (event) => {
  const button = event.target.closest('[data-level]');
  if (!button || button.disabled) return;
  const index = Number(button.dataset.level);
  const replay = index === progress.currentLevel ? isRoundComplete(index) : isLevelMastered(index);
  selectLevel(index, { replay, announce: true });
});

elements.replayLevel.addEventListener('click', () => selectLevel(progress.currentLevel, { replay: true, announce: true }));
elements.nextLevel.addEventListener('click', () => {
  if (progress.currentLevel === levels.length - 1) {
    elements.completionDialog.close();
    openMap();
  } else {
    const nextIndex = progress.currentLevel + 1;
    selectLevel(nextIndex, { replay: isRoundComplete(nextIndex), announce: true });
  }
});
elements.completionDialog.addEventListener('cancel', (event) => event.preventDefault());

document.querySelector('.basket-tabs').addEventListener('click', (event) => {
  const tab = event.target.closest('[data-tab]');
  if (!tab) return;
  activeTab = tab.dataset.tab;
  renderBasketContent();
});
document.querySelector('.basket-tabs').addEventListener('keydown', (event) => {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  event.preventDefault();
  activeTab = activeTab === 'collected' ? 'all' : 'collected';
  renderBasketContent();
  $(`[data-tab="${activeTab}"]`).focus();
});
elements.basketContent.addEventListener('click', (event) => {
  const soundButton = event.target.closest('[data-speak]');
  if (soundButton) speakWord(soundButton.dataset.speak, soundButton);
  if (event.target.closest('[data-action="go-pick"]')) elements.basketDialog.close();
});

elements.resetButton.addEventListener('click', () => {
  if (!collected.size) {
    showToast('小树的成长之旅才刚刚开始');
    return;
  }
  elements.confirmDialog.showModal();
});
elements.cancelReset.addEventListener('click', () => elements.confirmDialog.close());
elements.confirmReset.addEventListener('click', () => {
  clearTimeout(completionTimer);
  progress = freshProgress();
  collected = new Set();
  activeTab = 'collected';
  saveProgress();
  [elements.confirmDialog, elements.basketDialog, elements.mapDialog, elements.completionDialog].forEach((dialog) => {
    if (dialog.open) dialog.close();
  });
  renderAll();
  showToast('小树苗回来啦，从水果第 1 关重新开始吧');
});
elements.soundToggle.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  try { localStorage.setItem(SOUND_KEY, soundEnabled ? 'on' : 'off'); } catch { /* Keep preference for this session. */ }
  updateSoundButton();
  if (soundEnabled) playSuccessSound();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !elements.readingPanel.hidden && !elements.basketDialog.open && !elements.mapDialog.open) closeReadingPanel();
});
window.addEventListener('resize', updateTreeGrowth);

setPickMode(true);
renderAll();
updateSoundButton();
refreshIcons();
if (isRoundComplete(progress.currentLevel)) {
  completionTimer = setTimeout(() => showCompletion(progress.currentLevel), 500);
}
