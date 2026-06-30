/* ==========================================================================
   LevelUp Life Backend Database Helper
   Encapsulates SQLite connection, tables migration, and promise wrappers
   ========================================================================== */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'levelup.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error("Database connection error:", err);
    } else {
        console.log("Connected to LevelUp SQLite Database at:", dbPath);
        runMigrations();
    }
});

// Helper functions wrapping sqlite3 callbacks in Promises for async/await support
const query = {
    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            db.run(sql, params, function (err) {
                if (err) reject(err);
                else resolve({ id: this.lastID, changes: this.changes });
            });
        });
    },

    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    },

    all(sql, params = []) {
        return new Promise((resolve, reject) => {
            db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }
};

// Database migrations setup
function runMigrations() {
    console.log("Initializing database migrations...");
    
    // Create Users table
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            phone TEXT,
            password_hash TEXT NOT NULL,
            xp INTEGER DEFAULT 0,
            level INTEGER DEFAULT 1,
            daily_streak INTEGER DEFAULT 0,
            weekly_streak INTEGER DEFAULT 0,
            last_active_date TEXT,
            xp_earned_today INTEGER DEFAULT 0,
            avatar TEXT DEFAULT 'ninja'
        )
    `, (err) => {
        if (err) console.error("Error creating users table:", err);
    });

    // Create Tasks table
    db.run(`
        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            category TEXT,
            xp INTEGER,
            recurrence_type TEXT,
            recurrence_days TEXT, -- JSON string representation
            completed_today INTEGER DEFAULT 0, -- 0 = false, 1 = true
            streak INTEGER DEFAULT 0,
            notes TEXT,
            created_date TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `, (err) => {
        if (err) console.error("Error creating tasks table:", err);
    });

    // Create History completions table
    db.run(`
        CREATE TABLE IF NOT EXISTS history (
            id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            category TEXT,
            xp INTEGER,
            timestamp TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `, (err) => {
        if (err) console.error("Error creating history table:", err);
    });

    // Create Achievements progress table
    db.run(`
        CREATE TABLE IF NOT EXISTS achievements (
            user_id INTEGER NOT NULL,
            template_id TEXT NOT NULL,
            current_progress INTEGER DEFAULT 0,
            unlocked INTEGER DEFAULT 0, -- 0 = false, 1 = true
            unlock_date TEXT,
            PRIMARY KEY (user_id, template_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `, (err) => {
        if (err) console.error("Error creating achievements table:", err);
    });
}

module.exports = {
    db,
    query
};
