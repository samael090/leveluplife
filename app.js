/* ==========================================================================
   LevelUp Life - Gamified Productivity JS Logic
   API sync, token authorizations, Dynamic Month Calendar, Web Audio
   ========================================================================== */

const API_URL = null;
const STORAGE_KEY = "levelup_life_state";

const DEFAULT_RIVALS = [
    { name: "Nova", avatar: "mage", xp: 1250 },
    { name: "Cipher", avatar: "ninja", xp: 840 },
    { name: "Atlas", avatar: "warrior", xp: 420 }
];

// --- Global Application State ---
let state = {
    user: {
        username: "Player 1",
        avatar: "ninja",
        level: 1,
        xp: 0,
        dailyStreak: 0,
        weeklyStreak: 0,
        lastActiveDate: null,
        xpEarnedToday: 0
    },
    tasks: [],
    history: [],
    combatLog: [],
    achievements: [],
    rivals: []
};

// --- Levels Database Formulas ---
const RANK_THRESHOLDS = [
    { rank: "Beginner", minXp: 0, maxXp: 500, level: 1 },
    { rank: "Warrior", minXp: 500, maxXp: 1500, level: 2 },
    { rank: "Champion", minXp: 1500, maxXp: 3000, level: 3 },
    { rank: "Legend", minXp: 3000, maxXp: 5000, level: 4 },
    { rank: "Grand Master", minXp: 5000, maxXp: Infinity, level: 5 }
];

function getLevelInfo(xp) {
    if (xp < 500) {
        return { level: 1, rank: "Beginner", min: 0, max: 500, progress: (xp / 500) * 100 };
    } else if (xp < 1500) {
        const progress = ((xp - 500) / 1000) * 100;
        return { level: 2, rank: "Warrior", min: 500, max: 1500, progress };
    } else if (xp < 3000) {
        const progress = ((xp - 1500) / 1500) * 100;
        return { level: 3, rank: "Champion", min: 1500, max: 3000, progress };
    } else if (xp < 5000) {
        const progress = ((xp - 3000) / 2000) * 100;
        return { level: 4, rank: "Legend", min: 3000, max: 5000, progress };
    } else {
        const excess = xp - 5000;
        const levelScale = Math.floor(excess / 2500);
        const currentLevel = 5 + levelScale;
        const minLvlXp = 5000 + levelScale * 2500;
        const progress = ((xp - minLvlXp) / 2500) * 100;
        return { level: currentLevel, rank: "Grand Master", min: minLvlXp, max: minLvlXp + 2500, progress };
    }
}

// --- Procedural Sound Generator (Web Audio API) ---
const SoundFX = {
    ctx: null,
    muted: false,

    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
    },

    playClick() {
        if (this.muted) return;
        this.init();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.type = "sine";
        osc.frequency.setValueAtTime(800, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(150, this.ctx.currentTime + 0.1);
        
        gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.1);
        
        osc.start();
        osc.stop(this.ctx.currentTime + 0.1);
    },

    playQuestComplete() {
        if (this.muted) return;
        this.init();
        const now = this.ctx.currentTime;
        const notes = [261.63, 329.63, 392.00, 523.25];
        
        notes.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            
            osc.type = "triangle";
            osc.frequency.setValueAtTime(freq, now + idx * 0.05);
            
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.1, now + idx * 0.05 + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.25);
            
            osc.start(now + idx * 0.05);
            osc.stop(now + idx * 0.05 + 0.26);
        });
    },

    playLevelUp() {
        if (this.muted) return;
        this.init();
        const now = this.ctx.currentTime;
        const notes = [261.63, 329.63, 392.00, 440.00, 523.25, 659.25, 783.99, 1046.50];
        
        notes.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            
            osc.type = (idx === notes.length - 1) ? "sawtooth" : "sine";
            osc.frequency.setValueAtTime(freq, now + idx * 0.08);
            
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.12, now + idx * 0.08 + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.4);
            
            osc.start(now + idx * 0.08);
            osc.stop(now + idx * 0.08 + 0.45);
        });
    },

    playError() {
        if (this.muted) return;
        this.init();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(120, this.ctx.currentTime);
        osc.frequency.setValueAtTime(90, this.ctx.currentTime + 0.15);
        
        gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.3);
        
        osc.start();
        osc.stop(this.ctx.currentTime + 0.3);
    }
};

// --- Achievements Templates ---
const ACHIEVEMENT_TEMPLATES = [
    { id: "first_blood", name: "First Blood", description: "Complete your first quest.", icon: "swords", type: "completions", target: 1 },
    { id: "hero", name: "Hero Rising", description: "Complete 10 quests.", icon: "shield", type: "completions", target: 10 },
    { id: "legendary", name: "Legendary Status", description: "Complete 50 quests.", icon: "crown", type: "completions", target: 50 },
    { id: "streaker_3", name: "Streaker III", description: "Reach a 3-day daily streak.", icon: "flame", type: "streak", target: 3 },
    { id: "streaker_7", name: "Streaker VII", description: "Reach a 7-day daily streak.", icon: "zap", type: "streak", target: 7 },
    { id: "iron_will", name: "Iron Will", description: "Complete 10 Workout quests.", icon: "activity", type: "category", category: "workout", target: 10 },
    { id: "sage", name: "Sage Mind", description: "Complete 10 Reading or Meditation quests.", icon: "book-open", type: "category_combo", categories: ["reading", "meditation"], target: 10 },
    { id: "level_5", name: "Ascendant", description: "Reach Level 5.", icon: "sparkles", type: "level", target: 5 }
];

// --- API Helpers ---
function getHeaders() {
    const token = localStorage.getItem("levelup_token");
    return {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
    };
}

async function apiRequest(endpoint, options = {}) {
    return localApiRequest(endpoint, options);
}

function createInitialState() {
    return {
        user: {
            username: "Player 1",
            avatar: "ninja",
            level: 1,
            xp: 0,
            dailyStreak: 0,
            weeklyStreak: 0,
            lastActiveDate: getLocalDateString(),
            xpEarnedToday: 0
        },
        tasks: [],
        history: [],
        achievements: [],
        rivals: DEFAULT_RIVALS
    };
}

function loadLocalState() {
    try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
        return stored ? {
            ...createInitialState(),
            ...stored,
            user: { ...createInitialState().user, ...(stored.user || {}) },
            tasks: stored.tasks || [],
            history: stored.history || [],
            achievements: stored.achievements || [],
            rivals: stored.rivals || DEFAULT_RIVALS
        } : createInitialState();
    } catch (e) {
        console.warn("Local state restore failed, starting fresh.", e);
        return createInitialState();
    }
}

function saveLocalState(nextState = state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        user: nextState.user,
        tasks: nextState.tasks,
        history: nextState.history,
        achievements: nextState.achievements,
        rivals: nextState.rivals && nextState.rivals.length ? nextState.rivals : DEFAULT_RIVALS
    }));
}

function normalizeUserForApi(user) {
    return {
        username: user.username,
        avatar: user.avatar,
        level: user.level,
        xp: user.xp,
        daily_streak: user.dailyStreak,
        weekly_streak: user.weeklyStreak,
        last_active_date: user.lastActiveDate,
        xp_earned_today: user.xpEarnedToday
    };
}

async function localApiRequest(endpoint, options = {}) {
    const method = (options.method || "GET").toUpperCase();
    const body = options.body ? JSON.parse(options.body) : {};
    const localState = loadLocalState();

    if (endpoint === "/auth/login" || endpoint === "/auth/register") {
        if (endpoint === "/auth/register" && body.username) {
            localState.user.username = body.username;
        }
        saveLocalState(localState);
        return { token: "local-session" };
    }

    if (endpoint === "/user/profile") {
        if (method === "PUT") {
            localState.user.username = body.username || localState.user.username;
            localState.user.avatar = body.avatar || localState.user.avatar;
            saveLocalState(localState);
        }
        return normalizeUserForApi(localState.user);
    }

    if (endpoint === "/user/xp" && method === "PUT") {
        localState.user = { ...localState.user, ...body };
        saveLocalState(localState);
        return normalizeUserForApi(localState.user);
    }

    if (endpoint === "/tasks") {
        if (method === "POST") {
            localState.tasks.push({ ...body, completedToday: false, streak: 0, createdDate: new Date().toISOString() });
            saveLocalState(localState);
            return body;
        }
        return localState.tasks;
    }

    if (endpoint.startsWith("/tasks/")) {
        const id = endpoint.split("/").pop();
        if (method === "DELETE") {
            localState.tasks = localState.tasks.filter(t => t.id !== id);
            saveLocalState(localState);
            return { ok: true };
        }
        if (method === "PUT") {
            localState.tasks = localState.tasks.map(t => t.id === id ? { ...t, ...body } : t);
            saveLocalState(localState);
            return localState.tasks.find(t => t.id === id);
        }
    }

    if (endpoint === "/history") {
        if (method === "POST") {
            localState.history.push(body);
            saveLocalState(localState);
            return body;
        }
        if (method === "DELETE") {
            localState.history = state.history;
            saveLocalState(localState);
            return { ok: true };
        }
        return localState.history;
    }

    if (endpoint === "/achievements") {
        if (method === "PUT") {
            localState.achievements = body.achievements || [];
            saveLocalState(localState);
            return localState.achievements;
        }
        return localState.achievements;
    }

    if (endpoint === "/leaderboard") {
        const playerInfo = getLevelInfo(localState.user.xp);
        const players = [
            { name: localState.user.username, avatar: localState.user.avatar, xp: localState.user.xp },
            ...localState.rivals
        ];
        return players
            .map(player => {
                const info = getLevelInfo(player.xp);
                return { ...player, level: info.level, rankTitle: info.rank };
            })
            .sort((a, b) => b.xp - a.xp || (a.name === localState.user.username ? -1 : 1));
    }

    if (endpoint === "/reminders/trigger") {
        return { message: "Local reminders check completed." };
    }

    throw new Error(`Unsupported local endpoint: ${endpoint}`);
}

// --- Auth Systems UI & Logic ---
function initAuth() {
    const authScreen = document.getElementById("auth-screen");
    const loginTab = document.getElementById("auth-login-tab");
    const registerTab = document.getElementById("auth-register-tab");
    const loginForm = document.getElementById("login-form");
    const registerForm = document.getElementById("register-form");
    const errorMsg = document.getElementById("auth-error-message");

    // Toggle login/register tabs
    loginTab.addEventListener("click", () => {
        SoundFX.playClick();
        loginTab.classList.add("active");
        registerTab.classList.remove("active");
        loginForm.classList.add("active");
        registerForm.classList.remove("active");
        errorMsg.style.display = "none";
    });

    registerTab.addEventListener("click", () => {
        SoundFX.playClick();
        registerTab.classList.add("active");
        loginTab.classList.remove("active");
        registerForm.classList.add("active");
        loginForm.classList.remove("active");
        errorMsg.style.display = "none";
    });

    // Submit Login form
    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        SoundFX.playClick();
        errorMsg.style.display = "none";
        
        const email = document.getElementById("login-email").value;
        const password = document.getElementById("login-password").value;

        try {
            const resJson = await apiRequest("/auth/login", {
                method: "POST",
                body: JSON.stringify({ email, password })
            });

            localStorage.setItem("levelup_token", resJson.token);
            authScreen.style.display = "none";
            
            notifyNewLog(`Connected to player profile successfully.`);
            SoundFX.playLevelUp();

            await appBootstrap();
        } catch (err) {
            SoundFX.playError();
            errorMsg.textContent = err.message;
            errorMsg.style.display = "block";
        }
    });

    // Submit Register form
    registerForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        SoundFX.playClick();
        errorMsg.style.display = "none";

        const username = document.getElementById("register-username").value;
        const email = document.getElementById("register-email").value;
        const phone = document.getElementById("register-phone").value;
        const password = document.getElementById("register-password").value;

        try {
            const resJson = await apiRequest("/auth/register", {
                method: "POST",
                body: JSON.stringify({ username, email, phone, password })
            });

            localStorage.setItem("levelup_token", resJson.token);
            authScreen.style.display = "none";

            notifyNewLog(`New character profile established.`);
            SoundFX.playLevelUp();

            await appBootstrap();
        } catch (err) {
            SoundFX.playError();
            errorMsg.textContent = err.message;
            errorMsg.style.display = "block";
        }
    });

    // Sign out button
    document.getElementById("logout-trigger-btn").addEventListener("click", () => {
        SoundFX.playClick();
        logout();
    });

    // Check token on initial load
    const token = localStorage.getItem("levelup_token");
    if (token) {
        authScreen.style.display = "none";
        appBootstrap();
    } else {
        authScreen.style.display = "flex";
    }
}

function logout() {
    localStorage.removeItem("levelup_token");
    document.getElementById("auth-screen").style.display = "flex";
    
    // Clear in-memory state
    state.tasks = [];
    state.history = [];
    state.combatLog = [];
    state.achievements = [];
}

// --- Sync state data from server ---
async function appBootstrap() {
    console.log("Synchronizing data with backend server...");
    try {
        // Load User Profile
        const profile = await apiRequest("/user/profile");
        if (profile) {
            state.user = {
                username: profile.username,
                avatar: profile.avatar,
                level: profile.level,
                xp: profile.xp,
                dailyStreak: profile.daily_streak,
                weeklyStreak: profile.weekly_streak,
                lastActiveDate: profile.last_active_date,
                xpEarnedToday: profile.xp_earned_today || 0
            };
        }

        // Load tasks
        state.tasks = await apiRequest("/tasks") || [];

        // Load history logs
        state.history = await apiRequest("/history") || [];

        // Compile Achievements progress
        const serverAchs = await apiRequest("/achievements") || [];
        state.achievements = ACHIEVEMENT_TEMPLATES.map(tmpl => {
            const match = serverAchs.find(a => a.template_id === tmpl.id);
            return {
                ...tmpl,
                currentProgress: match ? match.current_progress : 0,
                unlocked: match ? match.unlocked === 1 : false,
                unlockDate: match ? match.unlock_date : null
            };
        });

        // Initialize display updates
        updateHeaderHUD();
        performDateTransitions();
        renderDashboard();
        notifyNewLog("Terminal synchronization sequence complete.");
    } catch (e) {
        console.error("Local startup failed", e);
        alert("Warning: LevelUp Life could not load saved progress. Try refreshing the page.");
    }
}

// Save User Profile states to server
async function syncUserProgress() {
    try {
        await apiRequest("/user/xp", {
            method: "PUT",
            body: JSON.stringify({
                xp: state.user.xp,
                level: state.user.level,
                dailyStreak: state.user.dailyStreak,
                weeklyStreak: state.user.weeklyStreak,
                xpEarnedToday: state.user.xpEarnedToday,
                lastActiveDate: state.user.lastActiveDate
            })
        });
    } catch (e) {
        console.error("Progress save failed", e);
    }
}

async function syncAchievementsProgress() {
    try {
        await apiRequest("/achievements", {
            method: "PUT",
            body: JSON.stringify({ achievements: state.achievements })
        });
    } catch (e) {
        console.error("Achievements save failed", e);
    }
}

// --- Combat Log ---
function addCombatLog(text) {
    const entry = {
        id: "log_" + Date.now(),
        text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };
    state.combatLog.unshift(entry);
    if (state.combatLog.length > 50) state.combatLog.pop();
    renderCombatLogs();
}

function renderCombatLogs() {
    const list = document.getElementById("combat-log-list");
    if (!list) return;

    if (state.combatLog.length === 0) {
        list.innerHTML = `<div class="empty-log-msg">No logs recorded yet.</div>`;
        return;
    }

    list.innerHTML = state.combatLog.map(entry => `
        <div class="log-entry">
            <span class="log-entry-text">&gt; ${entry.text}</span>
            <span class="log-entry-time">${entry.timestamp}</span>
        </div>
    `).join('');
}

function notifyNewLog(text) {
    addCombatLog(text);
    const badge = document.getElementById("log-badge-count");
    if (badge && !document.getElementById("combat-log-dropdown").classList.contains("active")) {
        const count = parseInt(badge.textContent) + 1;
        badge.textContent = count;
        badge.style.display = "flex";
    }
}

// --- Date Transitions ---
function getLocalDateString(date = new Date()) {
    return date.toISOString().split('T')[0];
}

async function performDateTransitions() {
    const todayStr = getLocalDateString();
    
    if (state.user.lastActiveDate && state.user.lastActiveDate !== todayStr) {
        const dailyTasks = state.tasks.filter(t => isTaskActiveToday(t));
        const allCompletedYesterday = dailyTasks.length > 0 && dailyTasks.every(t => t.completedToday);

        if (allCompletedYesterday) {
            state.user.dailyStreak += 1;
            notifyNewLog(`Quest streak maintained! Daily Streak: ${state.user.dailyStreak}`);
            
            if (state.user.dailyStreak % 7 === 0) {
                state.user.weeklyStreak += 1;
                state.user.xp += 100;
                notifyNewLog(`Weekly Streak Milestone! Earned +100 XP bonus!`);
            }
        } else {
            if (dailyTasks.some(t => !t.completedToday)) {
                notifyNewLog(`Daily quests missed. Streak reset to 0.`);
                state.user.dailyStreak = 0;
            }
        }

        // Reset tasks states locally, then update DB
        for (const t of state.tasks) {
            t.completedToday = false;
            await apiRequest(`/tasks/${t.id}`, {
                method: "PUT",
                body: JSON.stringify({ completedToday: false, streak: t.streak })
            });
        }

        state.user.lastActiveDate = todayStr;
        state.user.xpEarnedToday = 0;
        
        await syncUserProgress();
        updateAchievementsProgress();
        updateHeaderHUD();
        renderDashboard();
    }
}

// --- XP and Level Up Handling ---
async function awardXP(amount) {
    const currentLvlInfo = getLevelInfo(state.user.xp);
    state.user.xp += amount;
    state.user.xpEarnedToday += amount;
    
    const newLvlInfo = getLevelInfo(state.user.xp);
    
    if (newLvlInfo.level > currentLvlInfo.level) {
        triggerLevelUpOverlay(newLvlInfo.level, newLvlInfo.rank);
    }
    
    await syncUserProgress();
    updateAchievementsProgress();
    updateHeaderHUD();
    
    const activeTab = document.querySelector(".nav-item.active").getAttribute("data-tab");
    if (activeTab === "dashboard") renderDashboard();
    if (activeTab === "analytics") renderAnalytics();
}

function triggerLevelUpOverlay(newLvl, newRank) {
    SoundFX.playLevelUp();
    
    const modal = document.getElementById("levelup-modal");
    document.getElementById("levelup-level-num").textContent = newLvl;
    document.getElementById("levelup-new-rank").textContent = newRank;
    modal.style.display = "flex";
    
    notifyNewLog(`LEVEL UP! Reached Level ${newLvl} (${newRank})!`);
}

document.getElementById("close-levelup-btn").addEventListener("click", () => {
    SoundFX.playClick();
    document.getElementById("levelup-modal").style.display = "none";
});

// --- Navigation & Routing ---
function handleNavigation() {
    const navItems = document.querySelectorAll(".nav-item");
    const sections = document.querySelectorAll(".view-section");

    navItems.forEach(item => {
        item.addEventListener("click", function(e) {
            e.preventDefault();
            SoundFX.playClick();
            
            const targetTab = this.getAttribute("data-tab");
            navItems.forEach(nav => nav.classList.remove("active"));
            this.classList.add("active");
            
            sections.forEach(section => {
                section.classList.remove("active");
                if (section.id === targetTab) {
                    section.classList.add("active");
                }
            });

            document.querySelector(".sidebar").classList.remove("mobile-active");

            if (targetTab === "dashboard") renderDashboard();
            else if (targetTab === "quests") renderQuests();
            else if (targetTab === "calendar") renderCalendar();
            else if (targetTab === "achievements") renderAchievements();
            else if (targetTab === "analytics") renderAnalytics();
            else if (targetTab === "settings") renderSettings();
        });
    });

    document.querySelectorAll(".nav-shortcut").forEach(link => {
        link.addEventListener("click", function(e) {
            const target = this.getAttribute("data-target");
            document.querySelector(`.nav-item[data-tab="${target}"]`).click();
        });
    });

    // Mobile controls
    const mobileToggle = document.getElementById("mobile-sidebar-toggle");
    const sidebar = document.querySelector(".sidebar");
    
    mobileToggle.addEventListener("click", () => {
        SoundFX.playClick();
        sidebar.classList.toggle("mobile-active");
    });
}

// --- RENDER SCREEN: DASHBOARD ---
function renderDashboard() {
    const lvlInfo = getLevelInfo(state.user.xp);
    document.getElementById("banner-username").textContent = state.user.username;
    document.getElementById("dash-level-num").textContent = lvlInfo.level;
    document.getElementById("dash-rank-name").textContent = lvlInfo.rank;
    document.getElementById("dash-xp-progress").style.width = `${lvlInfo.progress}%`;
    document.getElementById("dash-xp-fraction").textContent = `${state.user.xp} / ${lvlInfo.max} XP`;
    document.getElementById("dash-xp-percent").textContent = `${Math.floor(lvlInfo.progress)}%`;

    const activeDailyTasks = state.tasks.filter(t => isTaskActiveToday(t));
    const completedDailies = activeDailyTasks.filter(t => t.completedToday).length;
    document.getElementById("dash-quests-completed").textContent = `${completedDailies} / ${activeDailyTasks.length}`;
    document.getElementById("dash-xp-earned-today").textContent = `+${state.user.xpEarnedToday}`;
    
    const nextRankIndex = RANK_THRESHOLDS.findIndex(r => r.level > lvlInfo.level);
    document.getElementById("dash-next-milestone").textContent = nextRankIndex !== -1 ? RANK_THRESHOLDS[nextRankIndex].rank : "Grand Master MAX";

    const questListDiv = document.getElementById("dash-quests-list");
    if (activeDailyTasks.length === 0) {
        questListDiv.innerHTML = `
            <div class="empty-quest-msg">
                <i data-lucide="scroll"></i>
                <p>No quests scheduled for today. Check the Quests tab to add recurring tasks!</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    questListDiv.innerHTML = activeDailyTasks.map(task => `
        <div class="quest-check-item">
            <label class="quest-checkbox-label">
                <input type="checkbox" class="quest-dash-toggle" data-id="${task.id}" ${task.completedToday ? 'checked' : ''}>
                <div class="checkbox-display"></div>
            </label>
            <div class="quest-check-details">
                <span class="quest-check-title">${task.title}</span>
                <span class="quest-check-category tag-${task.category}">${task.category}</span>
            </div>
            <div class="quest-check-reward">+${task.xp} XP</div>
        </div>
    `).join('');

    document.querySelectorAll(".quest-dash-toggle").forEach(checkbox => {
        checkbox.addEventListener("change", function() {
            toggleQuestComplete(this.getAttribute("data-id"), this.checked);
        });
    });

    renderWeeklyStreakDots();
    lucide.createIcons();
}

function isTaskActiveToday(task) {
    if (task.recurrenceType === "daily") return true;
    if (task.recurrenceType === "custom") {
        return task.recurrenceDays.includes(new Date().getDay());
    }
    return false;
}

function renderWeeklyStreakDots() {
    const daysContainer = document.getElementById("weekly-days-container");
    if (!daysContainer) return;
    
    const today = new Date().getDay();
    const daysMapping = [1, 2, 3, 4, 5, 6, 0];
    const dayElements = daysContainer.querySelectorAll(".week-day");
    
    dayElements.forEach((el, index) => {
        const dayNum = daysMapping[index];
        el.classList.remove("completed", "missed", "today");
        
        if (dayNum === today) {
            el.classList.add("today");
        }
        
        const dateOfDisplayDay = getPreviousDayOfWeekDate(dayNum);
        const dayCompleted = checkDayCompletions(dateOfDisplayDay);
        
        if (dayCompleted) el.classList.add("completed");
        else if (isDateInPast(dateOfDisplayDay)) el.classList.add("missed");
    });
}

function getPreviousDayOfWeekDate(targetDayNum) {
    const today = new Date();
    let diff = targetDayNum - today.getDay();
    if (diff > 0) diff -= 7;
    const d = new Date(today);
    d.setDate(today.getDate() + diff);
    return getLocalDateString(d);
}

function checkDayCompletions(dateStr) {
    if (dateStr === getLocalDateString()) {
        const activeToday = state.tasks.filter(t => isTaskActiveToday(t));
        return activeToday.length > 0 && activeToday.every(t => t.completedToday);
    }
    const completionsOnDay = state.history.filter(h => h.timestamp.startsWith(dateStr));
    const activeOnDay = countTasksActiveOnDayOfWeek(new Date(dateStr).getDay());
    return activeOnDay > 0 && completionsOnDay.length >= activeOnDay;
}

function countTasksActiveOnDayOfWeek(dayNum) {
    return state.tasks.filter(t => {
        if (t.recurrenceType === "daily") return true;
        if (t.recurrenceType === "custom") return t.recurrenceDays.includes(dayNum);
        return false;
    }).length;
}

function isDateInPast(dateStr) {
    return dateStr < getLocalDateString();
}

// --- RENDER SCREEN: QUEST BOARD ---
let activeQuestFilter = "all";
function renderQuests() {
    const container = document.getElementById("quests-grid-container");
    if (!container) return;

    const selectFilter = document.getElementById("category-filter-select").value;
    let filteredTasks = state.tasks;
    
    if (activeQuestFilter === "pending") filteredTasks = filteredTasks.filter(t => !t.completedToday);
    else if (activeQuestFilter === "completed") filteredTasks = filteredTasks.filter(t => t.completedToday);

    if (selectFilter !== "all") filteredTasks = filteredTasks.filter(t => t.category === selectFilter);

    // Sidebar counter
    const pendingCount = state.tasks.filter(t => isTaskActiveToday(t) && !t.completedToday).length;
    document.getElementById("pending-quests-count").textContent = pendingCount;

    if (filteredTasks.length === 0) {
        container.innerHTML = `<div class="empty-quest-msg" style="grid-column: 1/-1;"><i data-lucide="scroll"></i><p>No quests matching criteria.</p></div>`;
        lucide.createIcons();
        return;
    }

    container.innerHTML = filteredTasks.map(task => {
        const isActiveToday = isTaskActiveToday(task);
        return `
            <div class="quest-card glow-cyan ${task.completedToday ? 'completed' : ''}">
                <div class="quest-card-header">
                    <div>
                        <h3 class="quest-card-title">${task.title}</h3>
                        <span class="quest-badge tag-${task.category}">${task.category}</span>
                        ${task.recurrenceType === 'custom' ? 
                            `<span class="quest-badge tag-custom">Days: ${task.recurrenceDays.map(d => ['Su','Mo','Tu','We','Th','Fr','Sa'][d]).join(',')}</span>` :
                            `<span class="quest-badge tag-custom">Daily</span>`
                        }
                    </div>
                    <div class="quest-streak-badge" title="Quest Streaks"><i data-lucide="flame"></i> ${task.streak}</div>
                </div>
                <div class="quest-card-body"><p>${task.notes || 'No description.'}</p></div>
                <div class="quest-card-meta">
                    <div class="quest-check-reward">+${task.xp} XP Bounty</div>
                </div>
                <div class="quest-card-actions">
                    ${isActiveToday ? `
                        <button class="btn ${task.completedToday ? 'btn-secondary' : 'btn-primary'} btn-quick-toggle" data-id="${task.id}">
                            <i data-lucide="${task.completedToday ? 'rotate-ccw' : 'check'}"></i> 
                            ${task.completedToday ? 'Undo' : 'Complete'}
                        </button>
                    ` : ''}
                    <button class="action-btn btn-delete" data-id="${task.id}"><i data-lucide="trash-2"></i></button>
                </div>
            </div>
        `;
    }).join('');

    container.querySelectorAll(".btn-quick-toggle").forEach(btn => {
        btn.addEventListener("click", function() {
            const task = state.tasks.find(t => t.id === this.getAttribute("data-id"));
            toggleQuestComplete(task.id, !task.completedToday);
        });
    });

    container.querySelectorAll(".btn-delete").forEach(btn => {
        btn.addEventListener("click", function() {
            deleteQuest(this.getAttribute("data-id"));
        });
    });

    lucide.createIcons();
}

// Quest Filters
document.querySelectorAll(".filter-tab").forEach(tab => {
    tab.addEventListener("click", function() {
        SoundFX.playClick();
        document.querySelectorAll(".filter-tab").forEach(t => t.classList.remove("active"));
        this.classList.add("active");
        activeQuestFilter = this.getAttribute("data-filter");
        renderQuests();
    });
});

document.getElementById("category-filter-select").addEventListener("change", () => {
    SoundFX.playClick();
    renderQuests();
});

// Quest Creators Modal
const questModal = document.getElementById("quest-modal");
const createQuestForm = document.getElementById("create-quest-form");
const categorySelect = document.getElementById("quest-category");
const xpInput = document.getElementById("quest-xp");

categorySelect.addEventListener("change", function() {
    const val = this.value;
    if (val === "workout") xpInput.value = 50;
    else if (val === "reading") xpInput.value = 30;
    else if (val === "meditation") xpInput.value = 20;
    else xpInput.value = 40;
});

document.querySelectorAll("input[name='recurrence-type']").forEach(radio => {
    radio.addEventListener("change", function() {
        document.getElementById("custom-days-row").style.display = this.value === "custom" ? "block" : "none";
    });
});

document.getElementById("open-quest-modal-btn").addEventListener("click", () => {
    SoundFX.playClick();
    createQuestForm.reset();
    document.getElementById("custom-days-row").style.display = "none";
    questModal.style.display = "flex";
});

function closeQuestModal() { questModal.style.display = "none"; }
document.getElementById("close-quest-modal-btn").addEventListener("click", () => { SoundFX.playClick(); closeQuestModal(); });
document.getElementById("cancel-quest-modal-btn").addEventListener("click", () => { SoundFX.playClick(); closeQuestModal(); });

createQuestForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const title = document.getElementById("quest-title").value.trim();
    const category = categorySelect.value;
    const xp = parseInt(xpInput.value);
    const recurrenceType = document.querySelector("input[name='recurrence-type']:checked").value;
    const notes = document.getElementById("quest-notes").value.trim();
    
    let recurrenceDays = [];
    if (recurrenceType === "custom") {
        document.querySelectorAll("#custom-days-row input[type='checkbox']:checked").forEach(cb => {
            recurrenceDays.push(parseInt(cb.value));
        });
        if (recurrenceDays.length === 0) {
            SoundFX.playError();
            alert("Select scheduled days!");
            return;
        }
    }

    const taskId = "t_" + Date.now();
    const newQuest = { id: taskId, title, category, xp, recurrenceType, recurrenceDays, notes };

    try {
        await apiRequest("/tasks", {
            method: "POST",
            body: JSON.stringify(newQuest)
        });

        // Insert locally
        state.tasks.push({ ...newQuest, completedToday: false, streak: 0, createdDate: new Date().toISOString() });
        notifyNewLog(`New Quest launched: ${title} (+${xp} XP)`);
        SoundFX.playQuestComplete();
        closeQuestModal();
        renderQuests();
    } catch (err) {
        SoundFX.playError();
        alert("Failed to save quest to database.");
    }
});

async function toggleQuestComplete(taskId, completeStatus) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;

    task.completedToday = completeStatus;
    
    if (completeStatus) {
        task.streak += 1;
        
        // Log in database
        const hId = "h_" + Date.now();
        await apiRequest("/history", {
            method: "POST",
            body: JSON.stringify({ id: hId, title: task.title, category: task.category, xp: task.xp, timestamp: new Date().toISOString() })
        });

        state.history.push({ id: hId, title: task.title, category: task.category, xp: task.xp, timestamp: new Date().toISOString() });
        notifyNewLog(`Completed quest: ${task.title}. Gained +${task.xp} XP!`);
        SoundFX.playQuestComplete();
        triggerConfettiEffect();
        await awardXP(task.xp);
    } else {
        task.streak = Math.max(0, task.streak - 1);
        
        const histIndex = state.history.map(h => h.title).lastIndexOf(task.title);
        if (histIndex !== -1) {
            const item = state.history[histIndex];
            state.history.splice(histIndex, 1);
        }
        // clear from database history
        await apiRequest("/history", { method: "DELETE" });

        notifyNewLog(`Undo quest: ${task.title}. Lost -${task.xp} XP.`);
        SoundFX.playError();
        await awardXP(-task.xp);
    }

    // Sync task status to DB
    await apiRequest(`/tasks/${task.id}`, {
        method: "PUT",
        body: JSON.stringify({ completedToday: task.completedToday, streak: task.streak })
    });

    renderDashboard();
    renderQuests();
}

async function deleteQuest(taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (confirm(`Abandon quest "${task.title}"?`)) {
        try {
            await apiRequest(`/tasks/${taskId}`, { method: "DELETE" });
            state.tasks = state.tasks.filter(t => t.id !== taskId);
            notifyNewLog(`Quest abandoned: ${task.title}`);
            SoundFX.playError();
            renderQuests();
        } catch (e) {
            alert("Delete sequence failed.");
        }
    }
}

// Confetti Particle Celebration
function triggerConfettiEffect() {
    const canvas = document.createElement("canvas");
    canvas.style.position = "fixed";
    canvas.style.top = "0"; canvas.style.left = "0";
    canvas.style.width = "100%"; canvas.style.height = "100%";
    canvas.style.pointerEvents = "none"; canvas.style.zIndex = "9999";
    document.body.appendChild(canvas);

    const ctx = canvas.getContext("2d");
    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;

    const colors = ["#00D4FF", "#39FF14", "#7B2FF7", "#FF7A00", "#FFD700"];
    const particles = [];

    for (let i = 0; i < 45; i++) {
        particles.push({
            x: Math.random() * width,
            y: height + Math.random() * 20,
            vx: (Math.random() - 0.5) * 8,
            vy: -Math.random() * 12 - 8,
            size: Math.random() * 6 + 4,
            color: colors[Math.floor(Math.random() * colors.length)],
            alpha: 1,
            decay: Math.random() * 0.015 + 0.01
        });
    }

    function animate() {
        ctx.clearRect(0, 0, width, height);
        let alive = false;
        particles.forEach(p => {
            p.x += p.vx; p.y += p.vy;
            p.vy += 0.25; p.alpha -= p.decay;
            if (p.alpha > 0) {
                alive = true;
                ctx.fillStyle = p.color;
                ctx.globalAlpha = p.alpha;
                ctx.fillRect(p.x, p.y, p.size, p.size);
            }
        });
        if (alive) requestAnimationFrame(animate);
        else document.body.removeChild(canvas);
    }
    animate();
}

// --- RENDER SCREEN: DYNAMIC MONTH CALENDAR ---
let calendarDate = new Date(); // State tracker for current displayed calendar month

async function renderCalendar() {
    const gridCells = document.getElementById("calendar-grid-cells");
    const monthYearTitle = document.getElementById("calendar-month-year");
    if (!gridCells || !monthYearTitle) return;

    gridCells.innerHTML = "";

    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth(); // 0-11

    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    monthYearTitle.textContent = `${months[month]} ${year}`;

    // Get first day of the month and count of days
    const firstDay = new Date(year, month, 1).getDay(); // 0-6 (0 is Sunday)
    // Convert firstDay Sunday from 0 to 7 to match Mon-Sun index (1-7)
    const startOffset = firstDay === 0 ? 6 : firstDay - 1;

    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Render preceding empty padding cells representing previous month overlap
    for (let i = 0; i < startOffset; i++) {
        const emptyCell = document.createElement("div");
        emptyCell.className = "calendar-cell";
        gridCells.appendChild(emptyCell);
    }

    // Render calendar days
    const todayStr = getLocalDateString();
    
    for (let day = 1; day <= daysInMonth; day++) {
        const cellDate = new Date(year, month, day);
        const cellDateStr = getLocalDateString(cellDate);
        
        const cell = document.createElement("div");
        cell.className = "calendar-cell active-month";
        if (cellDateStr === todayStr) {
            cell.classList.add("today-cell");
        }

        // Calculate completions and active tasks scheduled for this day
        const completions = state.history.filter(h => h.timestamp.startsWith(cellDateStr));
        const activeTasks = countTasksActiveOnDayOfWeek(cellDate.getDay());

        if (completions.length > 0) {
            if (activeTasks > 0 && completions.length >= activeTasks) {
                cell.classList.add("completions-all");
            } else {
                cell.classList.add("completions-some");
            }
        } else if (isDateInPast(cellDateStr) && activeTasks > 0) {
            cell.classList.add("completions-none", "past-day");
        }

        // Draw indicator dots for completions
        let dotsHtml = "";
        const categories = { workout: "#FF7A00", reading: "#00D4FF", meditation: "#7B2FF7", custom: "#8E99B3" };
        
        completions.forEach(c => {
            const color = categories[c.category] || "#FFFFFF";
            dotsHtml += `<div class="indicator-dot" style="background-color:${color}" title="${c.title}"></div>`;
        });

        // Setup tooltip text details on hover
        const completionList = completions.map(c => `• ${c.title}`).join('<br>') || "None";
        const tooltipHtml = `
            <div class="calendar-cell-tooltip">
                <b>Date:</b> ${cellDate.toLocaleDateString()}<br>
                <b>Completions:</b> ${completions.length} / ${activeTasks}<br>
                <hr style="border-color:rgba(255,255,255,0.05); margin:3px 0;">
                <span style="color:var(--text-muted)">${completionList}</span>
            </div>
        `;

        cell.innerHTML = `
            <span class="calendar-day-num">${day}</span>
            <div class="calendar-indicator-dots">${dotsHtml}</div>
            ${tooltipHtml}
        `;
        
        gridCells.appendChild(cell);
    }

    lucide.createIcons();
}

// Hook up calendar monthly buttons
document.getElementById("prev-month-btn").addEventListener("click", () => {
    SoundFX.playClick();
    calendarDate.setMonth(calendarDate.getMonth() - 1);
    renderCalendar();
});

document.getElementById("next-month-btn").addEventListener("click", () => {
    SoundFX.playClick();
    calendarDate.setMonth(calendarDate.getMonth() + 1);
    renderCalendar();
});

// --- RENDER SCREEN: ACHIEVEMENTS ---
function renderAchievements() {
    const container = document.getElementById("badges-grid-container");
    if (!container) return;

    container.innerHTML = state.achievements.map(ach => {
        const percent = (ach.currentProgress / ach.target) * 100;
        return `
            <div class="badge-item ${ach.unlocked ? 'unlocked' : ''}">
                <div class="badge-crest-wrapper">
                    <div class="badge-glow-circle"></div>
                    <i data-lucide="${ach.icon}"></i>
                </div>
                <div class="badge-name">${ach.name}</div>
                <div class="badge-desc">${ach.description}</div>
                ${ach.unlocked ? 
                    `<div class="badge-date-locked">UNLOCKED<br>${ach.unlockDate}</div>` : 
                    `
                    <div class="badge-progress-bar">
                        <div class="badge-progress-fill" style="width: ${percent}%;"></div>
                    </div>
                    <div class="badge-date-locked" style="color:var(--text-muted)">${ach.currentProgress} / ${ach.target}</div>
                    `
                }
            </div>
        `;
    }).join('');

    renderLeaderboard();
    lucide.createIcons();
}

async function renderLeaderboard() {
    const container = document.getElementById("leaderboard-list-container");
    if (!container) return;

    try {
        const combinedList = await apiRequest("/leaderboard") || [];
        
        container.innerHTML = combinedList.map((player, index) => {
            let miniAvatarSvg = "";
            if (player.avatar === "ninja") {
                miniAvatarSvg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='48' fill='%231F2940' stroke='%2300D4FF' stroke-width='4'/><path d='M50,25 A15,15 0 0,1 50,55 A15,15 0 0,1 50,25 Z' fill='%237B2FF7'/><path d='M20,80 C20,65 30,60 50,60 C70,60 80,65 80,80 Z' fill='%2300D4FF'/></svg>`;
            } else if (player.avatar === "mage") {
                miniAvatarSvg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='48' fill='%231F2940' stroke='%237B2FF7' stroke-width='4'/><polygon points='50,15 25,45 75,45' fill='%23FF7A00'/><path d='M20,80 C20,65 30,60 50,60 C70,60 80,65 80,80 Z' fill='%237B2FF7'/></svg>`;
            } else {
                miniAvatarSvg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='48' fill='%231F2940' stroke='%23FFD700' stroke-width='4'/><circle cx='50' cy='35' r='12' fill='%23FFD700'/><path d='M20,80 C20,60 30,60 50,60 C70,60 80,60 80,80 Z' fill='%2339FF14'/></svg>`;
            }

            const isUser = player.name === state.user.username;

            return `
                <div class="leaderboard-row ${isUser ? 'user-row' : ''}">
                    <div class="leaderboard-rank">#${index + 1}</div>
                    <div class="leaderboard-avatar-mini">
                        <img src="data:image/svg+xml;utf8,${encodeURIComponent(miniAvatarSvg)}" alt="avatar">
                    </div>
                    <div class="leaderboard-user-details">
                        <div class="leaderboard-name">${player.name} ${isUser ? '(YOU)' : ''}</div>
                        <div class="leaderboard-rank-title">Level ${player.level} - ${player.rankTitle}</div>
                    </div>
                    <div class="leaderboard-score">${player.xp} XP</div>
                </div>
            `;
        }).join('');
    } catch (e) {
        console.error("Leaderboard query fail", e);
    }
}

// --- RENDER SCREEN: ANALYTICS ---
function renderAnalytics() {
    const totalCompletions = state.history.length;
    document.getElementById("stat-total-completions").textContent = totalCompletions;
    document.getElementById("stat-current-streak").textContent = state.user.dailyStreak;
    
    const storedMaxStreak = parseInt(localStorage.getItem("levelup_max_streak") || "0");
    const currentMax = Math.max(storedMaxStreak, state.user.dailyStreak);
    localStorage.setItem("levelup_max_streak", currentMax.toString());
    document.getElementById("stat-max-streak").textContent = currentMax;

    let avgXp = 0;
    if (state.history.length > 0) {
        const timestamps = state.history.map(h => new Date(h.timestamp).toDateString());
        const uniqueDays = [...new Set(timestamps)].length;
        const totalXpEarned = state.history.reduce((sum, h) => sum + h.xp, 0);
        avgXp = uniqueDays > 0 ? Math.round(totalXpEarned / uniqueDays) : 0;
    }
    document.getElementById("stat-daily-avg-xp").textContent = `${avgXp} XP`;

    renderLineChart();
    renderDonutChart();

    const logTbody = document.getElementById("history-log-tbody");
    if (!logTbody) return;

    if (state.history.length === 0) {
        logTbody.innerHTML = `<tr><td colspan="4" style="text-align: center;">No quests logged yet.</td></tr>`;
        return;
    }

    const sortedHistory = [...state.history].sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));

    logTbody.innerHTML = sortedHistory.map(item => `
        <tr>
            <td>${new Date(item.timestamp).toLocaleString()}</td>
            <td>${item.title}</td>
            <td><span class="quest-badge tag-${item.category}">${item.category}</span></td>
            <td style="color:var(--gold); font-weight:700;">+${item.xp} XP</td>
        </tr>
    `).join('');
}

function renderLineChart() {
    const svg = document.getElementById("svg-xp-line-chart");
    if (!svg) return;

    const daysData = [];
    const dateLabels = [];
    
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = getLocalDateString(d);
        
        const xpOnDay = state.history
            .filter(h => h.timestamp.startsWith(dateStr))
            .reduce((sum, h) => sum + h.xp, 0);
        
        daysData.push(xpOnDay);
        dateLabels.push(d.toLocaleDateString([], { weekday: 'short' }));
    }

    const maxVal = Math.max(...daysData, 100);
    const svgWidth = 500;
    const svgHeight = 200;
    const paddingLeft = 40;
    const paddingRight = 20;
    const paddingTop = 20;
    const paddingBottom = 30;

    const chartWidth = svgWidth - paddingLeft - paddingRight;
    const chartHeight = svgHeight - paddingTop - paddingBottom;

    const points = daysData.map((val, idx) => {
        const x = paddingLeft + (idx / 6) * chartWidth;
        const y = paddingTop + chartHeight - (val / maxVal) * chartHeight;
        return { x, y, val };
    });

    let pathD = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
        pathD += ` L ${points[i].x} ${points[i].y}`;
    }

    const areaD = `${pathD} L ${points[points.length-1].x} ${paddingTop + chartHeight} L ${points[0].x} ${paddingTop + chartHeight} Z`;

    svg.innerHTML = `
        <defs>
            <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="var(--electric-blue)" stop-opacity="0.4"/>
                <stop offset="100%" stop-color="var(--electric-blue)" stop-opacity="0"/>
            </linearGradient>
        </defs>

        <line x1="${paddingLeft}" y1="${paddingTop}" x2="${svgWidth - paddingRight}" y2="${paddingTop}" stroke="rgba(255,255,255,0.05)" stroke-width="1" />
        <line x1="${paddingLeft}" y1="${paddingTop + chartHeight/2}" x2="${svgWidth - paddingRight}" y2="${paddingTop + chartHeight/2}" stroke="rgba(255,255,255,0.05)" stroke-width="1" />
        <line x1="${paddingLeft}" y1="${paddingTop + chartHeight}" x2="${svgWidth - paddingRight}" y2="${paddingTop + chartHeight}" stroke="rgba(255,255,255,0.1)" stroke-width="1" />

        <text x="${paddingLeft - 10}" y="${paddingTop + 5}" fill="var(--text-muted)" font-size="9" text-anchor="end">${maxVal} XP</text>
        <text x="${paddingLeft - 10}" y="${paddingTop + chartHeight/2 + 3}" fill="var(--text-muted)" font-size="9" text-anchor="end">${Math.round(maxVal/2)} XP</text>
        <text x="${paddingLeft - 10}" y="${paddingTop + chartHeight + 3}" fill="var(--text-muted)" font-size="9" text-anchor="end">0</text>

        <path d="${areaD}" fill="url(#chartGradient)"/>
        <path d="${pathD}" fill="none" stroke="var(--electric-blue)" stroke-width="3" filter="drop-shadow(0 0 5px var(--electric-blue))"/>

        ${points.map((p, idx) => `
            <circle cx="${p.x}" cy="${p.y}" r="5" fill="var(--bg-primary)" stroke="var(--electric-blue)" stroke-width="2" />
            <text x="${p.x}" y="${p.y - 10}" fill="var(--white)" font-size="8" font-weight="700" text-anchor="middle">${p.val > 0 ? p.val : ''}</text>
            <text x="${p.x}" y="${paddingTop + chartHeight + 18}" fill="var(--text-muted)" font-size="9" font-weight="500" text-anchor="middle">${dateLabels[idx]}</text>
        `).join('')}
    `;
}

function renderDonutChart() {
    const svg = document.getElementById("svg-donut-chart");
    const legend = document.getElementById("donut-legend-container");
    if (!svg || !legend) return;

    const categories = ["workout", "reading", "meditation", "custom"];
    const counts = { workout: 0, reading: 0, meditation: 0, custom: 0 };
    
    state.history.forEach(h => {
        if (categories.includes(h.category)) counts[h.category]++;
        else counts.custom++;
    });

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const colors = { workout: "var(--orange)", reading: "var(--electric-blue)", meditation: "var(--purple)", custom: "var(--text-muted)" };

    if (total === 0) {
        svg.innerHTML = `<circle cx="100" cy="100" r="70" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="25"/>
                         <text x="100" y="105" fill="var(--text-muted)" font-size="10" font-weight="700" text-anchor="middle">NO DATA</text>`;
        legend.innerHTML = `<div class="legend-item"><div class="legend-color-box" style="background-color:rgba(255,255,255,0.1)"></div><span>Empty (0)</span></div>`;
        return;
    }

    let cumulativePercent = 0;
    let pathsSvg = "";
    
    Object.entries(counts).forEach(([cat, val]) => {
        if (val === 0) return;
        const percent = val / total;
        const startX = getCoordinatesForPercent(cumulativePercent)[0];
        const startY = getCoordinatesForPercent(cumulativePercent)[1];
        cumulativePercent += percent;
        const endX = getCoordinatesForPercent(cumulativePercent)[0];
        const endY = getCoordinatesForPercent(cumulativePercent)[1];
        const largeArcFlag = percent > 0.5 ? 1 : 0;
        
        pathsSvg += `
            <path d="M ${startX} ${startY} A 70 70 0 ${largeArcFlag} 1 ${endX} ${endY}" fill="none" stroke="${colors[cat]}" stroke-width="25" filter="drop-shadow(0 0 3px ${colors[cat]})" />
        `;
    });

    svg.innerHTML = pathsSvg + `
        <circle cx="100" cy="100" r="45" fill="var(--card-bg)" />
        <text x="100" y="98" fill="var(--text-muted)" font-family="var(--font-heading)" font-size="8" text-anchor="middle">TOTAL</text>
        <text x="100" y="115" fill="var(--white)" font-family="var(--font-heading)" font-size="16" font-weight="900" text-anchor="middle">${total}</text>
    `;

    legend.innerHTML = Object.entries(counts).map(([cat, val]) => {
        if (val === 0) return "";
        const share = Math.round((val / total) * 100);
        return `
            <div class="legend-item">
                <div class="legend-color-box" style="background-color:${colors[cat]}"></div>
                <span style="text-transform:capitalize;">${cat}: ${val} (${share}%)</span>
            </div>
        `;
    }).join('');
}

function getCoordinatesForPercent(percent) {
    const x = 100 + Math.cos(2 * Math.PI * percent - Math.PI / 2) * 70;
    const y = 100 + Math.sin(2 * Math.PI * percent - Math.PI / 2) * 70;
    return [x, y];
}

// --- RENDER SCREEN: SETTINGS ---
function renderSettings() {
    document.getElementById("settings-username-input").value = state.user.username;
    
    document.querySelectorAll(".avatar-select-option").forEach(opt => {
        opt.classList.remove("active");
        if (opt.getAttribute("data-avatar") === state.user.avatar) {
            opt.classList.add("active");
        }
    });

    const isMuted = localStorage.getItem("levelup_audio_muted") === "true";
    SoundFX.muted = isMuted;
    
    const audioIcon = document.getElementById("audio-icon");
    audioIcon.setAttribute("data-lucide", isMuted ? "volume-x" : "volume-2");
    lucide.createIcons();
}

document.getElementById("profile-settings-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const newName = document.getElementById("settings-username-input").value.trim();
    const activeAvatar = document.querySelector(".avatar-select-option.active").getAttribute("data-avatar");
    
    if (!newName) return;

    try {
        await apiRequest("/user/profile", {
            method: "PUT",
            body: JSON.stringify({ username: newName, avatar: activeAvatar })
        });

        state.user.username = newName;
        state.user.avatar = activeAvatar;
        updateHeaderHUD();
        notifyNewLog(`Player profile synced.`);
        SoundFX.playQuestComplete();
        alert("Profile details saved!");
    } catch (err) {
        alert("Profile save failed.");
    }
});

document.querySelectorAll(".avatar-select-option").forEach(opt => {
    opt.addEventListener("click", function() {
        SoundFX.playClick();
        document.querySelectorAll(".avatar-select-option").forEach(o => o.classList.remove("active"));
        this.classList.add("active");
    });
});

// Diagnostics trigger reminders sweep
document.getElementById("simulate-reset-btn").addEventListener("click", async () => {
    SoundFX.playClick();
    notifyNewLog("Diagnostics: Manual reminders scan triggered.");
    try {
        const res = await apiRequest("/reminders/trigger", { method: "POST" });
        alert(res.message);
    } catch (e) {
        alert("Diagnostics reminders daemon sweep failed.");
    }
});

// Reset account database
document.getElementById("reset-database-btn").addEventListener("click", async () => {
    SoundFX.playError();
    if (confirm("Permanently wipe all quest configurations and reset XP logs?")) {
        try {
            state.history = [];
            await apiRequest("/history", { method: "DELETE" });
            // Remove tasks
            for (const t of state.tasks) {
                await apiRequest(`/tasks/${t.id}`, { method: "DELETE" });
            }
            state.tasks = [];
            state.user.xp = 0;
            state.user.level = 1;
            state.user.dailyStreak = 0;
            state.user.weeklyStreak = 0;
            state.user.xpEarnedToday = 0;
            await syncUserProgress();
            
            updateHeaderHUD();
            notifyNewLog("Local progress database formatted.");
            SoundFX.playLevelUp();
            alert("Database formatted!");
            document.querySelector(".nav-item[data-tab='dashboard']").click();
        } catch (e) {
            alert("Reset sequence failed.");
        }
    }
});

// Sound toggles
document.getElementById("audio-toggle-btn").addEventListener("click", function() {
    SoundFX.muted = !SoundFX.muted;
    localStorage.setItem("levelup_audio_muted", SoundFX.muted.toString());
    
    const audioIcon = document.getElementById("audio-icon");
    if (SoundFX.muted) {
        audioIcon.setAttribute("data-lucide", "volume-x");
        notifyNewLog("Terminal audio systems muted.");
    } else {
        audioIcon.setAttribute("data-lucide", "volume-2");
        notifyNewLog("Terminal audio systems online.");
        SoundFX.playClick();
    }
    lucide.createIcons();
});

// --- Achievements Progression ---
function updateAchievementsProgress() {
    let stateChanged = false;
    const totalCompletions = state.history.length;
    const currentStreak = state.user.dailyStreak;
    const userLvl = getLevelInfo(state.user.xp).level;

    const categoryCounts = {};
    state.history.forEach(log => {
        categoryCounts[log.category] = (categoryCounts[log.category] || 0) + 1;
    });

    state.achievements.forEach(ach => {
        if (ach.unlocked) return;

        let progress = 0;
        switch (ach.type) {
            case "completions": progress = totalCompletions; break;
            case "streak": progress = currentStreak; break;
            case "level": progress = userLvl; break;
            case "category": progress = categoryCounts[ach.category] || 0; break;
            case "category_combo":
                ach.categories.forEach(cat => { progress += (categoryCounts[cat] || 0); });
                break;
        }

        ach.currentProgress = Math.min(progress, ach.target);
        
        if (ach.currentProgress >= ach.target && !ach.unlocked) {
            ach.unlocked = true;
            ach.unlockDate = new Date().toLocaleDateString();
            stateChanged = true;
            notifyNewLog(`Achievement unlocked: ${ach.name}!`);
        }
    });

    if (stateChanged) {
        syncAchievementsProgress();
    }
}

function updateHeaderHUD() {
    document.getElementById("total-xp-val").textContent = state.user.xp;
    document.getElementById("daily-streak-val").textContent = state.user.dailyStreak;
    document.getElementById("weekly-streak-val").textContent = state.user.weeklyStreak;
    
    const lvlInfo = getLevelInfo(state.user.xp);
    document.getElementById("sidebar-level-num").textContent = lvlInfo.level;
    document.getElementById("sidebar-username").textContent = state.user.username;
    document.getElementById("sidebar-rank").textContent = lvlInfo.rank;

    updateAvatarDisplay();
}

function updateAvatarDisplay() {
    const avatarImg = document.getElementById("profile-avatar");
    let svgContent = "";
    
    if (state.user.avatar === "ninja") {
        svgContent = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='48' fill='%231F2940' stroke='%2300D4FF' stroke-width='4'/><path d='M50,25 A15,15 0 0,1 50,55 A15,15 0 0,1 50,25 Z' fill='%237B2FF7'/><path d='M20,80 C20,65 30,60 50,60 C70,60 80,65 80,80 Z' fill='%2300D4FF'/></svg>`;
    } else if (state.user.avatar === "mage") {
        svgContent = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='48' fill='%231F2940' stroke='%237B2FF7' stroke-width='4'/><polygon points='50,15 25,45 75,45' fill='%23FF7A00'/><path d='M20,80 C20,65 30,60 50,60 C70,60 80,65 80,80 Z' fill='%237B2FF7'/></svg>`;
    } else {
        svgContent = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='48' fill='%231F2940' stroke='%23FFD700' stroke-width='4'/><circle cx='50' cy='35' r='12' fill='%23FFD700'/><path d='M20,80 C20,60 30,60 50,60 C70,60 80,60 80,80 Z' fill='%2339FF14'/></svg>`;
    }
    
    avatarImg.src = `data:image/svg+xml;utf8,${encodeURIComponent(svgContent)}`;
}

function updateDateDisplay() {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const now = new Date();
    document.getElementById("current-day").textContent = days[now.getDay()];
    document.getElementById("current-date").textContent = `${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
}

function setupCombatLogDropdown() {
    const trigger = document.getElementById("log-trigger-btn");
    const dropdown = document.getElementById("combat-log-dropdown");

    trigger.addEventListener("click", (e) => {
        e.stopPropagation();
        SoundFX.playClick();
        dropdown.classList.toggle("active");
        
        const badge = document.getElementById("log-badge-count");
        badge.style.display = "none";
        badge.textContent = "0";
    });

    document.addEventListener("click", () => { dropdown.classList.remove("active"); });
}

// --- App Initialization ---
document.addEventListener("DOMContentLoaded", () => {
    const isMuted = localStorage.getItem("levelup_audio_muted") === "true";
    SoundFX.muted = isMuted;

    handleNavigation();
    updateDateDisplay();
    setupCombatLogDropdown();
    initAuth();

    document.body.addEventListener("click", () => { SoundFX.init(); }, { once: true });
});
