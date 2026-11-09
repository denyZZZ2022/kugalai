const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = window.matchMedia("(pointer: fine)").matches;

/* Telegram --------------------------------------------------------------- */

const tg = window.Telegram?.WebApp;

function initTelegram() {
  if (!tg) return;
  try {
    tg.ready();
    tg.expand();
    tg.setHeaderColor?.("#07080b");
    tg.setBackgroundColor?.("#07080b");
    tg.disableVerticalSwipes?.();
    tg.BackButton?.hide?.();
  } catch {
    /* Telegram WebApp API is optional — the page must work in any browser. */
  }
}

function haptic() {
  try {
    tg?.HapticFeedback?.impactOccurred?.("light");
  } catch {
    /* no-op */
  }
}

/* Header ----------------------------------------------------------------- */

function initHeader() {
  const header = document.getElementById("siteHeader");
  if (!header) return;
  const update = () => header.classList.toggle("is-scrolled", window.scrollY > 18);
  update();
  window.addEventListener("scroll", update, { passive: true });
}

/* Reveal ----------------------------------------------------------------- */

function initReveal() {
  const items = [...document.querySelectorAll(".reveal")];
  if (!items.length) return;

  items.forEach((item) => {
    const delay = Number(item.dataset.delay || 0);
    if (delay) item.style.transitionDelay = `${delay}ms`;
  });

  if (reduceMotion || !("IntersectionObserver" in window)) {
    items.forEach((item) => item.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
  );

  items.forEach((item) => observer.observe(item));
}

/* Subtle 3D tilt on the hero mockup -------------------------------------- */

function initTilt() {
  if (reduceMotion || !finePointer) return;
  const card = document.querySelector("[data-tilt]");
  if (!card) return;

  let frame = 0;
  let targetX = 0;
  let targetY = 0;

  const render = () => {
    frame = 0;
    card.style.setProperty("--tilt-x", targetX.toFixed(2));
    card.style.setProperty("--tilt-y", targetY.toFixed(2));
  };

  card.addEventListener("pointermove", (event) => {
    const rect = card.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    targetX = -y * 5;
    targetY = x * 7;
    if (!frame) frame = requestAnimationFrame(render);
  });

  card.addEventListener("pointerleave", () => {
    targetX = 0;
    targetY = 0;
    if (!frame) frame = requestAnimationFrame(render);
  });
}

/* App plumbing ----------------------------------------------------------- */

function initYear() {
  const year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
}

function initHaptics() {
  document.querySelectorAll("[data-haptic]").forEach((element) => {
    element.addEventListener("click", haptic);
  });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol !== "https:") return;
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

initTelegram();
initHeader();
initReveal();
initTilt();
initYear();
initHaptics();
registerServiceWorker();
