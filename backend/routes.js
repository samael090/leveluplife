/* ==========================================================================
   LevelUp Life Backend Routing Controller
   Authentications, Tasks CRUD, History sync, Rivals Leaderboard calculations
   Daily Reset Checks with Missed Quests Penalties (-10 XP)
   ========================================================================== */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('./db');
const { sendWelcomeEmail } = require('./services/reminder');

const JWT_SECRET = process.env.JWT_SECRET || 'cyber_neon_glow_secret_key_2026';

// --- Level Formulas ---
function getLevelFromXp(xp) {
    if (xp < 500) return 1;
    if (xp < 1500) return 2;
    if (xp < 3000) return 3;
    if (xp < 5000) return 4;
    return 5 + Math.floor((xp - 5000) / 2500);
}

function getLocalDateString(date = new Date()) {
    // Return YYYY-MM-DD formatted date string in user local timezone
    return date.toISOString().split('T')[0];
}

const getBaseXp = (category) => {
    if (category === 'workout') return 35; // 30-40 range
    if (category === 'food') return 25;    // 20-30 range
    if (category === 'water') return 15;   // 10-20 range
    if (category === 'meditation') return 20;
    return 20;
};

// --- Daily Transition Reset Check Middleware ---
async function performDailyResetCheck(userId) {
    const user = await query.get('SELECT xp, level, daily_streak, last_active_date FROM users WHERE id = ?', [userId]);
    if (!user) return;

    // Get today's local date string
    const todayStr = getLocalDateString();
    const lastActiveStr = user.last_active_date;

    if (lastActiveStr && lastActiveStr !== todayStr) {
        console.log(`[DAILY RESET] Triggering date transition check for User ID: ${userId}. Last active: ${lastActiveStr}, Today: ${todayStr}`);

        // Loop intermediate days from lastActiveStr up to yesterday
        let activeDate = new Date(lastActiveStr + 'T12:00:00'); // Midday to prevent timezone shifts
        let daysToProcess = [];
        
        while (true) {
            activeDate.setDate(activeDate.getDate() + 1);
            const checkStr = getLocalDateString(activeDate);
            if (checkStr >= todayStr) break;
            daysToProcess.push(checkStr);
        }
        daysToProcess.push(todayStr); // Today's reset processing
        
        // Query user's current tasks
        const tasks = await query.all('SELECT * FROM tasks WHERE user_id = ?', [userId]);
        
        let totalDeduction = 0;
        let newStreak = user.daily_streak;

        // Process each missed day sequentially
        for (let i = 0; i < daysToProcess.length - 1; i++) {
            const dateStr = daysToProcess[i];
            const checkDay = new Date(dateStr + 'T12:00:00').getDay();

            // Which tasks were active on that target day?
            const activeTasks = tasks.filter(t => {
                if (t.recurrence_type === 'daily') return true;
                const recDays = JSON.parse(t.recurrence_days || '[]');
                return recDays.includes(checkDay);
            });

            // For intermediate missed days (when player didn't log in at all),
            // all active daily quests are marked missed and penalized.
            // For the first transitioned day (yesterday), check if completed_today was 0.
            for (const task of activeTasks) {
                const wasCompleted = (i === 0 && task.completed_today === 1);
                
                if (!wasCompleted) {
                    totalDeduction += 10;
                    
                    // Log permanent failure in history logs (Shows the task is unfinished forever)
                    await query.run(`
                        INSERT INTO history (id, user_id, title, category, xp, timestamp)
                        VALUES (?, ?, ?, ?, -10, ?)
                    `, ['f_' + Date.now() + '_' + Math.floor(Math.random()*10000), userId, `[FAILED] Missed: ${task.title}`, task.category, dateStr + 'T23:59:59Z']);
                }
            }
            
            // If they missed any active tasks on a day, daily streak resets
            const missedAny = activeTasks.some(t => {
                const wasCompleted = (i === 0 && t.completed_today === 1);
                return !wasCompleted;
            });
            if (missedAny) {
                newStreak = 0;
            }
        }

        // Apply XP deduction penalty (capped at 0)
        let newXp = Math.max(0, user.xp - totalDeduction);
        let newLevel = getLevelFromXp(newXp);

        // Reset tasks completed_today status for today, reset task streaks for missed tasks
        for (const t of tasks) {
            let tStreak = t.streak;
            if (t.completed_today === 0) {
                tStreak = 0; // reset task streak
            }
            await query.run('UPDATE tasks SET completed_today = 0, streak = ? WHERE id = ?', [tStreak, t.id]);
        }

        // Save updated statistics to User profile
        await query.run(`
            UPDATE users 
            SET xp = ?, level = ?, daily_streak = ?, last_active_date = ?, xp_earned_today = 0
            WHERE id = ?
        `, [newXp, newLevel, newStreak, todayStr, userId]);
        
        console.log(`[DAILY RESET DONE] User ${userId} processed. Total deduction: -${totalDeduction} XP, New XP: ${newXp}, New Streak: ${newStreak}`);
    }
}

// --- Authentication Middleware ---
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: "Access token required" });
    }
    
    jwt.verify(token, JWT_SECRET, async (err, decoded) => {
        if (err) {
            return res.status(403).json({ error: "Invalid or expired token session" });
        }
        req.user = decoded;
        
        // Auto-check date resets on every authenticated API fetch
        try {
            await performDailyResetCheck(decoded.id);
        } catch (e) {
            console.error("Daily Reset Check Error:", e);
        }
        next();
    });
}

// --- Auth Endpoints ---

// Register Player Codex Name, Email, and Phone
router.post('/auth/register', async (req, res) => {
    try {
        const { username, email, phone, password } = req.body;
        
        if (!username || !email || !password) {
            return res.status(400).json({ error: "Missing required profile credentials" });
        }

        // Verify if user already exists
        const existing = await query.get('SELECT id FROM users WHERE email = ?', [email.toLowerCase().trim()]);
        if (existing) {
            return res.status(400).json({ error: "Email terminal is already registered" });
        }

        // Encrypt password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        const todayStr = getLocalDateString();

        // Insert new user
        const result = await query.run(`
            INSERT INTO users (username, email, phone, password_hash, xp, level, daily_streak, weekly_streak, last_active_date, avatar)
            VALUES (?, ?, ?, ?, 0, 1, 0, 0, ?, 'ninja')
        `, [username.trim(), email.toLowerCase().trim(), phone ? phone.trim() : null, passwordHash, todayStr]);

        const userId = result.id;

        // Populate newly registered user with primary starting default quests (Water, Food, Workout, Meditation)
        const defaultQuests = [
            { id: "t_init_1", title: "Drink 8 glasses of water", category: "water", xp: 15, recType: "daily", recDays: "[]", notes: "Consume at least 2.5 liters of water to maintain high cognitive levels." },
            { id: "t_init_2", title: "Eat healthy balanced meals", category: "food", xp: 25, recType: "daily", recDays: "[]", notes: "Focus on proteins, whole foods, and vegetables. Avoid processed sugars." },
            { id: "t_init_3", title: "Daily Workout session", category: "workout", xp: 35, recType: "daily", recDays: "[]", notes: "Perform 30 minutes of physical training or active cardio." },
            { id: "t_init_4", title: "Meditation & mindfulness", category: "meditation", xp: 20, recType: "daily", recDays: "[]", notes: "15 minutes of breathing meditation to stabilize the focus buffer." }
        ];

        for (const q of defaultQuests) {
            await query.run(`
                INSERT INTO tasks (id, user_id, title, category, xp, recurrence_type, recurrence_days, completed_today, streak, notes, created_date)
                VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
            `, [q.id, userId, q.title, q.category, q.xp, q.recType, q.recDays, q.notes, new Date().toISOString()]);
        }

        // Send welcoming web-styled HTML email via nodemailer (Mocks to console if SMTP is not config)
        await sendWelcomeEmail(email.toLowerCase().trim(), username.trim());

        // Generate session JWT token
        const token = jwt.sign({ id: userId, email }, JWT_SECRET, { expiresIn: '7d' });
        res.status(201).json({ token, username, email, userId });

    } catch (err) {
        console.error("Registration error:", err);
        res.status(500).json({ error: "Server error during registration sequence" });
    }
});

// Login Player
router.post('/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: "Missing identity credentials" });
        }

        const user = await query.get('SELECT * FROM users WHERE email = ?', [email.toLowerCase().trim()]);
        if (!user) {
            return res.status(400).json({ error: "Invalid email codex or password combination" });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(400).json({ error: "Invalid email codex or password combination" });
        }

        // Trigger date transition check upon login
        await performDailyResetCheck(user.id);

        // Fetch refreshed user record
        const refreshedUser = await query.get('SELECT * FROM users WHERE id = ?', [user.id]);

        const token = jwt.sign({ id: refreshedUser.id, email: refreshedUser.email }, JWT_SECRET, { expiresIn: '7d' });
        res.json({
            token,
            user: {
                id: refreshedUser.id,
                username: refreshedUser.username,
                email: refreshedUser.email,
                phone: refreshedUser.phone,
                xp: refreshedUser.xp,
                level: refreshedUser.level,
                dailyStreak: refreshedUser.daily_streak,
                weeklyStreak: refreshedUser.weekly_streak,
                avatar: refreshedUser.avatar,
                lastActiveDate: refreshedUser.last_active_date
            }
        });

    } catch (err) {
        console.error("Login error:", err);
        res.status(500).json({ error: "Server error during handshake sequence" });
    }
});

// --- Profile Routes ---
router.get('/user/profile', authenticateToken, async (req, res) => {
    try {
        const user = await query.get('SELECT id, username, email, phone, xp, level, daily_streak, weekly_streak, last_active_date, avatar FROM users WHERE id = ?', [req.user.id]);
        if (!user) return res.status(404).json({ error: "Profile not found" });
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: "Profile query failed" });
    }
});

router.put('/user/profile', authenticateToken, async (req, res) => {
    try {
        const { username, avatar } = req.body;
        if (!username || !avatar) return res.status(400).json({ error: "Missing fields" });

        await query.run('UPDATE users SET username = ?, avatar = ? WHERE id = ?', [username.trim(), avatar, req.user.id]);
        res.json({ message: "Profile successfully synchronized." });
    } catch (err) {
        res.status(500).json({ error: "Failed to update profile settings" });
    }
});

// Sync progress manually if needed
router.put('/user/xp', authenticateToken, async (req, res) => {
    try {
        const { xp, level, dailyStreak, weeklyStreak, xpEarnedToday, lastActiveDate } = req.body;
        
        await query.run(`
            UPDATE users 
            SET xp = ?, level = ?, daily_streak = ?, weekly_streak = ?, xp_earned_today = ?, last_active_date = ?
            WHERE id = ?
        `, [xp, level, dailyStreak, weeklyStreak, xpEarnedToday, lastActiveDate, req.user.id]);

        res.json({ message: "XP statistics saved." });
    } catch (err) {
        res.status(500).json({ error: "Sync failed" });
    }
});

// --- Tasks CRUD Routes ---
router.get('/tasks', authenticateToken, async (req, res) => {
    try {
        const tasks = await query.all('SELECT * FROM tasks WHERE user_id = ?', [req.user.id]);
        
        // Parse JSON string days back to array
        const parsed = tasks.map(t => ({
            ...t,
            completedToday: t.completed_today === 1,
            recurrenceDays: JSON.parse(t.recurrence_days || '[]')
        }));
        res.json(parsed);
    } catch (err) {
        res.status(500).json({ error: "Tasks retrieval error" });
    }
});

router.post('/tasks', authenticateToken, async (req, res) => {
    try {
        const { id, title, category, xp, recurrenceType, recurrenceDays, notes } = req.body;
        
        if (!id || !title || !category || !xp) {
            return res.status(400).json({ error: "Missing quest definitions" });
        }

        const daysJson = JSON.stringify(recurrenceDays || []);

        await query.run(`
            INSERT INTO tasks (id, user_id, title, category, xp, recurrence_type, recurrence_days, completed_today, streak, notes, created_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
        `, [id, req.user.id, title.trim(), category, xp, recurrenceType, daysJson, notes, new Date().toISOString()]);

        res.status(201).json({ message: "Quest launched successfully." });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to save quest" });
    }
});

// Completing tasks on backend: awards XP, adds streak, logs history and syncs user profile XP/Level
router.put('/tasks/:id', authenticateToken, async (req, res) => {
    try {
        const taskId = req.params.id;
        const { completedToday } = req.body;

        const task = await query.get('SELECT * FROM tasks WHERE id = ? AND user_id = ?', [taskId, req.user.id]);
        if (!task) return res.status(404).json({ error: "Quest not found" });

        const user = await query.get('SELECT xp, daily_streak FROM users WHERE id = ?', [req.user.id]);
        if (!user) return res.status(404).json({ error: "User not found" });

        let newStreak = task.streak;
        let xpChange = 0;

        if (completedToday) {
            newStreak += 1;
            
            // Calculate XP reward with streak bonus (+10 XP per day of completion streak)
            const baseXp = getBaseXp(task.category);
            const streakBonus = (newStreak - 1) * 10;
            xpChange = baseXp + streakBonus;

            // Log task completion in history
            const hId = 'h_' + Date.now() + '_' + Math.floor(Math.random()*10000);
            await query.run(`
                INSERT INTO history (id, user_id, title, category, xp, timestamp)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [hId, req.user.id, task.title, task.category, xpChange, new Date().toISOString()]);
        } else {
            newStreak = Math.max(0, newStreak - 1);
            
            // Undo complete: Find and delete the last completion record
            const lastLog = await query.get(`
                SELECT * FROM history 
                WHERE user_id = ? AND title = ? AND xp > 0 
                ORDER BY timestamp DESC LIMIT 1
            `, [req.user.id, task.title]);

            if (lastLog) {
                xpChange = -lastLog.xp; // Deduct the exact amount awarded
                await query.run('DELETE FROM history WHERE id = ?', [lastLog.id]);
            }
        }

        // Update task state
        const val = completedToday ? 1 : 0;
        await query.run(`
            UPDATE tasks SET completed_today = ?, streak = ? WHERE id = ? AND user_id = ?
        `, [val, newStreak, taskId, req.user.id]);

        // Update user total XP and Level
        const newXp = Math.max(0, user.xp + xpChange);
        const newLevel = getLevelFromXp(newXp);

        await query.run(`
            UPDATE users SET xp = ?, level = ? WHERE id = ?
        `, [newXp, newLevel, req.user.id]);

        res.json({ 
            message: "Quest status updated.", 
            xpAwarded: xpChange, 
            streak: newStreak, 
            newXp, 
            newLevel 
        });

    } catch (err) {
        console.error("Task status update failed:", err);
        res.status(500).json({ error: "Failed to update quest status" });
    }
});

router.delete('/tasks/:id', authenticateToken, async (req, res) => {
    try {
        const taskId = req.params.id;
        await query.run('DELETE FROM tasks WHERE id = ? AND user_id = ?', [taskId, req.user.id]);
        res.json({ message: "Quest deleted." });
    } catch (err) {
        res.status(500).json({ error: "Failed to delete quest" });
    }
});

// --- History Endpoints ---
router.get('/history', authenticateToken, async (req, res) => {
    try {
        const history = await query.all('SELECT * FROM history WHERE user_id = ? ORDER BY timestamp DESC', [req.user.id]);
        res.json(history);
    } catch (err) {
        res.status(500).json({ error: "Expedition history log query failed" });
    }
});

router.post('/history', authenticateToken, async (req, res) => {
    try {
        const { id, title, category, xp, timestamp } = req.body;
        
        await query.run(`
            INSERT INTO history (id, user_id, title, category, xp, timestamp)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [id, req.user.id, title, category, xp, timestamp]);

        res.status(201).json({ message: "Expedition log saved." });
    } catch (err) {
        res.status(500).json({ error: "Log insertion failed" });
    }
});

router.delete('/history', authenticateToken, async (req, res) => {
    try {
        await query.run('DELETE FROM history WHERE user_id = ?', [req.user.id]);
        res.json({ message: "Logs cleared." });
    } catch (err) {
        res.status(500).json({ error: "Failed to clear logs" });
    }
});

// --- Achievements Endpoints ---
router.get('/achievements', authenticateToken, async (req, res) => {
    try {
        const achs = await query.all('SELECT * FROM achievements WHERE user_id = ?', [req.user.id]);
        res.json(achs);
    } catch (err) {
        res.status(500).json({ error: "Failed to query achievements" });
    }
});

router.put('/achievements', authenticateToken, async (req, res) => {
    try {
        const { achievements } = req.body;
        
        for (const ach of achievements) {
            await query.run(`
                INSERT INTO achievements (user_id, template_id, current_progress, unlocked, unlock_date)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(user_id, template_id) DO UPDATE SET
                    current_progress = excluded.current_progress,
                    unlocked = excluded.unlocked,
                    unlock_date = excluded.unlock_date
            `, [req.user.id, ach.template_id, ach.current_progress, ach.unlocked ? 1 : 0, ach.unlock_date]);
        }

        res.json({ message: "Achievements synchronized." });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Achievements sync failed" });
    }
});

// --- Leaderboard Integration ---
router.get('/leaderboard', authenticateToken, async (req, res) => {
    try {
        const users = await query.all(`
            SELECT username, level, xp, daily_streak FROM users
            ORDER BY xp DESC LIMIT 10
        `);

        // Resolve rank titles
        const mapped = users.map(u => {
            let rank = "Beginner";
            if (u.xp >= 5000) rank = "Grand Master";
            else if (u.xp >= 3000) rank = "Legend";
            else if (u.xp >= 1500) rank = "Champion";
            else if (u.xp >= 500) rank = "Warrior";
            
            return {
                name: u.username,
                level: u.level,
                xp: u.xp,
                avatar: "ninja",
                rankTitle: rank
            };
        });

        res.json(mapped);
    } catch (err) {
        res.status(500).json({ error: "Leaderboard calculation failed" });
    }
});

module.exports = router;
