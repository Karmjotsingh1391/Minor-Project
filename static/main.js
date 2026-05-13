
(function authGuard() {
  try {
    const user = JSON.parse(localStorage.getItem("gurbani_user") || "null");
    if (!user || !user.email) {
      window.location.href = "/login";
      return;
    }

    window.addEventListener("DOMContentLoaded", () => {
      const nameEl = document.getElementById("userNameDisplay");
      const avatarEl = document.getElementById("userAvatar");
      if (nameEl) nameEl.textContent = user.name || user.email;
      if (avatarEl) avatarEl.textContent = (user.name || user.email).charAt(0).toUpperCase();
    });
  } catch (e) {
    window.location.href = "/login";
  }
})();

function logoutUser() {
  if (!confirm("Are you sure you want to logout?")) return;
  localStorage.removeItem("gurbani_user");
  window.location.href = "/login";
}

const socket = io({ transports: ["polling", "websocket"], reconnectionAttempts: 10, reconnectionDelay: 1000, timeout: 5000 });

const LS_STATS = "gurbani_v2_stats";
const LS_ACTIVITY = "gurbani_v2_activity";
const LS_THEME = "gurbani_v2_theme";

let isLive = false;
let currentFilter = "all";
let allActivityRows = [];
function saveStats(s) { try { localStorage.setItem(LS_STATS, JSON.stringify(s)); } catch (e) { } }
function loadStats() { try { return JSON.parse(localStorage.getItem(LS_STATS)) || null; } catch (e) { return null; } }
function saveActivityLog(a) { try { localStorage.setItem(LS_ACTIVITY, JSON.stringify(a)); } catch (e) { } }
function loadActivityLog() { try { return JSON.parse(localStorage.getItem(LS_ACTIVITY)) || []; } catch (e) { return []; } }

function initTheme() {
  const saved = localStorage.getItem(LS_THEME) || "dark";
  applyTheme(saved);
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute("data-theme") || "dark";
  const next = cur === "dark" ? "light" : "dark";
  applyTheme(next);
  localStorage.setItem(LS_THEME, next);
}
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

const PAGES = { dashboard: "pageDashboard", live: "pageLive", activity: "pageActivity", settings: "pageSettings" };
const NAVS  = { dashboard: "navDashboard",  live: "navLive",  activity: "navActivity",  settings: "navSettings" };

function showPage(name) {
  Object.keys(PAGES).forEach(k => {
    document.getElementById(PAGES[k]).classList.toggle("hidden", k !== name);
    document.getElementById(NAVS[k]).classList.toggle("active", k === name);
  });
  if (name === "settings") loadSettingsPage();
}

socket.on("connect", () => {
  setConn(true);
  el("btnGoLive") && (el("btnGoLive").disabled = false);
  el("btnStart") && (el("btnStart").disabled = false);
});
socket.on("connect_error", () => { setConn(false); });
socket.on("disconnect", () => {
  setConn(false);
  el("btnStart").disabled = true;
  el("btnStop").disabled = true;
  el("btnGoLive") && (el("btnGoLive").disabled = true);
  setLiveStatus("Disconnected from server", "stopped");
  isLive = false;
  updateLiveBadge(false);
});

function setConn(ok) {
  el("connDot").className = "conn-dot" + (ok ? " on" : "");
  el("connLabel").textContent = ok ? "Connected" : "Disconnected";
}

socket.on("status_update", (data) => {
  const t = data.type || "info";
  setLiveStatus(data.message, t);
  if (t === "live") {
    isLive = true;
    el("btnStart").disabled = true;
    el("btnStop").disabled = false;
    el("pulseRing").classList.add("active");
    updateLiveBadge(true);
    setTrackerBanner(true);
  } else if (t === "stopped") {
    isLive = false;
    el("btnStart").disabled = false;
    el("btnStop").disabled = true;
    el("pulseRing").classList.remove("active");
    updateLiveBadge(false);
    setTrackerBanner(false);
  }
});

socket.on("match_result", (data) => {
  el("detectedText").textContent = data.spoken;
  renderVerse(data.paragraph, data.matched_line);
  el("scoreBadge").style.display = "flex";
  el("scoreValue").textContent = data.score;
  updateMetrics(data.sr_time, data.match_time, data.total_time);
  const vp = data.stats ? data.stats.verse_pos : 0;
  const s = incrementLocalStats(true, data.sr_time, data.total_time, vp);
  updateDashStats(s);
  addActivityRow({ spoken: data.spoken, verse: data.matched_line, matched: true, score: data.score });
});

socket.on("no_match", (data) => {
  el("detectedText").textContent = data.spoken;
  el("verseContent").innerHTML = `
    <div class="verse-placeholder">
      <div class="verse-placeholder-icon" style="opacity:.4">🔍</div>
      <p>No verse matched for:<br>
        <span style="font-family:'Noto Sans Gurmukhi',serif;color:var(--orange)">${escapeHtml(data.spoken)}</span></p>
    </div>`;
  el("scoreBadge").style.display = "none";
  updateMetrics(data.sr_time, data.match_time, data.total_time);
  const vp = data.stats ? data.stats.verse_pos : 0;
  const s = incrementLocalStats(false, data.sr_time, data.total_time, vp);
  updateDashStats(s);
  addActivityRow({ spoken: data.spoken, verse: "—", matched: false, score: null });
});

socket.on("stats_update", (s) => { if (s.total === 0) updateDashStats(s); });

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
  setText("dRate", s.match_rate || 0);
  setText("dRatePct", (s.match_rate || 0) + "%");
  setText("dAvgSR", s.avg_sr > 0 ? s.avg_sr + "s" : "—");
  setText("dAvgProc", s.avg_proc > 0 ? s.avg_proc + "s" : "—");
  setText("dVersePos", s.verse_pos > 0 ? "#" + s.verse_pos : "Start");
  setText("lTotal", s.total);
  setText("lMatched", s.matched);
  setText("lUnmatched", s.unmatched);
  const pct = s.match_rate || 0;
  el("progressFill").style.width = pct + "%";

  const rate = s.match_rate || 0;
  const trendEl = el("dRateTrend");
  if (trendEl) trendEl.textContent = rate >= 75 ? "Great" : rate >= 50 ? "✓ Good" : "↗ Improving";
}

function setLiveStatus(msg, type) {
  el("statusTextLive").textContent = msg;
  const dot = el("statusDotLive");
  dot.className = "status-dot-live";
  if (type === "live") dot.classList.add("live");
  if (type === "stopped") dot.classList.add("stopped");
  if (type === "warn") dot.classList.add("warn");
  if (type === "error") dot.classList.add("error");
}

function updateLiveBadge(live) {
  const dot = el("liveBadgeDot");
  const txt = el("liveBadgeText");
  const nav = el("liveBadgeNav");
  dot.className = "live-dot" + (live ? " live" : "");
  txt.textContent = live ? "LIVE" : "Idle";
  if (nav) nav.style.display = live ? "inline-block" : "none";
}

function setTrackerBanner(live) {
  const card = el("trackerStatusCard");
  const dot = el("tsDot");
  const badge = el("tsTitle");
  const hint = el("tsHint");
  card && card.classList.toggle("live", live);
  dot && dot.classList.toggle("live", live);
  if (badge) {
    badge.textContent = live ? "● LIVE" : "Idle";
    badge.classList.toggle("live-badge", live);
  }
  if (hint) hint.textContent = live ? "Tracking" : "Idle";
}

function renderVerse(paragraph, matchedLine) {
  const vc = el("verseContent");
  const lines = paragraph.split("\n").filter(l => l.trim());
  vc.innerHTML = lines.map(line => {
    const hi = line.trim() === matchedLine.trim();
    return `<span class="verse-line${hi ? " highlight" : ""}">${escapeHtml(line)}</span>`;
  }).join("");
  const hi = vc.querySelector(".verse-line.highlight");
  if (hi) hi.scrollIntoView({ behavior: "smooth", block: "nearest" });
  vc.style.opacity = "0.3";
  requestAnimationFrame(() => { vc.style.transition = "opacity .4s"; vc.style.opacity = "1"; });
}

function updateMetrics(sr, match, total) {
  setText("mSR", sr);
  setText("mMatch", match);
  setText("mTotal", total);
  el("metricsRow").style.opacity = "1";
  el("metricsRow").style.transition = "opacity .4s";
}

function addActivityRow(entry) {
  const now = new Date();
  const t = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const row = { t, ...entry };
  allActivityRows.unshift(row);
  saveActivityLog(allActivityRows);
  setText("navActivityCount", allActivityRows.length);
  setText("activityMeta", allActivityRows.length + " events recorded");
  renderActivityTable();
}

function renderActivityTable() {
  const search = (el("activitySearch")?.value || "").toLowerCase();
  const filtered = allActivityRows.filter(r => {
    if (currentFilter === "matched" && !r.matched) return false;
    if (currentFilter === "missed" && r.matched) return false;
    if (search && !r.spoken.toLowerCase().includes(search)) return false;
    return true;
  });

  const body = el("activityTableBody");
  if (filtered.length === 0) {
    body.innerHTML = `<div class="activity-empty-state">
      <div class="empty-icon">🔍</div>
      <h3>No results</h3>
      <p>Try changing the filter or search term.</p>
    </div>`;
    return;
  }

  body.innerHTML = filtered.map(r => `
    <div class="activity-row">
      <div class="ar-time">${escapeHtml(r.t)}</div>
      <div class="ar-spoken">${escapeHtml(r.spoken)}</div>
      <div class="ar-verse" title="${escapeHtml(r.verse)}">${escapeHtml(r.verse)}</div>
      <div><span class="ar-tag ${r.matched ? "match" : "miss"}">${r.matched ? "✓ Matched" : "✕ Missed"}</span></div>
      <div class="ar-score">${r.score !== null && r.score !== undefined ? r.score + "%" : "—"}</div>
    </div>`).join("");
}

function filterActivity(filter) {
  currentFilter = filter;
  ["filterAll", "filterMatched", "filterMissed"].forEach(id => el(id)?.classList.remove("active"));
  const map = { all: "filterAll", matched: "filterMatched", missed: "filterMissed" };
  el(map[filter])?.classList.add("active");
  renderActivityTable();
}

function clearAllActivity() {
  allActivityRows = [];
  saveActivityLog([]);
  setText("navActivityCount", "0");
  setText("activityMeta", "0 events recorded");
  el("activityTableBody").innerHTML = `<div class="activity-empty-state">
    <div class="empty-icon">🎙️</div>
    <h3>No activity yet</h3>
    <p>Go live and start reciting Gurbani to see all events logged here.</p>
  </div>`;
}

function startListening() {
  setLiveStatus("Calibrating microphone…", "warn");
  el("btnStart").disabled = true;
  socket.emit("start_listening");
}
function stopListening() {
  socket.emit("stop_listening");
  el("btnStop").disabled = true;
}
function resetPosition() {
  socket.emit("reset_position");
  el("verseContent").innerHTML = `<div class="verse-placeholder">
    <div class="verse-placeholder-icon">ੴ</div>
    <p>Position reset. Continue reciting from the beginning.</p>
  </div>`;
  el("scoreBadge").style.display = "none";
  el("detectedText").textContent = "—";
}
function resetStats() {
  socket.emit("reset_stats");
  try { localStorage.removeItem(LS_STATS); } catch (e) { }
  const empty = { total: 0, matched: 0, unmatched: 0, match_rate: 0, avg_sr: 0, avg_proc: 0, verse_pos: 0 };
  updateDashStats(empty);
}

function el(id) { return document.getElementById(id); }
function setText(id, val) { const e = el(id); if (e) e.textContent = val; }
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

  const saved = loadActivityLog();
  if (saved.length > 0) {
    allActivityRows = saved;
    setText("navActivityCount", allActivityRows.length);
    setText("activityMeta", allActivityRows.length + " events recorded");
    renderActivityTable();
  }

  // Restore preferences
  const prefs = loadPrefs();
  ["switchAutoScroll", "switchSound", "switchPersist", "switchMetrics"].forEach(id => {
    const key = id.replace("switch", "").replace(/^./, c => c.toLowerCase());
    const el2 = el(id);
    if (el2 && prefs[key] !== undefined) el2.checked = prefs[key];
  });
  if (prefs.compact) { document.body.classList.add("compact-sidebar"); }
  if (prefs.fontSize) applyFontSize(prefs.fontSize);
})();

/* ═════════════════════════════════════════════
   SETTINGS PAGE
═════════════════════════════════════════════ */

const LS_PREFS = "gurbani_v2_prefs";
function loadPrefs() { try { return JSON.parse(localStorage.getItem(LS_PREFS)) || {}; } catch(e) { return {}; } }
function savePrefs(p) { try { localStorage.setItem(LS_PREFS, JSON.stringify(p)); } catch(e) {} }

function loadSettingsPage() {
  // Populate profile fields
  try {
    const user = JSON.parse(localStorage.getItem("gurbani_user") || "null");
    if (user) {
      const name = user.name || "";
      const email = user.email || "";
      setText("settingsProfileName", name || "Unknown");
      setText("settingsProfileEmail", email);
      setText("settingsCurrentEmail", email);
      const av = el("settingsAvatar");
      if (av) av.textContent = (name || email).charAt(0).toUpperCase();
      const ni = el("settingsNameInput");
      if (ni) ni.value = name;
    }
  } catch(e) {}

  // Sync theme pills
  const cur = document.documentElement.getAttribute("data-theme") || "dark";
  updateThemePills(cur);

  // Sync font size
  const prefs = loadPrefs();
  applyFontSize(prefs.fontSize || "md");

  // Sync compact sidebar
  const compact = el("switchCompact");
  if (compact) compact.checked = document.body.classList.contains("compact-sidebar");

  // Sync pref toggles
  ["autoScroll", "sound", "persist", "metrics"].forEach(k => {
    const sw = el("switch" + k.charAt(0).toUpperCase() + k.slice(1));
    if (sw && prefs[k] !== undefined) sw.checked = prefs[k];
  });

  // Wire OTP boxes for email change
  wireSettingsOtpBoxes();
}

function saveDisplayName() {
  const input = el("settingsNameInput");
  const newName = (input?.value || "").trim();
  if (!newName || newName.length < 2) {
    showSettingsAlert("alertName", "error", "Name must be at least 2 characters.");
    return;
  }
  el("btnSaveName").disabled = true;
  el("btnSaveName").textContent = "Saving…";

  fetch("/settings/update-name", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: newName })
  }).then(r => r.json()).then(data => {
    el("btnSaveName").disabled = false;
    el("btnSaveName").textContent = "Save";
    if (data.success) {
      // Update localStorage
      try {
        const u = JSON.parse(localStorage.getItem("gurbani_user") || "{}");
        u.name = newName;
        localStorage.setItem("gurbani_user", JSON.stringify(u));
      } catch(e) {}
      showSettingsAlert("alertName", "success", "✓ Name updated successfully!");
      setText("settingsProfileName", newName);
      setText("userNameDisplay", newName);
      const av1 = el("settingsAvatar");
      const av2 = el("userAvatar");
      if (av1) av1.textContent = newName.charAt(0).toUpperCase();
      if (av2) av2.textContent = newName.charAt(0).toUpperCase();
    } else {
      showSettingsAlert("alertName", "error", data.message || "Failed to update name.");
    }
  }).catch(() => {
    el("btnSaveName").disabled = false;
    el("btnSaveName").textContent = "Save";
    showSettingsAlert("alertName", "error", "Network error. Please try again.");
  });
}

function sendEmailChangeOtp() {
  const newEmail = (el("settingsNewEmail")?.value || "").trim();
  if (!newEmail || !newEmail.includes("@")) {
    showSettingsAlert("alertEmailA", "error", "Please enter a valid email address.");
    return;
  }
  el("btnSendEmailOtp").disabled = true;
  el("btnSendEmailOtp").textContent = "Sending…";
  clearSettingsAlert("alertEmailA");

  fetch("/settings/send-email-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ new_email: newEmail })
  }).then(r => r.json()).then(data => {
    el("btnSendEmailOtp").disabled = false;
    el("btnSendEmailOtp").textContent = "Send OTP";
    if (data.success) {
      el("emailStepA").style.display = "none";
      el("emailStepB").style.display = "block";
      setText("emailChangeTarget", newEmail);
      // Clear OTP boxes
      for (let i = 0; i < 6; i++) {
        const b = el("seOtp" + i);
        if (b) { b.value = ""; b.classList.remove("filled"); }
      }
      setTimeout(() => el("seOtp0")?.focus(), 100);
    } else {
      showSettingsAlert("alertEmailA", "error", data.message || "Failed to send OTP.");
    }
  }).catch(() => {
    el("btnSendEmailOtp").disabled = false;
    el("btnSendEmailOtp").textContent = "Send OTP";
    showSettingsAlert("alertEmailA", "error", "Network error. Please try again.");
  });
}

function verifyEmailChangeOtp() {
  const otp = [0,1,2,3,4,5].map(i => (el("seOtp" + i)?.value || "")).join("");
  if (otp.length !== 6) {
    showSettingsAlert("alertEmailB", "error", "Please enter the complete 6-digit OTP.");
    return;
  }
  el("btnVerifyEmailOtp").disabled = true;
  el("btnVerifyEmailOtp").textContent = "Verifying…";
  clearSettingsAlert("alertEmailB");

  fetch("/settings/verify-email-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ otp })
  }).then(r => r.json()).then(data => {
    el("btnVerifyEmailOtp").disabled = false;
    el("btnVerifyEmailOtp").textContent = "Verify & Update";
    if (data.success && data.user) {
      const newEmail = data.user.email;
      try {
        const u = JSON.parse(localStorage.getItem("gurbani_user") || "{}");
        u.email = newEmail;
        localStorage.setItem("gurbani_user", JSON.stringify(u));
      } catch(e) {}
      setText("settingsProfileEmail", newEmail);
      setText("settingsCurrentEmail", newEmail);
      showSettingsAlert("alertEmailB", "success", "✓ Email updated successfully!");
      // Revert to step A after delay
      setTimeout(() => cancelEmailChange(), 2200);
    } else {
      showSettingsAlert("alertEmailB", "error", data.message || "Verification failed.");
    }
  }).catch(() => {
    el("btnVerifyEmailOtp").disabled = false;
    el("btnVerifyEmailOtp").textContent = "Verify & Update";
    showSettingsAlert("alertEmailB", "error", "Network error. Please try again.");
  });
}

function cancelEmailChange() {
  el("emailStepA").style.display = "block";
  el("emailStepB").style.display = "none";
  clearSettingsAlert("alertEmailA");
  clearSettingsAlert("alertEmailB");
  const ni = el("settingsNewEmail");
  if (ni) ni.value = "";
}

function setTheme(theme) {
  applyTheme(theme);
  localStorage.setItem(LS_THEME, theme);
  updateThemePills(theme);
}

function updateThemePills(theme) {
  const pd = el("themePillDark");
  const pl = el("themePillLight");
  if (pd) pd.classList.toggle("active", theme === "dark");
  if (pl) pl.classList.toggle("active", theme === "light");
}

function setFontSize(size) {
  const prefs = loadPrefs();
  prefs.fontSize = size;
  savePrefs(prefs);
  applyFontSize(size);
}

function applyFontSize(size) {
  const map = { sm: "13px", md: "15px", lg: "17px" };
  document.documentElement.style.fontSize = map[size] || "15px";
  ["fontBtnSm", "fontBtnMd", "fontBtnLg"].forEach(id => el(id)?.classList.remove("active"));
  const idMap = { sm: "fontBtnSm", md: "fontBtnMd", lg: "fontBtnLg" };
  el(idMap[size])?.classList.add("active");
}

function toggleCompactSidebar(on) {
  document.body.classList.toggle("compact-sidebar", on);
  const prefs = loadPrefs();
  prefs.compact = on;
  savePrefs(prefs);
}

function savePref(key, value) {
  const prefs = loadPrefs();
  prefs[key] = value;
  savePrefs(prefs);
}

function clearAllData() {
  if (!confirm("This will erase all local stats, activity log, and preferences. Continue?")) return;
  [LS_STATS, LS_ACTIVITY, LS_PREFS].forEach(k => { try { localStorage.removeItem(k); } catch(e) {} });
  const empty = { total: 0, matched: 0, unmatched: 0, match_rate: 0, avg_sr: 0, avg_proc: 0, verse_pos: 0 };
  updateDashStats(empty);
  allActivityRows = [];
  setText("navActivityCount", "0");
  setText("activityMeta", "0 events recorded");
  const body2 = el("activityTableBody");
  if (body2) body2.innerHTML = `<div class="activity-empty-state"><div class="empty-icon">🎙️</div><h3>No activity yet</h3><p>Go live and start reciting Gurbani to see all events logged here.</p></div>`;
  alert("✓ All local data has been cleared.");
}

function wireSettingsOtpBoxes() {
  const boxes = [0,1,2,3,4,5].map(i => el("seOtp" + i));
  boxes.forEach((box, i) => {
    if (!box || box._wired) return;
    box._wired = true;
    box.addEventListener("input", () => {
      box.value = box.value.replace(/\D/g, "").slice(-1);
      box.classList.toggle("filled", box.value !== "");
      if (box.value && i < 5) boxes[i + 1].focus();
    });
    box.addEventListener("keydown", e => {
      if (e.key === "Backspace" && !box.value && i > 0) {
        boxes[i - 1].focus();
        boxes[i - 1].value = "";
        boxes[i - 1].classList.remove("filled");
      }
    });
    box.addEventListener("paste", e => {
      const paste = (e.clipboardData || window.clipboardData).getData("text").replace(/\D/g, "").slice(0, 6);
      if (paste) {
        paste.split("").forEach((ch, j) => { if (boxes[j]) { boxes[j].value = ch; boxes[j].classList.add("filled"); } });
        boxes[Math.min(paste.length, 5)].focus();
        e.preventDefault();
      }
    });
  });
}

function showSettingsAlert(id, type, msg) {
  const a = el(id);
  if (!a) return;
  a.textContent = msg;
  a.className = `settings-alert ${type} show`;
  clearTimeout(a._timer);
  a._timer = setTimeout(() => clearSettingsAlert(id), 5000);
}

function clearSettingsAlert(id) {
  const a = el(id);
  if (a) { a.className = "settings-alert"; a.textContent = ""; }
}
