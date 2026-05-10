const { default: makeWASocket, useMultiFileAuthState, delay, Browsers, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require("fs");

const phoneNumber = process.argv[2]?.replace(/\D/g, '');
const sessionPath = './session_worker';

if (!phoneNumber || phoneNumber.length < 10) {
    console.error("[x] Error: Provide phone number with country code");
    process.exit(1);
}

async function main() {
    if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
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

    let pairingCodeRequested = false;

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr && !pairingCodeRequested && !sock.authState.creds.registered) {
            pairingCodeRequested = true;
            console.log(`[i] Requesting pairing code for: ${phoneNumber}`);
            await delay(2000);

            try {
                const code = await sock.requestPairingCode(phoneNumber);
                console.log(`ANON_CODE_START:${code}:ANON_CODE_END`);
                fs.writeFileSync('CODE.txt', code);
            } catch (err) {
                console.error("[✗] Failed:", err.message);
                pairingCodeRequested = false;
            }
        }

        if (connection === "open") {
            console.log("[✓] SUCCESS: DEVICE LINKED!");
            while (true) {
                await delay(60000);
                try { await sock.sendPresenceUpdate('available'); } catch (e) {}
            }
        }

        if (connection === "close") {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            if (statusCode !== 401) {
                await delay(3000);
                return main();
            }
        }
    });
}

main();

