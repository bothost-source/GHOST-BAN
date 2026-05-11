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

function cleanSession() {
    if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
        console.log(`[✓] Cleaned old session`);
    }
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
            
            // KEEP ALIVE ONLY - no profile changes
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
