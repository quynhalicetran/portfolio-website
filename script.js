
(function initLoader(){
  const loader = document.getElementById("loader");
  if (!loader) return;

  const pctEl = document.getElementById("loaderPct");
  const fillEl = document.getElementById("loaderFill");
  const bikeEl = document.getElementById("loaderBike");
  const obstacles = Array.from(loader.querySelectorAll(".loader-obstacle"));

  let p = 0;
  let done = false;
  let lastBonk = new Set();

  function clamp01(x){ return Math.max(0, Math.min(1, x)); }

  function readyTarget(){
    switch (document.readyState){
      case "loading": return 0.35;
      case "interactive": return 0.75;
      case "complete": return 0.92;
      default: return 0.35;
    }
  }

  function render(){
    const pct = Math.round(p * 100);
    if (pctEl) pctEl.textContent = `${pct}%`;
    if (fillEl) fillEl.style.width = `${pct}%`;
    if (bikeEl){
      bikeEl.style.left = `calc(14px + (${pct}% * (100% - 28px) / 100))`;
    }

    obstacles.forEach((o, i) => {
      const at = parseFloat(o.getAttribute("data-at") || "0");
      const passed = p >= at;
      o.classList.toggle("passed", passed);

      if (passed && !lastBonk.has(i)){
        lastBonk.add(i);
        o.classList.add("bonk");
        setTimeout(() => o.classList.remove("bonk"), 220);
      }
      if (!passed && lastBonk.has(i)){
        lastBonk.delete(i);
      }
    });
  }

  const t0 = performance.now();
  function tick(t){
    if (done) return;
    const target = readyTarget();
    const timeBoost = Math.min(0.9, (t - t0) / 1200) * 0.9;
    const softTarget = Math.max(target, timeBoost);

    p += (softTarget - p) * 0.08;
    p = clamp01(p);

    render();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  window.addEventListener("load", () => {
    let i = 0;
    const fin = setInterval(() => {
      i++;
      p = clamp01(p + 0.06);
      render();
      if (p >= 1 || i > 40){
        clearInterval(fin);
        done = true;
        loader.classList.add("hide");
        document.body.classList.remove("is-loading");
        setTimeout(() => loader.remove(), 450);
      }
    }, 16);
  }, { once: true });
})();

const route = [
  { id: "contacts", title: "Contacts" },
  { id: "resume", title: "Resume" },
  { id: "education", title: "Education" },
  { id: "experience", title: "Experience" },
  { id: "game", title: "Game Break" },
    { id: "badges", title: "Badges" },
  { id: "projects", title: "Projects" },
  { id: "skills", title: "Skills" },
  { id: "interests", title: "Interests" },
  { id: "finish", title: "Finish" }
];
(function setTopbarHeightVar(){
  const topbar = document.querySelector(".topbar");
  if (!topbar) return;

  function update(){
    const h = Math.ceil(topbar.getBoundingClientRect().height);
    document.documentElement.style.setProperty("--topbarH", `${h}px`);
  }

  update();
  window.addEventListener("resize", update);
  window.addEventListener("load", update);
})();

const routeBoard = document.getElementById("routeBoard");
const stops = Array.from(document.querySelectorAll(".stop"));
const stopsUl = document.getElementById("stops");
const bike = document.getElementById("bike");
const sidebar = document.getElementById("sidebar");
const finishBand = document.getElementById("finishBand");

const toast = document.getElementById("toast");
const toastText = document.getElementById("toastText");
const bigAlert = document.getElementById("bigAlert");
const bigAlertText = document.getElementById("bigAlertText");

const sections = route.map(r => document.getElementById(r.id));

const idToIndex = new Map(route.map((r, i) => [r.id, i]));
const targetToIndex = new Map(stops.map((el, i) => [el.getAttribute("data-target"), i]));

function getStickyOffset(){
  const topbar = document.querySelector(".topbar");
  const sidebar = document.querySelector(".sidebar");

  const topbarH = topbar ? topbar.getBoundingClientRect().height : 0;
  const sidebarOnTop = window.matchMedia("(max-width: 1100px)").matches;
  const sidebarH = (sidebarOnTop && sidebar) ? sidebar.getBoundingClientRect().height : 0;
  const gap = 12;

  return topbarH + (sidebarOnTop ? (sidebarH + gap) : 0) + gap;
}

function scrollToSectionWithOffset(el){
  if (!el) return;
  const y = window.scrollY + el.getBoundingClientRect().top - getStickyOffset();
  window.scrollTo({ top: y, behavior: "smooth" });
}


function ensureStopVisible(idx){
  if (!stopsUl) return;
  if (stopsUl.scrollWidth <= stopsUl.clientWidth + 2) return;

  const item = stops[idx];
  if (!item) return;

  const itemRect = item.getBoundingClientRect();
  const boxRect = stopsUl.getBoundingClientRect();
  const delta = (itemRect.left - boxRect.left) - (boxRect.width/2 - itemRect.width/2);

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  stopsUl.scrollBy({ left: delta, behavior: reduced ? "auto" : "smooth" });
}

let dockedIndex = 0;
let activeIndex = 0;
let navLockIndex = null;
let finishLocked = false;

let toastTimer = null;
let bigAlertTimer = null;

let boardCenters = [];

let bikePos = { x: -9999, y: -9999 };
let bikeTarget = { x: -9999, y: -9999 };
let bikeAnimating = false;

let dragging = false;
let dragOffset = { x: 0, y: 0 };

let scrollRAF = null;

let BIKE_SIZE = 52;
function updateBikeSize(){
  const w = bike?.getBoundingClientRect().width;
  BIKE_SIZE = Math.round(w || 52);
}

function showToast(msg = "Don't skip stops.", big = false) {
  toastText.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), big ? 2000 : 1400);
}

function showBigMessage(msg, variant = "warn") {
  bigAlertText.textContent = msg;
  bigAlert.classList.toggle("danger", variant === "danger");
  bigAlert.classList.add("show");

  clearTimeout(bigAlertTimer);
  bigAlertTimer = setTimeout(() => {
    bigAlert.classList.remove("show");
  }, 1800);
}

function setDangerMode(on){
  sidebar.classList.toggle("is-danger", !!on);
}

function isSkipAttempt(fromIdx, toIdx){
  return Math.abs(toIdx - fromIdx) > 1;
}

function setActive(idx) {
  activeIndex = idx;
  stops.forEach((s, i) => s.classList.toggle("is-active", i === idx));
  ensureStopVisible(idx);
}

function updateParkingSpots(){
  stops.forEach((stop, i) => {
    const dock = stop.querySelector(".bike-dock");
    if (!dock) return;
    dock.classList.toggle("has-bike", i === dockedIndex);
  });
}

function setDocked(idx) {
  dockedIndex = idx;
  stops.forEach((s, i) => s.classList.toggle("is-docked", i === idx));
  updateParkingSpots();
}

function setFinishMode(on){
  sidebar.classList.toggle("is-finish", !!on);
}

function computeDockCenters(){
  if (!routeBoard) return;
  const boardRect = routeBoard.getBoundingClientRect();

  boardCenters = stops.map(stop => {
    const dock = stop.querySelector(".bike-dock");
    const r = dock.getBoundingClientRect();

    const cx = (r.left - boardRect.left) + (r.width / 2);
    const cy = (r.top  - boardRect.top)  + (r.height / 2);
    return { cx, cy };
  });
}

function renderBike(){
  bike.style.transform = `translate3d(${bikePos.x}px, ${bikePos.y}px, 0)`;
}

let lastAnimT = 0;

function animateBike(t){
  bikeAnimating = true;
  if (!lastAnimT) lastAnimT = t;

  const dt = Math.min(32, t - lastAnimT);
  lastAnimT = t;

  const k = 18; 
  const alpha = 1 - Math.exp(-k * dt / 1000);

  bikePos.x += (bikeTarget.x - bikePos.x) * alpha;
  bikePos.y += (bikeTarget.y - bikePos.y) * alpha;

  renderBike();

  if (Math.abs(bikeTarget.x - bikePos.x) < 0.15 && Math.abs(bikeTarget.y - bikePos.y) < 0.15){
    bikePos.x = bikeTarget.x;
    bikePos.y = bikeTarget.y;
    renderBike();
    bikeAnimating = false;
    lastAnimT = 0;
    return;
  }

  requestAnimationFrame(animateBike);
}


function setBikeTargetTopLeft(x, y){
  bikeTarget.x = x;
  bikeTarget.y = y;
  if (!bikeAnimating) requestAnimationFrame(animateBike);
}


function dockBikeAtIndex(idx, {instant=false} = {}){
  if (!boardCenters.length) return;
  setActive(idx);
  setDocked(idx);

  const c = boardCenters[idx];
  const targetX = c.cx - (BIKE_SIZE / 2);
  const targetY = c.cy - (BIKE_SIZE / 2);

  if (instant){
    bikePos.x = targetX;
    bikePos.y = targetY;
    bikeTarget.x = targetX;
    bikeTarget.y = targetY;
    renderBike();
    bikeAnimating = false;
    return;
  }
  setBikeTargetTopLeft(targetX, targetY);
}

function getIndexByScroll(){
  const snap = getStickyOffset() + 10;
  let a = 0;

  for (let i = 0; i < sections.length; i++){
    const el = sections[i];
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    if (rect.top <= snap) a = i;
  }
  return a;
}

function atFinish(){
  const doc = document.documentElement;
  const nearBottom = (window.scrollY + window.innerHeight) >= (doc.scrollHeight - 8);
  const finishEl = document.getElementById("finish");
  const off = getStickyOffset();
  const finishHitLine = !!finishEl && finishEl.getBoundingClientRect().top <= (off + 10);
  const bandInView = !!finishBand && finishBand.getBoundingClientRect().top <= (window.innerHeight * 0.85);
  return nearBottom || finishHitLine || bandInView;
}

function syncDockFromScroll(){
  if (!document.body.classList.contains("ride-started")) return;
  if (dragging) return;

  setDangerMode(false);

  computeDockCenters();
  if (!boardCenters.length) return;

  const finished = atFinish();
  const lastIdx = route.length - 1;

  if (finished){
    finishLocked = true;
    setFinishMode(true);
    navLockIndex = lastIdx;
    dockBikeAtIndex(lastIdx);
    return;
  }

  if (finishLocked && !finished){
    finishLocked = false;
    setFinishMode(false);
    navLockIndex = null;
  } else {
    setFinishMode(false);
  }

  if (navLockIndex !== null){
    dockBikeAtIndex(navLockIndex);
    if (getIndexByScroll() === navLockIndex){
      navLockIndex = null;
    }
    return;
  }

  dockBikeAtIndex(getIndexByScroll());
}
function warnIfSkip(fromIdx, toIdx){
  if (isSkipAttempt(fromIdx, toIdx)){
    showBigMessage("Please don't skip stops", "warn");
  }
}

function bindSidebarClicks(){
  stops.forEach((stopEl) => {
    stopEl.addEventListener("click", (e) => {
      if (!document.body.classList.contains("ride-started")) return;

      e.preventDefault();
      const target = stopEl.getAttribute("data-target");
      const idx = targetToIndex.get(target);
      if (typeof idx !== "number") return;

      warnIfSkip(dockedIndex, idx);

      navLockIndex = idx;
      finishLocked = false;
      setFinishMode(false);

      computeDockCenters();
      dockBikeAtIndex(idx);
      scrollToSectionWithOffset(sections[idx]);

    });
  });
}

function bindNavButtons(){
  document.querySelectorAll('a[data-nav]').forEach((a) => {
    a.addEventListener("click", (e) => {
      if (!document.body.classList.contains("ride-started")){
        startRide(false);
      }
      e.preventDefault();
      const id = a.getAttribute("data-nav");
      const idx = idToIndex.get(id);
      if (typeof idx !== "number") return;

      navLockIndex = idx;
      finishLocked = false;
      setFinishMode(false);

      computeDockCenters();
      dockBikeAtIndex(idx);
      scrollToSectionWithOffset(sections[idx]);
      warnIfSkip(dockedIndex, idx);

    });
  });
}

function startRide(scrollToEducation = true){
  document.body.classList.add("ride-started");

  requestAnimationFrame(() => {
    dockedIndex = 0;
    activeIndex = 0;
    navLockIndex = null;
    finishLocked = false;
    setFinishMode(false);
    setDangerMode(false);

    updateBikeSize();
    computeDockCenters();
    dockBikeAtIndex(0, {instant:true});
syncDockFromScroll();
syncIntroVisibility();

    if (scrollToEducation){
      navLockIndex = 0;
      scrollToSectionWithOffset(sections[0]); 
    }
  });
}

function getNearestDockIndexFromBikeTopLeft(x, y){
  const cx = x + (BIKE_SIZE / 2);
  const cy = y + (BIKE_SIZE / 2);

  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < boardCenters.length; i++){
    const dx = boardCenters[i].cx - cx;
    const dy = boardCenters[i].cy - cy;
    const d = dx*dx + dy*dy;
    if (d < bestD){
      bestD = d;
      best = i;
    }
  }
  return best;
}

function markDropTarget(idx){
  stops.forEach((s,i)=> s.classList.toggle("is-drop-target", i === idx));
}

bike.addEventListener("pointerdown", (e) => {
  if (!document.body.classList.contains("ride-started")) return;

  dragging = true;
  bike.classList.add("dragging");
  bike.setPointerCapture(e.pointerId);

  const bikeRect = bike.getBoundingClientRect();
  dragOffset.x = (e.clientX - bikeRect.left);
  dragOffset.y = (e.clientY - bikeRect.top);

  navLockIndex = null;
  finishLocked = false;
  setFinishMode(false);

  setDangerMode(false);

  computeDockCenters();
  markDropTarget(dockedIndex);
});

bike.addEventListener("pointermove", (e) => {
  if (!dragging) return;

  const boardRect = routeBoard.getBoundingClientRect();
  const rawX = (e.clientX - boardRect.left) - dragOffset.x;
  const rawY = (e.clientY - boardRect.top)  - dragOffset.y;

  const maxX = boardRect.width  - BIKE_SIZE;
  const maxY = boardRect.height - BIKE_SIZE;

  const clampedX = Math.min(Math.max(rawX, 0), maxX);
  const clampedY = Math.min(Math.max(rawY, 0), maxY);

  const outOfLane = (rawX !== clampedX) || (rawY !== clampedY);

  if (outOfLane){
    if (!sidebar.classList.contains("is-danger")){
      showBigMessage("Dangerous! Stay in your bike lane!", "danger");
    }
    setDangerMode(true);
  } else {
    setDangerMode(false);
  }

  setBikeTargetTopLeft(clampedX, clampedY);

  computeDockCenters();
  const near = getNearestDockIndexFromBikeTopLeft(clampedX, clampedY);
  markDropTarget(near);
});

function endDrag(e){
  if (!dragging) return;
  dragging = false;
bike.classList.remove("dragging");
bike.classList.add("just-dropped");
setTimeout(() => bike.classList.remove("just-dropped"), 180);

  setDangerMode(false);
  computeDockCenters();

  const boardRect = routeBoard.getBoundingClientRect();
  const rawX = (e.clientX - boardRect.left) - dragOffset.x;
  const rawY = (e.clientY - boardRect.top)  - dragOffset.y;

  const maxX = boardRect.width  - BIKE_SIZE;
  const maxY = boardRect.height - BIKE_SIZE;

  const x = Math.min(Math.max(rawX, 0), maxX);
  const y = Math.min(Math.max(rawY, 0), maxY);

  const idx = getNearestDockIndexFromBikeTopLeft(x, y);

  warnIfSkip(dockedIndex, idx);

  dockBikeAtIndex(idx);
  navLockIndex = idx;

  finishLocked = false;
  setFinishMode(false);

  scrollToSectionWithOffset(sections[idx]);

  setTimeout(() => stops.forEach(s => s.classList.remove("is-drop-target")), 450);
  return;
}

bike.addEventListener("pointerup", endDrag);
bike.addEventListener("pointercancel", endDrag);

let stopsScrollRAF = null;
if (stopsUl){
  stopsUl.addEventListener("scroll", () => {
    if (!document.body.classList.contains("ride-started")) return;
    if (dragging) return;
    if (stopsScrollRAF) return;

    stopsScrollRAF = requestAnimationFrame(() => {
      stopsScrollRAF = null;
      computeDockCenters();
      const c = boardCenters[dockedIndex];
      if (!c) return;

      const targetX = c.cx - (BIKE_SIZE / 2);
      const targetY = c.cy - (BIKE_SIZE / 2);

      bikePos.x = targetX;
      bikePos.y = targetY;
      bikeTarget.x = targetX;
      bikeTarget.y = targetY;
      renderBike();
    });
  }, { passive: true });
}

const startBtn = document.getElementById("startRideBtn");
if (startBtn){
  startBtn.addEventListener("click", (e) => {
    e.preventDefault();
    startRide(true);
  });
}
// fix the start ride

bindSidebarClicks();
bindNavButtons();
startRide(false);


window.addEventListener("scroll", () => {
  if (!document.body.classList.contains("ride-started")) return;
  if (scrollRAF) return;
  scrollRAF = requestAnimationFrame(() => {
    scrollRAF = null;
    syncDockFromScroll();
  });
}, { passive: true });

window.addEventListener("resize", () => {
  if (!document.body.classList.contains("ride-started")) return;
  updateBikeSize();
  computeDockCenters();
  dockBikeAtIndex(dockedIndex, {instant:true});
  syncDockFromScroll();
});

(function initDinoGame(){
  const canvas = document.getElementById("dinoGame");
  const hint = document.getElementById("gameHint");
  if (!canvas) return;

  const speedSlider = document.getElementById("speedSlider");
  const speedValue = document.getElementById("speedValue");

  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;

  //game over board fix
  const BASE_W = canvas.width;  
const BASE_H = canvas.height; 

function resizeCanvas(){
  const parentW = canvas.parentElement ? canvas.parentElement.clientWidth : BASE_W;

  const cssW = Math.min(BASE_W, parentW);
  const cssH = Math.round(cssW * (BASE_H / BASE_W));

  canvas.style.width = cssW + "px";
  canvas.style.height = cssH + "px";

  const DPR = Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));
  canvas.width  = Math.round(cssW * DPR);
  canvas.height = Math.round(cssH * DPR);
  ctx.setTransform(canvas.width / BASE_W, 0, 0, canvas.height / BASE_H, 0, 0);

  ctx.imageSmoothingEnabled = true;
  ctx.textRendering = "geometricPrecision";
}

resizeCanvas();
window.addEventListener("resize", resizeCanvas);

const W = BASE_W;
const H = BASE_H;


  const bikeImg = new Image();
bikeImg.src = "icons/bike-icon.png";

  let running = false;
  let started = false;
  let gameOver = false;

  let score = 0;
  let hiScore = 0;

  const groundY = H - 34;
  const gravity = 0.85;
  const jumpVel = -13.2;

  const player = { x: 70, y: groundY, w: 52, h: 52, vy: 0, onGround: true };

  const obstacleTypes = [
    { emoji: "🐀", size: 48, yMode: "ground" },
    { emoji: "🚕", size: 50, yMode: "ground" },
    { emoji: "🐦", size: 46, yMode: "air" }
  ];

  let speed = 7.2;
  let speedMult = 1.0;
  let distanceToNext = 260;
  const obstacles = [];

  const clouds = Array.from({length: 4}).map((_,i)=>({ x: 160 + i*220, y: 30 + (i%2)*18, s: 0.35 + (i%3)*0.08 }));

  function rand(min, max){ return min + Math.random() * (max - min); }
  function updateSpeedUI(){ if (speedValue) speedValue.textContent = `${speedMult.toFixed(1)}×`; }
  if (speedSlider){
    speedSlider.addEventListener("input", () => {
      speedMult = parseFloat(speedSlider.value) || 1.0;
      updateSpeedUI();
    });
  }
  updateSpeedUI();

  function showHint(text){ if (!hint) return; hint.textContent = text; hint.classList.add("show"); }
  function hideHint(){ if (!hint) return; hint.classList.remove("show"); }

  function reset(){
    running = false; started = false; gameOver = false; score = 0;
    speed = 6.2; distanceToNext = 260; obstacles.length = 0;
    player.y = groundY; player.vy = 0; player.onGround = true;
    showHint("Press Space/↑ or Tap/Click the screen");
    draw();
  }

  function start(){ if (gameOver) return; started = true; running = true; hideHint(); }
  function restart(){ reset(); start(); }
  function jump(){
    if (!started) start();
    if (gameOver) { restart(); return; }
    if (player.onGround){ player.vy = jumpVel; player.onGround = false; }
  }

  function addObstacle(){
    const t = obstacleTypes[Math.floor(Math.random() * obstacleTypes.length)];
    const size = t.size;
    let bottomY = groundY + 18;
    if (t.yMode === "air"){ bottomY = (groundY + 18) - rand(36, 58); }
    obstacles.push({
      x: W + 20, bottomY, emoji: t.emoji, size, w: size, h: size,
      bobAmp: rand(2.0, 5.0), bobSpeed: rand(0.05, 0.09), bobPhase: rand(0, Math.PI * 2)
    });
  }

  function collides(ax, ay, aw, ah, bx, by, bw, bh){
    return (ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by);
  }

  function drawGround(){
    ctx.fillStyle = "rgba(11,42,60,0.22)";
    ctx.fillRect(0, groundY + 18, W, 2);
    ctx.fillStyle = "rgba(11,42,60,0.22)";
    for (let i = 0; i < 40; i++){
      const x = (i * 28 + (score*2)) % (W + 28) - 28;
      ctx.fillRect(x, groundY + 21, 10, 2);
    }
  }

  function drawClouds(){
    ctx.fillStyle = "rgba(11,42,60,0.10)";
    clouds.forEach(c=>{
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, 16, 8, 0, 0, Math.PI*2);
      ctx.ellipse(c.x+14, c.y+2, 13, 7, 0, 0, Math.PI*2);
      ctx.ellipse(c.x-14, c.y+2, 13, 7, 0, 0, Math.PI*2);
      ctx.fill();
    });
  }

  function drawPlayer(){
    const drawX = player.x;
    const drawY = player.y - player.h;
    const imgOk = bikeImg.complete && bikeImg.naturalWidth > 0;
    if (!imgOk){
      ctx.fillStyle = "rgba(11,42,60,0.85)";
      ctx.fillRect(drawX, drawY, player.w, player.h);
      return;
    }
    ctx.drawImage(bikeImg, drawX, drawY, player.w, player.h);
  }

  function drawEmojiPopping(emoji, x, bottomY, size, bobOffset, glowStrength){
    const y = bottomY - bobOffset;

    const shadowW = size * 0.62;
    const shadowH = Math.max(6, size * 0.14);
    const shadowX = x + size * 0.5;
    const shadowY = bottomY + 3;
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "rgba(11,42,60,0.85)";
    ctx.beginPath();
    ctx.ellipse(shadowX, shadowY, shadowW/2, shadowH/2, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    const font = `${size}px system-ui, Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji`;
    ctx.textBaseline = "bottom";
    ctx.textAlign = "left";
    ctx.font = font;

    ctx.save();
    ctx.lineWidth = Math.max(5, Math.round(size * 0.14));
    ctx.strokeStyle = "rgba(11,42,60,0.92)";
    ctx.strokeText(emoji, x, y);
    ctx.restore();

    ctx.save();
    ctx.lineWidth = Math.max(2, Math.round(size * 0.06));
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.strokeText(emoji, x, y);
    ctx.restore();

    ctx.save();
    ctx.shadowColor = "rgba(0,169,224,0.55)";
    ctx.shadowBlur = glowStrength;
    ctx.fillText(emoji, x, y);
    ctx.restore();

    ctx.save();
    ctx.shadowBlur = 0;
    ctx.fillText(emoji, x, y);
    ctx.restore();
  }

  function drawObstacles(){
    const t = performance.now();
    obstacles.forEach(o=>{
      const bob = Math.sin(t * o.bobSpeed + o.bobPhase) * o.bobAmp;
      const glow = Math.min(22, 12 + (speed * 0.7));
      drawEmojiPopping(o.emoji, o.x, o.bottomY, o.size, bob, glow);
    });
  }

  function drawHUD(){
    ctx.fillStyle = "rgba(11,42,60,0.78)";
    ctx.font = "16px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
    ctx.fillText(`Score: ${Math.floor(score)}`, 16, 22);
    ctx.fillText(`Hi: ${Math.floor(hiScore)}`, 140, 22);

if (gameOver){
  const title = "Game Over";
  const sub = "but you can restart";

  const cx = W / 2;
  const cy = H / 2;
  const titleFont = "28px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
  const subFont   = "16px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

  ctx.save();
  ctx.font = titleFont;
  const titleW = ctx.measureText(title).width;
  ctx.font = subFont;
  const subW = ctx.measureText(sub).width;
  const maxTextW = Math.max(titleW, subW);

  const padX = 36;
  const padY = 20;
  const gap = 12;
  const titleH = 34; 
  const subH = 22;

  const boxW = Math.min(W - 40, maxTextW + padX * 2);
  const boxH = padY * 2 + titleH + gap + subH;

  const boxX = cx - boxW / 2;
  const boxY = cy - boxH / 2;

  function roundRect(x, y, w, h, r){
    r = Math.min(r, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  roundRect(boxX, boxY, boxW, boxH, 18);
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.strokeStyle = "rgba(11,42,60,0.25)";
  ctx.lineWidth = 3;
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  ctx.fillStyle = "rgba(11,42,60,0.86)";
  ctx.font = titleFont;
  ctx.fillText(title, cx, boxY + padY);

  ctx.fillStyle = "rgba(11,42,60,0.72)";
  ctx.font = subFont;
  ctx.fillText(sub, cx, boxY + padY + titleH + gap);

  ctx.restore();
}


  }

  function draw(){
    ctx.clearRect(0,0,W,H);
    drawClouds();
    drawGround();
    drawObstacles();
    drawPlayer();
    drawHUD();
  }

  function step(){
    if (!running){
      draw();
      requestAnimationFrame(step);
      return;
    }

    score += 0.16 * speedMult;
    speed += 0.0015 * speedMult;

    clouds.forEach(c=>{
      c.x -= (0.35 + c.s) * speedMult;
      if (c.x < -40) c.x = W + 60;
    });

    player.vy += gravity;    player.y += player.vy;
    if (player.y >= groundY){
      player.y = groundY;
      player.vy = 0;
      player.onGround = true;
    }

    distanceToNext -= (speed * speedMult);
    if (distanceToNext <= 0){
      addObstacle();
      const minGap = 180 + speed * 10;
      const maxGap = 420 + speed * 16;
      distanceToNext = rand(minGap, maxGap);
    }

    for (let i = obstacles.length - 1; i >= 0; i--){
      obstacles[i].x -= (speed * speedMult);
      if (obstacles[i].x < -100) obstacles.splice(i,1);
    }
    const px = player.x + 10;
    const py = (player.y - player.h) + 10;
    const pw = player.w - 20;
    const ph = player.h - 16;

    for (const o of obstacles){
      const ox = o.x + 8;
      const oy = (o.bottomY - o.h) + 8;
      const ow = o.w - 16;
      const oh = o.h - 16;

      if (collides(px, py, pw, ph, ox, oy, ow, oh)){
        gameOver = true;
        running = false;
        hiScore = Math.max(hiScore, score);
        break;
      }
    }

    hiScore = Math.max(hiScore, score);
    draw();
    requestAnimationFrame(step);
  }

  let gameSectionVisible = false;
  const gameSection = document.getElementById("game");
  if (gameSection){
    const io = new IntersectionObserver((entries)=>{
      gameSectionVisible = entries.some(e=>e.isIntersecting);
    }, { threshold: 0.25 });
    io.observe(gameSection);
  } else {
    gameSectionVisible = true;
  }

  function onKeyDown(e){
    if (!gameSectionVisible) return;
    if (e.code === "Space" || e.code === "ArrowUp"){
      e.preventDefault();
      jump();
    }
    if (e.code === "KeyR"){
      e.preventDefault();
      restart();
    }
  }

  function onPointer(){
    if (!gameSectionVisible) return;
    jump();
  }

  window.addEventListener("keydown", onKeyDown);
  canvas.addEventListener("pointerdown", onPointer);

  reset();
  requestAnimationFrame(step);
})();

function syncIntroVisibility(){
  if (!document.body.classList.contains("ride-started")) return;
  const show = window.scrollY <= 40;
  document.body.classList.toggle("show-intro", show);
}
  const resumePreviewBtn = document.getElementById("resumePreviewBtn");
const resumeDrawer = document.getElementById("resumeDrawer");
const resumeDrawerClose = document.getElementById("resumeDrawerClose");

function openDrawer(){
  resumeDrawer.classList.add("open");
  resumeDrawer.setAttribute("aria-hidden", "false");
}
function closeDrawer(){
  resumeDrawer.classList.remove("open");
  resumeDrawer.setAttribute("aria-hidden", "true");
}

if (resumePreviewBtn && resumeDrawer){
  resumePreviewBtn.addEventListener("click", () => {
    resumeDrawer.classList.contains("open") ? closeDrawer() : openDrawer();
  });
}

if (resumeDrawerClose){
  resumeDrawerClose.addEventListener("click", closeDrawer);
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeDrawer();
});

const resumeBackdrop = document.getElementById("resumeBackdrop");

function openDrawer(){
  resumeDrawer.classList.add("open");
  resumeDrawer.setAttribute("aria-hidden", "false");
  resumeBackdrop.classList.add("show");
  resumeBackdrop.setAttribute("aria-hidden", "false");
}

function closeDrawer(){
  resumeDrawer.classList.remove("open");
  resumeDrawer.setAttribute("aria-hidden", "true");
  resumeBackdrop.classList.remove("show");
  resumeBackdrop.setAttribute("aria-hidden", "true");
}

resumeBackdrop.addEventListener("click", closeDrawer);
