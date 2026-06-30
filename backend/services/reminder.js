/* ==========================================================================
   LevelUp Life Reminders Engine
   Uses Node-cron to scan incomplete quests at 9:00 PM and alerts via Email/SMS
   ========================================================================== */

const cron = require('node-cron');
const nodemailer = require('nodemailer');
const twilio = require('twilio');
const { query } = require('../db');

// Setup Nodemailer transporter with variables from environment
function createEmailTransporter() {
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.mailtrap.io',
        port: process.env.SMTP_PORT || 2525,
        auth: {
            user: process.env.SMTP_USER || '',
            pass: process.env.SMTP_PASS || ''
        }
    });
}

// Setup Twilio client wrapper
function getTwilioClient() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (accountSid && authToken) {
        return twilio(accountSid, authToken);
    }
    return null;
}

// Scan database for incomplete tasks and send notifications
async function checkAndSendReminders() {
    console.log("Reminders Engine: Initializing daily scan for unfinished quests...");
    try {
        const todayDay = new Date().getDay(); // 0-6 Sun-Sat

        // Query all incomplete tasks
        const incompleteTasks = await query.all(`
            SELECT t.id, t.title, t.user_id, u.username, u.email, u.phone, u.daily_streak
            FROM tasks t
            JOIN users u ON t.user_id = u.id
            WHERE t.completed_today = 0
        `);

        if (incompleteTasks.length === 0) {
            console.log("Reminders Engine: Zero pending quests detected across all terminals. All clear!");
            return;
        }

        // Group incomplete quests by user_id
        const userReminders = {};
        incompleteTasks.forEach(task => {
            // Confirm task is scheduled for today
            const recDays = JSON.parse(task.recurrence_days || '[]');
            const isScheduledToday = task.recurrence_type === 'daily' || recDays.includes(todayDay);

            if (isScheduledToday) {
                if (!userReminders[task.user_id]) {
                    userReminders[task.user_id] = {
                        username: task.username,
                        email: task.email,
                        phone: task.phone,
                        streak: task.daily_streak,
                        quests: []
                    };
                }
                userReminders[task.user_id].quests.push(task.title);
            }
        });

        // Initialize notification clients
        const transporter = createEmailTransporter();
        const twilioClient = getTwilioClient();
        const fromSmsNumber = process.env.TWILIO_PHONE_NUMBER || '+1234567890';

        // Dispatch alerts
        for (const [userId, record] of Object.entries(userReminders)) {
            const count = record.quests.length;
            console.log(`[ALERT TRIGGER] Player: ${record.username} (ID: ${userId}) has ${count} unfinished quests.`);

            // 1. Send Email Notification
            if (record.email && process.env.SMTP_USER) {
                const questListHtml = record.quests.map(q => `<li style="color:#00D4FF; font-family:sans-serif; margin-bottom:5px;">⚔️ <b>${q}</b></li>`).join('');
                
                const mailOptions = {
                    from: '"LevelUp Life Terminal" <reminders@leveluplife.com>',
                    to: record.email,
                    subject: `⚠️ URGENT QUEST NOTIFICATION: ${count} Pending Quests Remaining!`,
                    html: `
                        <div style="background-color:#0b1026; padding:30px; border:2px solid #00d4ff; border-radius:12px; max-width:500px; margin:0 auto; color:#ffffff;">
                            <h2 style="font-family:sans-serif; color:#ffd700; text-align:center; text-shadow: 0 0 10px #ffd700;">LEVEL UP LIFE</h2>
                            <p style="font-family:sans-serif; font-size:16px;">Greetings, <b>${record.username}</b>!</p>
                            <p style="font-family:sans-serif; font-size:14px; color:#8e99b3;">
                                The day is ending soon. You have <b>${count} unfinished quests</b> remaining!
                                Complete them before midnight to maintain your current <b>Daily Streak of ${record.streak} days</b>.
                            </p>
                            <hr style="border-color:#1f2940;">
                            <h4 style="font-family:sans-serif; color:#00d4ff; margin-bottom:10px;">PENDING OBJECTIVES:</h4>
                            <ul style="padding-left:15px; margin-top:0;">
                                ${questListHtml}
                            </ul>
                            <div style="text-align:center; margin-top:25px;">
                                <a href="http://localhost:8000" style="background-color:#7b2ff7; color:#ffffff; padding:10px 20px; text-decoration:none; font-family:sans-serif; font-weight:bold; border-radius:4px; box-shadow:0 0 10px #7b2ff7;">ENTER TERMINAL</a>
                            </div>
                        </div>
                    `
                };

                try {
                    await transporter.sendMail(mailOptions);
                    console.log(`[EMAIL SENT] Dispatched quest reminder email successfully to ${record.email}`);
                } catch (err) {
                    console.error(`[EMAIL ERROR] Failed to send email to ${record.email}:`, err.message);
                }
            } else {
                console.log(`[EMAIL MOCK] (No SMTP credentials): Send mail to ${record.email || 'N/A'}: ${count} unfinished quests: ${record.quests.join(', ')}`);
            }

            // 2. Send SMS Notification
            if (record.phone) {
                const smsBody = `LevelUp Life Alert: Player ${record.username}, you have ${count} unfinished quests today! Streak: ${record.streak} days. Complete them before midnight!`;

                if (twilioClient) {
                    try {
                        await twilioClient.messages.create({
                            body: smsBody,
                            from: fromSmsNumber,
                            to: record.phone
                        });
                        console.log(`[SMS SENT] Dispatched quest reminder SMS successfully to ${record.phone}`);
                    } catch (err) {
                        console.error(`[SMS ERROR] Failed to send SMS to ${record.phone}:`, err.message);
                    }
                } else {
                    console.log(`[SMS MOCK] (No Twilio credentials): SMS to ${record.phone}: "${smsBody}"`);
                }
            }
        }

    } catch (err) {
        console.error("Reminders Engine scan error:", err);
    }
}

// Start Scheduler (Runs daily at 9:00 PM local time)
function initReminderScheduler() {
    console.log("Reminders Engine: Initializing Cron schedule (9:00 PM daily).");
    
    // Cron trigger rule: 0 21 * * *
    cron.schedule('0 21 * * *', () => {
        checkAndSendReminders();
    });
}

// Send Welcome Email to newly registered players in Cyberpunk style
async function sendWelcomeEmail(email, username) {
    if (!email) return;

    const transporter = createEmailTransporter();
    const mailOptions = {
        from: '"LevelUp Life Terminal" <no-reply@leveluplife.com>',
        to: email,
        subject: "🎮 PLAYER AVATAR CREATED: Welcome to LevelUp Life!",
        html: `
            <div style="background-color:#0b1026; padding:30px; border:2px solid #00d4ff; border-radius:12px; max-width:500px; margin:0 auto; color:#ffffff; font-family:sans-serif; box-shadow:0 0 15px rgba(0,212,255,0.4);">
                <h1 style="color:#00d4ff; text-align:center; text-shadow:0 0 10px #00d4ff; margin-bottom:5px;">LEVEL UP LIFE</h1>
                <p style="text-align:center; color:#8e99b3; font-size:11px; letter-spacing:2px; text-transform:uppercase; margin-top:0; margin-bottom:20px;">Player Access Portal initialized</p>
                <div style="background-color:rgba(11,16,38,0.5); border:1px solid rgba(255,255,255,0.05); padding:20px; border-radius:8px; margin-bottom:20px;">
                    <p style="font-size:15px; line-height:1.6; margin-top:0;">Welcome to the grid, Player <b>${username}</b>!</p>
                    <p style="font-size:13px; color:#8e99b3; line-height:1.6;">Your Player Codex profile has been created successfully. You have been assigned your starting primary quests:</p>
                    <ul style="color:#00d4ff; font-size:13px; line-height:1.6; padding-left:15px;">
                        <li>💧 <b>Drink 8 glasses of water</b> (+15 XP base)</li>
                        <li>🥗 <b>Eat healthy balanced meals</b> (+25 XP base)</li>
                        <li>🏋️ <b>Daily Workout session</b> (+35 XP base)</li>
                        <li>🧘 <b>Meditation & mindfulness</b> (+20 XP base)</li>
                    </ul>
                    <p style="font-size:12px; color:#ff7a00; font-weight:bold; line-height:1.6; margin-bottom:0; border-top:1px solid rgba(255,255,255,0.05); padding-top:10px; margin-top:15px;">
                        ⚠️ WARNING: Failing to check off a daily quest before midnight will result in an automatic -10 XP penalty!
                    </p>
                </div>
                <div style="text-align:center;">
                    <a href="http://localhost:5000" style="background-color:#7b2ff7; color:#ffffff; padding:12px 24px; text-decoration:none; font-weight:bold; border-radius:4px; box-shadow:0 0 10px #7b2ff7; display:inline-block;">ENTER THE TERMINAL</a>
                </div>
            </div>
        `
    };

    const hasSmtpConfig = process.env.SMTP_USER && process.env.SMTP_PASS;
    if (hasSmtpConfig) {
        try {
            await transporter.sendMail(mailOptions);
            console.log(`[EMAIL SENT] Dispatched welcome email successfully to new player ${email}`);
        } catch (err) {
            console.error(`[EMAIL ERROR] Failed to send welcome email to ${email}:`, err.message);
        }
    } else {
        console.log(`[EMAIL MOCK] (No SMTP credentials): Welcome email would be sent to new player ${username} (${email})`);
    }
}

module.exports = {
    initReminderScheduler,
    checkAndSendReminders,
    sendWelcomeEmail
};
