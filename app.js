(() => {
  "use strict";

  const config = window.WEDDING_CONFIG;
  if (!config) {
    document.body.textContent = "Wedding configuration is missing.";
    return;
  }

  const experience = document.getElementById("experience");
  const scenes = Array.from(document.querySelectorAll("[data-scene]"));
  const sceneNav = document.getElementById("sceneNav");
  const sceneStatus = document.getElementById("sceneStatus");
  const progressBar = document.getElementById("progressBar");
  const transitionGlow = document.getElementById("transitionGlow");
  const loading = document.getElementById("loading");
  const music = document.getElementById("backgroundMusic");
  const musicButton = document.getElementById("musicButton");
  const mapLink = document.getElementById("mapLink");
  const restartButton = document.getElementById("restartButton");
  const toast = document.getElementById("toast");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const state = {
    index: 0,
    locked: false,
    unlockTimer: 0,
    glowTimer: 0,
    wheelEnergy: 0,
    wheelTimer: 0,
    touchStartX: null,
    touchStartY: null,
    touchEndX: null,
    touchEndY: null,
    toastTimer: 0,
    resumeMusic: false
  };

  const readPath = (path) => path.split(".").reduce((value, key) => value?.[key], config);

  function setViewportHeight() {
    const height = window.visualViewport?.height || window.innerHeight;
    document.documentElement.style.setProperty("--app-height", `${height}px`);
  }

  function hydrateContent() {
    document.querySelectorAll("[data-bind]").forEach((element) => {
      const value = readPath(element.dataset.bind);
      if (value !== undefined && value !== null) element.textContent = String(value);
    });

    document.querySelectorAll("[data-photo]").forEach((image) => {
      const source = image.dataset.photo === "cover" ? config.media?.coverPhoto : config.media?.portraitPhoto;
      if (source) image.src = source;
    });

    const invitationLines = document.getElementById("invitationLines");
    invitationLines.replaceChildren(...(config.copy?.invitationLines || []).map((line) => {
      const paragraph = document.createElement("p");
      paragraph.textContent = line;
      return paragraph;
    }));

    if (config.venue?.mapUrl) mapLink.href = config.venue.mapUrl;
    if (config.media?.music) music.src = config.media.music;

    const groom = config.couple?.groom || "Groom";
    const bride = config.couple?.bride || "Bride";
    document.title = `${groom} & ${bride} · Wedding Invitation`;
    const description = document.querySelector('meta[name="description"]');
    if (description) description.content = `${groom} 与 ${bride} 的婚礼电子请柬`;
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.content = `${groom} & ${bride} · Wedding Invitation`;
  }

  function createPetals() {
    const colors = [
      "linear-gradient(135deg, #fae2da, #d7838c 63%, #a12b3a)",
      "linear-gradient(135deg, #fffaf0, #ead7c5 65%, #c6a78c)",
      "linear-gradient(135deg, #d9535e, #861c2a 72%, #5d111b)"
    ];

    document.querySelectorAll("[data-petals]").forEach((layer, layerIndex) => {
      const petals = [];
      const count = Number(layer.dataset.petals) || 10;
      for (let index = 0; index < count; index += 1) {
        const seed = Math.abs(Math.sin((index + 1) * (layerIndex + 4) * 9182.317));
        const petal = document.createElement("i");
        petal.className = "petal";
        petal.style.setProperty("--x", `${(seed * 97 + index * 13) % 100}%`);
        petal.style.setProperty("--size", `${7 + ((index * 5 + layerIndex) % 10)}px`);
        petal.style.setProperty("--opacity", `${0.24 + ((index * 7) % 38) / 100}`);
        petal.style.setProperty("--blur", `${index % 5 === 0 ? 1.1 : 0}px`);
        petal.style.setProperty("--drift", `${-52 + ((index * 23 + layerIndex * 17) % 104)}px`);
        petal.style.setProperty("--duration", `${9 + ((index * 1.7 + layerIndex) % 8)}s`);
        petal.style.setProperty("--delay", `${-((index * 2.2 + layerIndex) % 14)}s`);
        petal.style.setProperty("--petal-color", colors[(index + layerIndex) % colors.length]);
        petals.push(petal);
      }
      layer.replaceChildren(...petals);
    });
  }

  function buildNavigation() {
    const buttons = scenes.map((scene, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.index = String(index);
      button.setAttribute("aria-label", `前往第 ${index + 1} 页：${scene.dataset.label}`);
      button.addEventListener("click", () => goTo(index));
      return button;
    });
    sceneNav.replaceChildren(...buttons);
  }

  function restoreHash() {
    const match = location.hash.match(/^#scene-(\d+)$/);
    if (!match) return;
    const index = Number(match[1]) - 1;
    if (Number.isInteger(index)) state.index = Math.max(0, Math.min(scenes.length - 1, index));
  }

  function updateSceneState() {
    scenes.forEach((scene, index) => {
      const active = index === state.index;
      scene.classList.toggle("is-active", active);
      scene.classList.toggle("is-before", index < state.index);
      scene.classList.toggle("is-after", index > state.index);
      scene.setAttribute("aria-hidden", String(!active));
      if ("inert" in scene) scene.inert = !active;
    });

    Array.from(sceneNav.children).forEach((button, index) => {
      if (index === state.index) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    });

    const current = scenes[state.index];
    experience.dataset.kind = current.dataset.kind || "custom";
    progressBar.style.width = `${((state.index + 1) / scenes.length) * 100}%`;
    sceneStatus.textContent = `第 ${state.index + 1} 页，共 ${scenes.length} 页：${current.dataset.label}`;
    history.replaceState(null, "", `#scene-${state.index + 1}`);
  }

  function runTransition() {
    transitionGlow.classList.remove("run");
    void transitionGlow.offsetWidth;
    transitionGlow.classList.add("run");
    clearTimeout(state.glowTimer);
    state.glowTimer = window.setTimeout(() => transitionGlow.classList.remove("run"), 1420);
  }

  function goTo(nextIndex, { force = false } = {}) {
    const bounded = Math.max(0, Math.min(scenes.length - 1, nextIndex));
    if ((!force && bounded === state.index) || state.locked) return;

    state.index = bounded;
    state.locked = !reducedMotion.matches;
    updateSceneState();
    runTransition();

    clearTimeout(state.unlockTimer);
    state.unlockTimer = window.setTimeout(() => {
      state.locked = false;
    }, reducedMotion.matches ? 30 : 790);
  }

  const next = () => goTo(state.index + 1);
  const previous = () => goTo(state.index - 1);

  function onWheel(event) {
    if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
    event.preventDefault();
    if (state.locked) return;

    state.wheelEnergy += event.deltaY;
    clearTimeout(state.wheelTimer);
    state.wheelTimer = window.setTimeout(() => { state.wheelEnergy = 0; }, 170);
    if (Math.abs(state.wheelEnergy) < 30) return;

    const direction = state.wheelEnergy > 0 ? 1 : -1;
    state.wheelEnergy = 0;
    goTo(state.index + direction);
  }

  function onTouchStart(event) {
    if (event.touches.length !== 1) return;
    state.touchStartX = event.touches[0].clientX;
    state.touchStartY = event.touches[0].clientY;
    state.touchEndX = state.touchStartX;
    state.touchEndY = state.touchStartY;
  }

  function onTouchMove(event) {
    if (state.touchStartY === null || event.touches.length !== 1) return;
    state.touchEndX = event.touches[0].clientX;
    state.touchEndY = event.touches[0].clientY;
    if (Math.abs(state.touchStartY - state.touchEndY) > 8) event.preventDefault();
  }

  function onTouchEnd() {
    if (state.touchStartY === null || state.touchEndY === null) return;
    const deltaY = state.touchStartY - state.touchEndY;
    const deltaX = state.touchStartX - state.touchEndX;
    state.touchStartX = state.touchStartY = state.touchEndX = state.touchEndY = null;

    if (Math.abs(deltaY) < 42 || Math.abs(deltaY) < Math.abs(deltaX) * 1.15) return;
    goTo(state.index + (deltaY > 0 ? 1 : -1));
  }

  function onKeyDown(event) {
    const activeTag = document.activeElement?.tagName;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(activeTag)) return;

    if (event.key === " " && !["BUTTON", "A"].includes(activeTag)) {
      event.preventDefault();
      event.shiftKey ? previous() : next();
      return;
    }

    const actions = {
      ArrowDown: next,
      PageDown: next,
      ArrowRight: next,
      ArrowUp: previous,
      PageUp: previous,
      ArrowLeft: previous,
      Home: () => goTo(0),
      End: () => goTo(scenes.length - 1)
    };
    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  }

  function showToast(message) {
    clearTimeout(state.toastTimer);
    toast.textContent = message;
    toast.classList.add("show");
    state.toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2500);
  }

  function setMusicState(playing) {
    musicButton.classList.toggle("is-playing", playing);
    musicButton.setAttribute("aria-pressed", String(playing));
    musicButton.setAttribute("aria-label", playing ? "暂停婚礼音乐" : "播放婚礼音乐");
  }

  async function toggleMusic() {
    if (!music.src) {
      showToast("请先在 config.js 中配置音乐文件");
      return;
    }
    if (!music.paused) {
      music.pause();
      return;
    }
    try {
      await music.play();
      showToast(config.media?.musicTitle || "婚礼音乐已播放");
    } catch (error) {
      console.error("Music playback failed", error);
      showToast("音乐暂时无法播放，请再次点击");
    }
  }

  function wireEvents() {
    document.querySelectorAll("[data-next]").forEach((button) => button.addEventListener("click", next));
    restartButton.addEventListener("click", () => goTo(0));
    musicButton.addEventListener("click", toggleMusic);
    music.addEventListener("play", () => setMusicState(true));
    music.addEventListener("pause", () => setMusicState(false));
    music.addEventListener("error", () => {
      setMusicState(false);
      showToast("音乐文件未找到，请检查 config.js");
    });

    experience.addEventListener("wheel", onWheel, { passive: false });
    experience.addEventListener("touchstart", onTouchStart, { passive: true });
    experience.addEventListener("touchmove", onTouchMove, { passive: false });
    experience.addEventListener("touchend", onTouchEnd, { passive: true });
    experience.addEventListener("touchcancel", onTouchEnd, { passive: true });
    document.addEventListener("keydown", onKeyDown);

    window.addEventListener("resize", () => {
      clearTimeout(window.__weddingResizeTimer);
      window.__weddingResizeTimer = window.setTimeout(setViewportHeight, 100);
    });
    window.visualViewport?.addEventListener("resize", setViewportHeight);

    window.addEventListener("hashchange", () => {
      const match = location.hash.match(/^#scene-(\d+)$/);
      if (!match) return;
      const index = Number(match[1]) - 1;
      if (Number.isInteger(index) && index !== state.index) goTo(index);
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden && !music.paused) {
        state.resumeMusic = true;
        music.pause();
      } else if (!document.hidden && state.resumeMusic) {
        state.resumeMusic = false;
        music.play().catch(() => undefined);
      }
    });
  }

  async function preloadCriticalAssets() {
    const sources = [
      config.media?.coverPhoto,
      config.media?.portraitPhoto,
      "assets/raster/curtain-left.webp",
      "assets/raster/curtain-right.webp",
      "assets/raster/floral-side.webp",
      "assets/raster/floral-bottom.webp",
      "assets/scenes/scene-2.webp"
    ].filter(Boolean);

    const loads = sources.map((source) => new Promise((resolve) => {
      const image = new Image();
      image.onload = resolve;
      image.onerror = resolve;
      image.src = source;
    }));

    await Promise.race([
      Promise.all(loads),
      new Promise((resolve) => window.setTimeout(resolve, 2600))
    ]);

    loading.classList.add("is-hidden");
    window.setTimeout(() => loading.remove(), 800);
  }

  function init() {
    setViewportHeight();
    hydrateContent();
    createPetals();
    buildNavigation();
    restoreHash();
    updateSceneState();
    wireEvents();
    preloadCriticalAssets();
  }

  init();

  window.WEDDING_APP = Object.freeze({
    next,
    previous,
    goTo,
    get currentScene() { return state.index + 1; }
  });
})();
