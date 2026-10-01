// Keep the screen picker usable if the optional animation module is blocked.
const screens = {
  home: {
    src: "/screenshots/yoeo-home.png",
    altKey: "shotHomeAlt",
    height: 760,
  },
  results: {
    src: "/screenshots/yoeo-results.png",
    altKey: "shotResultsAlt",
    height: 800,
  },
  evidence: {
    src: "/screenshots/yoeo-evidence.png",
    altKey: "shotEvidenceAlt",
    height: 712,
  },
};

const shot = document.querySelector("#feature-shot");
const controls = [...document.querySelectorAll("[data-screen]")];
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let animateScreen;
let selectedScreen = "results";
let changing = false;
let queuedScreen = null;

Object.values(screens).forEach(({ src }) => { const image = new Image(); image.src = src; });

async function showScreen(key) {
  if (!shot || !screens[key] || key === selectedScreen) return;
  if (changing) { queuedScreen = key; return; }
  changing = true;
  controls.forEach((button) => {
    const active = button.dataset.screen === key;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  if (animateScreen && !reducedMotion) {
    await animateScreen(shot, { opacity: 0, y: 14 }, { duration: 0.18 });
  }
  const next = screens[key];
  shot.src = next.src;
  shot.alt = window.yoeoSiteT?.(next.altKey) || next.altKey;
  shot.height = next.height;
  await shot.decode().catch(() => {});
  if (animateScreen && !reducedMotion) {
    await animateScreen(shot, { opacity: 1, y: 0 }, {
      duration: 0.48,
      ease: [0.22, 1, 0.36, 1],
    });
  } else {
    shot.style.opacity = "1";
    shot.style.transform = "none";
  }
  selectedScreen = key;
  changing = false;
  if (queuedScreen && queuedScreen !== key) {
    const queued = queuedScreen;
    queuedScreen = null;
    void showScreen(queued);
  } else {
    queuedScreen = null;
  }
}

controls.forEach((button) => button.addEventListener("click", () => {
  void showScreen(button.dataset.screen);
}));
window.addEventListener("yoeo:languagechange", () => {
  if (shot) shot.alt = window.yoeoSiteT?.(screens[selectedScreen].altKey) || shot.alt;
});
if (shot) shot.alt = window.yoeoSiteT?.(screens[selectedScreen].altKey) || shot.alt;

if (!reducedMotion) {
  import("https://cdn.jsdelivr.net/npm/motion@12/+esm").then(({ animate, inView }) => {
    animateScreen = animate;
    const ease = [0.22, 1, 0.36, 1];
    animate(".hero-text > *", { opacity: [0, 1], y: [24, 0] }, {
      duration: 0.72,
      delay: (index) => 0.08 + index * 0.1,
      ease,
    });
    animate(".phone-shot", { opacity: [0, 1], x: [22, 0], rotate: [1, 2] }, {
      duration: 1,
      delay: 0.22,
      ease,
    });
    inView(".steps .card, [data-reveal], .quote", (element) => {
      animate(element, { opacity: [0, 1], y: [28, 0] }, { duration: 0.72, ease });
    }, { margin: "0px 0px -70px 0px" });
  }).catch(() => {
    // Content and screen picker remain usable without motion.
  });
}
