# 🎮 LevelUp Life - Gamified Full-Stack Productivity App

LevelUp Life is a gamified productivity web application built on a cyber-neon RPG aesthetic. It tracks your daily habits, rewards your streaks, and penalizes slacking.

This repository hosts the complete codebase containing the frontend client, the Node.js/Express backend server, and the SQLite persistent database layer.

---

## 🚀 Active Systems & Core Features

### 👤 1. Character Profiles & Auth
- **Player Access Portal**: A neon access gateway requiring secure registration and log-in.
- **JWT Authorization**: Keeps player sessions alive for 7 days.
- **Welcome Comms**: Registers the account and sends a beautifully styled cyberpunk HTML welcome email to the player's inbox.

### ⚔️ 2. Quest Board & Suggested Objectives
- **Active Quests**: Track daily habits (Workout, Meditation, Reading, Water, Food).
- **Accepted Quests**: Select and add pre-designed quests in one tap from the **Recommended Health Objectives** board:
  - 💧 *Morning Hydration* (+15 XP)
  - 💧 *Afternoon Hydration* (+15 XP)
  - 💧 *Post-Workout Hydration* (+15 XP)
  - 🥗 *Sugar Ban* (+25 XP)
  - 🥗 *Prep Green Fuel* (+20 XP)
  - 🥗 *Protein Booster* (+20 XP)
  - 🏋️ *Morning Cycling* (+35 XP)
  - 🏋️ *Gym Training* (+35 XP)
  - 📚 *Read 10 Pages* (+20 XP)
  - 🧘 *Mindfulness Meditation* (+20 XP)

### 📈 3. Streak Multipliers & XP Leveling
- **Streak Rewards**: Maintaining your quest streak increases the XP payout of your daily objectives by **+10 XP** per streak day!
- **Level Scaling**: Earn XP to level up your avatar rank from *Beginner* to *Warrior*, *Champion*, *Legend*, and *Grand Master*.

### ⚠️ 4. Failure Penalties
- **Daily Reset sweeps**: If a player has unfinished active daily quests at midnight, the backend automatically:
  - Deducts **-10 XP** from their total.
  - Logs a red-highlighted **`[FAILED] Missed: <Quest>`** entry in their history (shows as unfinished forever).
  - Resets the completion streak of that specific quest back to `0`.

### 📅 5. Expedition Calendar & Analytics
- **Calendar Grid**: Colored cell indicator dots displaying completion rates (Green = All completed, Orange = Partial completed, Red = None completed). Hover tooltips show exactly which tasks were finished.
- **Analytics Charts**: Dynamic line graphs representing daily XP gains, and donut charts showing quest categories shares (Workout vs. Food vs. Water).

---

## 💻 Tech Stack
- **Frontend**: HTML5, Vanilla CSS3 (Custom responsive grid layout & mobile bottom tab navigation), Javascript ES6, Lucide Icons, Web Audio API (procedural retro game sounds).
- **Backend**: Node.js, Express, Nodemailer, Twilio SMS API, JSON Web Tokens (JWT), Bcrypt, Node-cron.
- **Database**: SQLite3 client database (stored locally inside `backend/levelup.db`).

---

## 🛠️ How to run locally

### 1. Start the Backend server:
```bash
cd backend
npm install
node server.js
```
The server will run on **[http://localhost:5000](http://localhost:5000)** and serve both the API and the static web page.

### 2. View the app:
Open your browser and navigate to:
👉 **[http://localhost:5000](http://localhost:5000)**
