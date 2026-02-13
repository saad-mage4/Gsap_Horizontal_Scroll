gsap.registerPlugin(ScrollToPlugin);

const SECTIONS_TOTAL = document.querySelectorAll(".section").length;
// const SECTIONS_TOTAL = 6;
const track = document.getElementById("hTrack");
const outer = document.getElementById("hOuter");
const progressBar = document.getElementById("progressBar");
const navBtns = document.querySelectorAll(".nav-tabs button");
const navTabs = document.querySelectorAll("#navTabs li");
const dotParentEl = document.getElementById("dots");

// ── Snow particles ──
const snowEl = document.getElementById("snow");
for (let i = 0; i < 35; i++) {
  const s = document.createElement("span");
  const size = Math.random() * 3 + 1;
  s.style.cssText = `
  left:${Math.random() * 100}%;
  width:${size}px; height:${size}px;
  opacity:${Math.random() * 0.7 + 0.2};
  animation-duration:${Math.random() * 8 + 5}s;
  animation-delay:-${Math.random() * 12}s;
  `;
  snowEl.appendChild(s);
}

navTabs.forEach((t, i) => {
  if (i >= SECTIONS_TOTAL) {
    t.style.display = "none";
  } else {
    t.querySelector("button").dataset.index = i;
  }
});

for (let i = 0; i < SECTIONS_TOTAL; i++) {
  const dot = document.createElement("div");
  dot.className = "dot";
  if (i === 0) dot.classList.add("active");
  dot.dataset.index = i;
  dotParentEl.appendChild(dot);
}

const dotEls = document.querySelectorAll(".dot");
// ── State ──
let currentX = 0; // rendered position
let targetX = 0; // destination position
let maxX = 0; // maximum negative x (computed on resize)
let rafId = null;
let isSnapping = false;

// Lerp factor – closer to 1 = faster/snappier, lower = more floaty
const LERP = 0.072;
// Wheel sensitivity
const WHEEL_SPEED = 1.2;

function computeMax() {
  maxX = -(SECTIONS_TOTAL - 1) * window.innerWidth;
}
computeMax();

function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}

// ── Momentum RAF loop ──
function tick() {
  // Lerp current toward target
  currentX += (targetX - currentX) * LERP;

  // Stop ticking when close enough (unless snapping)
  if (Math.abs(targetX - currentX) < 0.05 && !isSnapping) {
    currentX = targetX;
    gsap.set(track, { x: currentX });
    onFrame(currentX);
    rafId = null;
    return;
  }

  gsap.set(track, { x: currentX });
  onFrame(currentX);
  rafId = requestAnimationFrame(tick);
}

function startTick() {
  if (!rafId) rafId = requestAnimationFrame(tick);
}

// ── Per-frame UI updates ──
const sectionAnimState = new Array(SECTIONS_TOTAL).fill(false);

function onFrame(x) {
  const progress = x / maxX; // 0 → 1
  const clamped = clamp(progress, 0, 1);

  // Progress bar
  progressBar.style.width = clamped * 100 + "%";

  // Active section
  const idx = Math.round(clamped * (SECTIONS_TOTAL - 1));
  setActiveSection(idx);
  triggerSectionAnims(clamped);
}

function triggerSectionAnims(progress) {
  const idx = Math.round(progress * (SECTIONS_TOTAL - 1));
  if (!sectionAnimState[idx]) {
    sectionAnimState[idx] = true;
    const sec = document.querySelectorAll(".section")[idx];
    const els = sec.querySelectorAll(".anim-fade");
    gsap.to(els, {
      opacity: 1,
      y: 0,
      duration: 0.75,
      stagger: 0.1,
      ease: "power2.out",
    });
  }
}

function setActiveSection(idx) {
  navBtns.forEach((b, i) => b.classList.toggle("active", i === idx));
  dotEls.forEach((d, i) => d.classList.toggle("active", i === idx));
}

// Show first section immediately
setTimeout(() => triggerSectionAnims(0), 80);

// ── Snap to nearest section on idle ──
let snapTimer = null;
let wheelStepped = false;

function scheduleSnap(delay) {
  clearTimeout(snapTimer);
  snapTimer = setTimeout(snapToNearest, delay);
}

// ── Wheel interception ──
window.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();

    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    let speed = delta;
    if (e.deltaMode === 1) speed *= 32;
    if (e.deltaMode === 2) speed *= window.innerHeight;

    // ── Mouse wheel: large discrete notch → snap exactly one section ──
    if (Math.abs(speed) >= 50 && !wheelStepped) {
      wheelStepped = true;
      const cur = Math.round(-currentX / window.innerWidth);
      const dir = speed > 0 ? 1 : -1;
      const next = clamp(cur + dir, 0, SECTIONS_TOTAL - 1);
      if (next !== cur) {
        goToSection(next, false, true);
        clearTimeout(snapTimer);
      }
      // re-enable after animation lands
      setTimeout(() => {
        wheelStepped = false;
      }, 950);
      return;
    }

    // ── Trackpad: small continuous deltas → free scrub, snap on idle ──
    if (Math.abs(speed) < 50) {
      wheelStepped = false;
      targetX = clamp(targetX - speed * WHEEL_SPEED, maxX, 0);
      isSnapping = false;
      startTick();
      scheduleSnap(200); // snap 200ms after last trackpad event
    }
  },
  { passive: false },
);

// ── Touch support ──
let touchStartX = 0,
  touchStartY = 0,
  touchLastX = 0;
outer.addEventListener(
  "touchstart",
  (e) => {
    touchStartX = touchLastX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  },
  { passive: true },
);

outer.addEventListener(
  "touchmove",
  (e) => {
    const dx = e.touches[0].clientX - touchLastX;
    const dy = Math.abs(e.touches[0].clientY - touchStartY);
    // Only hijack if mostly horizontal swipe
    if (Math.abs(touchStartX - e.touches[0].clientX) > dy) {
      e.preventDefault();
      targetX = clamp(targetX + dx * 1.5, maxX, 0);
      touchLastX = e.touches[0].clientX;
      isSnapping = false;
      startTick();
    }
  },
  { passive: false },
);

outer.addEventListener("touchend", () => {
  // Snap to nearest section after swipe
  snapToNearest();
});

// ── Snap to nearest section ──
function snapToNearest() {
  const sectionW = window.innerWidth;
  const nearestIdx = Math.round(-currentX / sectionW);
  goToSection(clamp(nearestIdx, 0, SECTIONS_TOTAL - 1), false, true);
}

// ── Navigate to section ──
function goToSection(idx, fromTouch = false, fast = false) {
  const dest = -idx * window.innerWidth;
  isSnapping = true;

  const duration = fast ? 0.65 : fromTouch ? 0.65 : 1.0;
  const ease = fast ? "power2.out" : fromTouch ? "power2.out" : "power3.inOut";

  gsap.killTweensOf({ v: 0 }); // cancel any in-progress snap
  gsap.to(
    { v: targetX },
    {
      v: dest,
      duration,
      ease,
      onUpdate: function () {
        targetX = this.targets()[0].v;
        startTick();
      },
      onComplete: () => {
        isSnapping = false;
      },
    },
  );
}

// ── Nav tabs & dots ──
navBtns.forEach((btn) => {
  btn.addEventListener("click", () => goToSection(+btn.dataset.index));
});
dotEls.forEach((dot) => {
  dot.addEventListener("click", () => goToSection(+dot.dataset.index));
});

// ── Keyboard navigation ──
document.addEventListener("keydown", (e) => {
  const cur = Math.round(-currentX / window.innerWidth);
  if (e.key === "ArrowRight" && cur < SECTIONS_TOTAL_TOTAL - 1)
    goToSection(cur + 1);
  if (e.key === "ArrowLeft" && cur > 0) goToSection(cur - 1);
});

// ── Resize ──
window.addEventListener("resize", () => {
  computeMax();
  // Reposition to keep current section aligned
  const cur = Math.round(-currentX / window.innerWidth);
  currentX = targetX = -cur * window.innerWidth;
  gsap.set(track, { x: currentX });
});
