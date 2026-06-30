/* ==========================================================================
   LevelUp Life Main Backend Server Entry
   Express app orchestration, CORS settings, JSON parser, server execution ports
   ========================================================================== */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const routes = require('./routes');
const { initReminderScheduler } = require('./services/reminder');

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS requests from frontend origins
app.use(cors());

// Body Parsers for JSON streams
app.use(express.json());

// Bind API route paths
app.use('/api', routes);

// Serve static frontend files if hosted in a monolithic server setup
app.use(express.static(path.join(__dirname, '../')));

// Start Reminder Daemon Scheduler
initReminderScheduler();

app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`LevelUp Life Backend Server successfully initialized.`);
    console.log(`Port: ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Url: http://localhost:${PORT}`);
    console.log(`====================================================`);
});
