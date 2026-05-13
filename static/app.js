
const socket = io({
  transports: ["polling", "websocket"],
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  timeout: 5000,
});

let isLive = false;
let activityTotal = 0;

const LS_STATS = "gurbani_stats_v1";
const LS_ACTIVITY = "gurbani_activity_v1";
const LS_THEME = "gurbani_theme";

function saveStats(s) { try { localStorage.setItem(LS_STATS, JSON.stringify(s)); } catch (e) { } }
function loadStats() { try { return JSON.parse(localStorage.getItem(LS_STATS)) || null; } catch (e) { return null; } }
function saveActivity(a) { try { localStorage.setItem(LS_ACTIVITY, JSON.stringify(a)); } catch (e) { } }
function loadActivity() { try { return JSON.parse(localStorage.getItem(LS_ACTIVITY)) || []; } catch (e) { return []; } }

function initTheme() {
  const saved = localStorage.getItem(LS_THEME) || "light";
  applyTheme(saved);
}
function toggleTheme() {
  const current = document.body.getAttribute("data-theme") || "light";
  const next = current === "light" ? "dark" : "light";
  applyTheme(next);
  localStorage.setItem(LS_THEME, next);
}
function applyTheme(theme) {
  document.body.setAttribute("data-theme", theme);

  document.querySelectorAll(".tt-thumb").forEach(thumb => {
    thumb.setAttribute("data-theme", theme);
  });
}

function goToLive() {
  document.getElementById("pageDashboard").classList.remove("active");
  document.getElementById("pageLive").classList.add("active");
}
function goToDashboard() {
  document.getElementById("pageLive").classList.remove("active");
  document.getElementById("pageDashboard").classList.add("active");
}
socket.on("connect", () => {
  setConn(true);
  document.getElementById("btnGoLive").disabled = false;
  document.getElementById("btnStart").disabled = false;
  console.log("[Socket] Connected:", socket.io.engine.transport.name);
});

socket.on("connect_error", (err) => {
  setConn(false);
  document.getElementById("btnGoLive").disabled = false;
  console.warn("[Socket] connect_error:", err.message);
});

socket.on("disconnect", () => {
  setConn(false);
  document.getElementById("btnStart").disabled = true;
  document.getElementById("btnStop").disabled = true;
  document.getElementById("btnGoLive").disabled = true;
  setLiveStatus("Disconnected from server", "stopped");
  isLive = false;
});

function setConn(ok) {
  const dot = document.getElementById("connDotPill");
  const label = document.getElementById("connLabelPill");
  dot.className = "conn-dot-pill " + (ok ? "on" : "off");
  label.textContent = ok ? "Connected" : "Disconnected";
}

socket.on("status_update", (data) => {
  const t = data.type || "info";
  setLiveStatus(data.message, t);
  if (t === "live") {
    isLive = true;
    document.getElementById("btnStart").disabled = true;
    document.getElementById("btnStop").disabled = false;
    document.getElementById("pulseRing").classList.add("active");
    setLiveBadge(true);
    setTrackerCard(true);
  } else if (t === "stopped") {
    isLive = false;
    document.getElementById("btnStart").disabled = false;
    document.getElementById("btnStop").disabled = true;
    document.getElementById("pulseRing").classList.remove("active");
    setLiveBadge(false);
    setTrackerCard(false);
  }
});

socket.on("match_result", (data) => {
  document.getElementById("detectedText").textContent = data.spoken;
  document.getElementById("detectedArea").classList.add("active");
  renderVerse(data.paragraph, data.matched_line);
  document.getElementById("scoreBadge").style.display = "flex";
  document.getElementById("scoreValue").textContent = data.score;
  updateMetrics(data.sr_time, data.match_time, data.total_time);
  addHistory(data.spoken, data.matched_line, true);
  const vp = data.stats ? data.stats.verse_pos : 0;
  updateDashStats(incrementLocalStats(true, data.sr_time, data.total_time, vp));
  addActivity(data.spoken, true);
});

socket.on("no_match", (data) => {
  document.getElementById("detectedText").textContent = data.spoken;
  document.getElementById("detectedArea").classList.add("active");
  document.getElementById("verseContent").innerHTML = `
    <div class="placeholder-msg">
      <div class="placeholder-icon" style="font-size:2rem;opacity:0.35">🔍</div>
      <p style="font-family:'Outfit',sans-serif">No verse matched for:<br>
        <span style="font-family:'Raavi',serif;color:var(--violet)">${escapeHtml(data.spoken)}</span></p>
    </div>`;
  document.getElementById("scoreBadge").style.display = "none";
  updateMetrics(data.sr_time, data.match_time, data.total_time);
  addHistory(data.spoken, "— No match found", false);
  const vp = data.stats ? data.stats.verse_pos : 0;
  updateDashStats(incrementLocalStats(false, data.sr_time, data.total_time, vp));
  addActivity(data.spoken, false);
});

socket.on("stats_update", (s) => {
  if (s.total === 0) updateDashStats(s);
});

function incrementLocalStats(isMatch, srTime, procTime, versePos) {
  const s = loadStats() || { total: 0, matched: 0, unmatched: 0, total_sr: 0, total_proc: 0, verse_pos: 0 };
  s.total++;
  if (isMatch) s.matched++; else s.unmatched++;
  s.total_sr = (s.total_sr || 0) + srTime;
  s.total_proc = (s.total_proc || 0) + procTime;
  s.match_rate = Math.round(s.matched / s.total * 1000) / 10;
  s.avg_sr = Math.round(s.total_sr / s.total * 1000) / 1000;
  s.avg_proc = Math.round(s.total_proc / s.total * 1000) / 1000;
  s.verse_pos = versePos || s.verse_pos;
  saveStats(s);
  return s;
}

function updateDashStats(s) {
  setText("dTotal", s.total);
  setText("dMatched", s.matched);
  setText("dUnmatched", s.unmatched);
  document.getElementById("dRate").innerHTML = (s.match_rate || 0) + '<span class="kpi-unit">%</span>';
  setText("dRatePct", (s.match_rate || 0) + "%");
  setText("dAvgSR", s.avg_sr > 0 ? s.avg_sr + "s" : "—");
  setText("dAvgProc", s.avg_proc > 0 ? s.avg_proc + "s" : "—");
  setText("dVersePos", s.verse_pos > 0 ? "#" + s.verse_pos : "Start");
  setText("lTotal", s.total);
  setText("lMatched", s.matched);
  setText("lUnmatched", s.unmatched);
  const pct = s.match_rate || 0;
  document.getElementById("progressFill").style.width = pct + "%";
  setText("dRatePct", pct + "%");
}

function setTrackerCard(live) {
  const card = document.getElementById("trackerStatusCard");
  const dot = document.getElementById("tsDot");
  const title = document.getElementById("tsTitle");
  if (live) {
    card.classList.add("live"); dot.classList.add("live");
    title.textContent = "● LIVE TRACKING ACTIVE";
  } else {
    card.classList.remove("live"); dot.classList.remove("live");
    title.textContent = "Tracker Idle";
  }
}

function addActivity(spoken, matched) {
  const list = document.getElementById("activityList");
  const empty = list.querySelector(".activity-empty");
  if (empty) empty.remove();
  activityTotal++;
  setText("activityCount", activityTotal + " events");
  const now = new Date();
  const t = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const item = document.createElement("div");
  item.className = "activity-item";
  item.innerHTML = `
    <span class="ai-time">${t}</span>
    <span class="ai-spoken">${escapeHtml(spoken)}</span>
    <span class="ai-tag ${matched ? "m" : "nm"}">${matched ? "Match" : "Miss"}</span>`;
  list.insertBefore(item, list.firstChild);
  while (list.children.length > 5) list.removeChild(list.lastChild);
  // Persist to localStorage
  const stored = loadActivity();
  stored.unshift({ t, spoken, matched });
  if (stored.length > 5) stored.splice(5);
  saveActivity(stored);
}

function setLiveStatus(msg, type) {
  const dot = document.getElementById("statusDotLive");
  const text = document.getElementById("statusTextLive");
  text.textContent = msg;
  dot.className = "status-dot-live";
  if (type === "live") dot.classList.add("live");
  if (type === "stopped") dot.classList.add("stopped");
  if (type === "warn") dot.classList.add("warn");
  if (type === "error") dot.classList.add("error");
}

function setLiveBadge(live) {
  document.getElementById("liveBadgeDot").className = "live-badge-dot" + (live ? " live" : "");
  document.getElementById("liveBadgeText").textContent = live ? "LIVE" : "Idle";
}

function renderVerse(paragraph, matchedLine) {
  const vc = document.getElementById("verseContent");
  const lines = paragraph.split("\n").filter(l => l.trim());
  vc.innerHTML = lines.map(line => {
    const hi = line.trim() === matchedLine.trim();
    return `<span class="verse-line${hi ? " highlight" : ""}">${escapeHtml(line)}</span>`;
  }).join("");
  const hi = vc.querySelector(".verse-line.highlight");
  if (hi) hi.scrollIntoView({ behavior: "smooth", block: "nearest" });
  vc.style.opacity = "0.4";
  requestAnimationFrame(() => { vc.style.transition = "opacity 0.4s"; vc.style.opacity = "1"; });
}

function updateMetrics(sr, match, total) {
  setText("mSR", sr); setText("mMatch", match); setText("mTotal", total);
  document.getElementById("metricsRow").style.opacity = "1";
}

function addHistory(spoken, matched, isMatch) {
  const list = document.getElementById("historyList");
  const empty = list.querySelector(".history-empty");
  if (empty) empty.remove();
  const now = new Date();
  const t = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const item = document.createElement("div");
  item.className = "history-item";
  item.innerHTML = `
    <span class="history-time">${t}</span>
    <div class="history-body">
      <div class="history-spoken">${escapeHtml(spoken)}</div>
      <div class="history-match">${escapeHtml(matched)}</div>
    </div>
    <span class="history-tag ${isMatch ? "tag-match" : "tag-nomatch"}">${isMatch ? "Match" : "Miss"}</span>`;
  list.insertBefore(item, list.firstChild);
  while (list.children.length > 50) list.removeChild(list.lastChild);
}

function startListening() {
  setLiveStatus("Calibrating microphone…", "warn");
  document.getElementById("btnStart").disabled = true;
  socket.emit("start_listening");
}
function stopListening() {
  socket.emit("stop_listening");
  document.getElementById("btnStop").disabled = true;
}
function resetPosition() {
  socket.emit("reset_position");
  document.getElementById("verseContent").innerHTML = `
    <div class="placeholder-msg">
      <div class="placeholder-icon">ੴ</div>
      <p>Position reset to beginning. Continue reciting from Japji Sahib.</p>
    </div>`;
  document.getElementById("scoreBadge").style.display = "none";
  document.getElementById("detectedText").textContent = "—";
  document.getElementById("detectedArea").classList.remove("active");
}
function resetStats() {
  socket.emit("reset_stats");
  activityTotal = 0;
  setText("activityCount", "0 events");
  document.getElementById("activityList").innerHTML =
    '<div class="activity-empty">No activity yet. Start live tracking to see results here.</div>';
  try { localStorage.removeItem(LS_STATS); localStorage.removeItem(LS_ACTIVITY); } catch (e) { }
}
function clearHistory() {
  document.getElementById("historyList").innerHTML =
    '<div class="history-empty">No events yet this session.</div>';
}

function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function pad(n) { return String(n).padStart(2, "0"); }
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

(function init() {
  initTheme();

  const s = loadStats();
  if (s) updateDashStats(s);

  const items = loadActivity();
  if (items.length > 0) {
    activityTotal = items.length;
    setText("activityCount", activityTotal + " events");
    const list = document.getElementById("activityList");
    list.innerHTML = "";
    items.forEach(item => {
      const el = document.createElement("div");
      el.className = "activity-item";
      el.innerHTML = `
        <span class="ai-time">${escapeHtml(item.t)}</span>
        <span class="ai-spoken">${escapeHtml(item.spoken)}</span>
        <span class="ai-tag ${item.matched ? "m" : "nm"}">${item.matched ? "Match" : "Miss"}</span>`;
      list.appendChild(el);
    });
  }
})();
