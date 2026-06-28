# LevelUp Life Deployment Guide

This guide explains how to deploy the LevelUp Life application (Frontend & Backend) to cloud hosting providers for production use.

---

## 💻 1. Frontend Deployment (Vercel / Netlify / GitHub Pages)

The frontend is a static Single Page Application (SPA).

### Step 1: Update API endpoint
Before building or hosting, update the backend API endpoint inside the frontend code:
- Open [app.js](file:///C:/Users/MOHAN/.gemini/antigravity/scratch/levelup-life/app.js) and locate the `API_URL` variable at the top (line 5):
  ```javascript
  // Change this from localhost to your deployed backend url
  const API_URL = "https://your-backend-service.onrender.com/api";
  ```

### Step 2: Host static files
- **Vercel**: Install Vercel CLI and run `vercel` in the project root, or hook up your GitHub repository to Vercel and select the root directory.
- **Netlify**: Drag and drop the root files (excluding the `backend` folder) into the Netlify dropzone, or hook up your GitHub repository.
- **GitHub Pages**: Go to repository Settings > Pages, choose a source branch (e.g. `main`), and publish.

---

## ⚙️ 2. Backend Deployment (Render / Railway)

The backend is an Express Node.js application.

### Step 1: Push Backend to GitHub
Initialize git inside the `levelup-life` directory and push your code to a public/private GitHub repository:
```bash
git init
git add .
git commit -m "Initialize LevelUp Life fullstack app"
git remote add origin <your-repo-url>
git push -u origin main
```

### Step 2: Deploy to Render.com (Web Service)
1. Sign in to **Render.com** and click **New > Web Service**.
2. Connect your GitHub repository.
3. Configure the following values:
   - **Name**: `levelup-life-backend`
   - **Root Directory**: `backend`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. Expand **Advanced** and add the following **Environment Variables**:
   - `JWT_SECRET`: A long secure password key.
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` (For daily email sweeps).
   - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` (For SMS reminders).

---

## 🗄️ 3. Persistent Database Migration (PostgreSQL)

By default, the backend runs locally on **SQLite** and stores data inside `levelup.db`. On services like Render, the disk is ephemeral—which means every time the server spins down or restarts, your database will wipe.

To persist data in production, migrate to **PostgreSQL** (e.g. using **Supabase** or **Neon.tech**):

### Step 1: Create a Database
Create a free database instance on [Supabase](https://supabase.com) or [Neon.tech](https://neon.tech) and copy your **connection connection string (URI)**.

### Step 2: Update Database Client code
Modify [db.js](file:///C:/Users/MOHAN/.gemini/antigravity/scratch/levelup-life/backend/db.js) to connect to PostgreSQL when a `DATABASE_URL` environment variable is detected:

```javascript
// npm install pg
const { Pool } = require('pg');

let query;
if (process.env.DATABASE_URL) {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
    query = {
        async run(sql, params = []) {
            // Converts SQL placeholders from '?' to pg-compatible '$1, $2'
            let index = 1;
            const pgSql = sql.replace(/\?/g, () => `$${index++}`);
            const result = await pool.query(pgSql, params);
            return { id: result.insertId || (result.rows[0] ? result.rows[0].id : null), changes: result.rowCount };
        },
        async get(sql, params = []) {
            let index = 1;
            const pgSql = sql.replace(/\?/g, () => `$${index++}`);
            const result = await pool.query(pgSql, params);
            return result.rows[0];
        },
        async all(sql, params = []) {
            let index = 1;
            const pgSql = sql.replace(/\?/g, () => `$${index++}`);
            const result = await pool.query(pgSql, params);
            return result.rows;
        }
    };
}
```

### Step 3: Add Environment Variable
Add the `DATABASE_URL` key with your Postgres connection string in your Render or Railway settings dashboard.
