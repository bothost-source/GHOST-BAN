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
const token = process.env.TELEGRAM_BOT_TOKEN;

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

function loadTelegramUsers() {
  if (fs.existsSync(connectedUsersFilePath)) {
    const data = fs.readFileSync(connectedUsersFilePath);
    telegramConnectedUsers = JSON.parse(data);
  }
}

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
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
        rl.question(chalk.yellow(text), (answer) => { resolve(answer); rl.close(); });
    });
};

const activeWhatsAppConnections = new Map();

// =====================================================
// GHOST BAN - USER CONFIGURATION
// Edit these values to customize your bot
// =====================================================
const GHOST_BAN_CONFIG = {
  groupName: "GHOST BAN: {target}",
  groupDescription: `👻 GHOST BAN - Moderation Group
⚠️ Managed by @LORDTARRIFIC
📅 Created: {date}
🛡️ Target: {target}
👤 Creator: {creator}

This group was created for moderation purposes.`,
  profilePicturePath: path.join(__dirname, 'ghost_ban_profile.jpg'),
  autoReport: true,
  reportCooldownMs: 5000,
  reportReason: "spam",
  autoRemoveCreator: true,
  autoLeaveAfterReport: true
};

// =====================================================
// WHATSAPP GROUP MANAGEMENT FUNCTIONS
// =====================================================
async function createWhatsAppGroup(sock, groupName, participants) {
    try {
        const group = await sock.groupCreate(groupName, participants);
        console.log(chalk.green(`✅ Group created: ${groupName} | ID: ${group.id}`));
        return group;
    } catch (error) { console.error(chalk.red('❌ Group creation error:'), error.message); throw error; }
}

async function addParticipantsToGroup(sock, groupJid, participants) {
    try { await sock.groupParticipantsUpdate(groupJid, participants, "add"); console.log(chalk.green(`✅ Added ${participants.length} participant(s)`)); }
    catch (error) { console.error(chalk.red('❌ Add participants error:'), error.message); throw error; }
}

async function promoteParticipants(sock, groupJid, participants) {
    try { await sock.groupParticipantsUpdate(groupJid, participants, "promote"); console.log(chalk.green(`✅ Promoted ${participants.length} to admin`)); }
    catch (error) { console.error(chalk.red('❌ Promote error:'), error.message); throw error; }
}

async function demoteParticipants(sock, groupJid, participants) {
    try { await sock.groupParticipantsUpdate(groupJid, participants, "demote"); console.log(chalk.green(`✅ Demoted ${participants.length}`)); }
    catch (error) { console.error(chalk.red('❌ Demote error:'), error.message); throw error; }
}

async function removeParticipants(sock, groupJid, participants) {
    try { await sock.groupParticipantsUpdate(groupJid, participants, "remove"); console.log(chalk.green(`✅ Removed ${participants.length} participant(s)`)); }
    catch (error) { console.error(chalk.red('❌ Remove participants error:'), error.message); throw error; }
}

async function leaveGroup(sock, groupJid) {
    try { await sock.groupLeave(groupJid); console.log(chalk.green(`✅ Left group ${groupJid}`)); return true; }
    catch (error) { console.error(chalk.red('❌ Leave group error:'), error.message); return false; }
}

async function setGroupDescription(sock, groupJid, description) {
    try { await sock.groupUpdateDescription(groupJid, description); console.log(chalk.green(`✅ Description updated`)); }
    catch (error) { console.error(chalk.red('❌ Set description error:'), error.message); throw error; }
}

async function setGroupProfilePicture(sock, groupJid, imagePath) {
    try {
        if (!fs.existsSync(imagePath)) { console.log(chalk.yellow(`⚠️ Profile picture not found at ${imagePath}`)); return false; }
        const buffer = fs.readFileSync(imagePath);
        await sock.updateProfilePicture(groupJid, buffer);
        console.log(chalk.green(`✅ Profile picture updated`));
        return true;
    } catch (error) { console.error(chalk.red('❌ Set profile picture error:'), error.message); return false; }
}

async function getGroupMetadata(sock, groupJid) {
    try { const metadata = await sock.groupMetadata(groupJid); return metadata; }
    catch (error) { console.error(chalk.red('❌ Get metadata error:'), error.message); throw error; }
}

async function reportGroup(sock, groupJid, groupName, reason, cooldownMs) {
    console.log(chalk.cyan(`
🛡️ REPORTING GROUP`));
    console.log(chalk.cyan(`Group: ${groupName}`));
    console.log(chalk.cyan(`Reason: ${reason}`));
    console.log(chalk.cyan(`Cooldown: ${cooldownMs}ms`));
    try {
        console.log(chalk.yellow(`⏳ Waiting ${cooldownMs}ms (human-like delay)...`));
        await new Promise(resolve => setTimeout(resolve, cooldownMs));
        const metadata = await getGroupMetadata(sock, groupJid);
        const participantCount = metadata.participants?.length || 0;
        const reportMessage = `🛡️ GHOST BAN - GROUP REPORT

Group Name: ${groupName}
Group JID: ${groupJid}
Participants: ${participantCount}
Report Reason: ${reason}
Reported At: ${moment().format('YYYY-MM-DD HH:mm:ss')}
Reported By: GHOST BAN Bot (@LORDTARRIFIC)

This group was flagged for ${reason}.`.trim();
        let supportMessageSent = false;
        try { await sock.sendMessage("report@whatsapp.net", { text: reportMessage }); console.log(chalk.green(`✅ Report sent to WhatsApp Support`)); supportMessageSent = true; }
        catch (e) { console.log(chalk.yellow(`⚠️ Could not send to report@whatsapp.net`)); }
        try { await sock.chatModify({ archive: true, mute: [9999999999] }, groupJid); console.log(chalk.green(`✅ Group archived and muted`)); }
        catch (e) { console.log(chalk.yellow(`⚠️ Could not archive/mute`)); }
        try { await sock.readMessages([{ remoteJid: groupJid, fromMe: false, id: '' }]); await new Promise(resolve => setTimeout(resolve, 1000)); }
        catch (e) {}
        try { await sock.chatModify({ delete: true, lastMessages: [{ key: { remoteJid: groupJid, fromMe: false }, messageTimestamp: Date.now() }] }, groupJid); console.log(chalk.green(`✅ Chat cleared`)); }
        catch (e) { console.log(chalk.yellow(`⚠️ Could not clear chat`)); }
        console.log(chalk.green(`
✅ GROUP REPORT COMPLETED`));
        return { success: true, method: "baileys", groupName: groupName, reason: reason, cooldownMs: cooldownMs, reportedAt: moment().format('YYYY-MM-DD HH:mm:ss'), supportMessageSent: supportMessageSent, archived: true, muted: true };
    } catch (error) { console.error(chalk.red(`
❌ GROUP REPORT FAILED: ${error.message}
`)); return { success: false, method: "baileys", error: error.message }; }
}

async function executeBanWorkflow(sock, targetNumber, creatorNumber, config) {
  const targetJid = `${targetNumber}@s.whatsapp.net`;
  const creatorJid = `${creatorNumber}@s.whatsapp.net`;
  const groupName = config.groupName.replace(/{target}/g, targetNumber);
  const description = config.groupDescription.replace(/{target}/g, targetNumber).replace(/{creator}/g, creatorNumber).replace(/{date}/g, moment().format('DD/MM/YYYY HH:mm'));
  console.log(chalk.cyan(`
🛡️ GHOST BAN WORKFLOW STARTED`));
  console.log(chalk.cyan(`Target: ${targetNumber}`));
  console.log(chalk.cyan(`Creator: ${creatorNumber}`));
  console.log(chalk.cyan(`Group Name: ${groupName}`));
  console.log(chalk.cyan(`Auto-remove creator: ${config.autoRemoveCreator}`));
  console.log(chalk.cyan(`Auto-report: ${config.autoReport}
`));
  try {
    const group = await createWhatsAppGroup(sock, groupName, [targetJid]);
    const groupJid = group.id;
    await new Promise(resolve => setTimeout(resolve, 3000));
    let retries = 3;
    let metadata;
    while (retries > 0) {
      try { metadata = await getGroupMetadata(sock, groupJid); if (metadata.participants && metadata.participants.length >= 2) break; }
      catch (e) { console.log(chalk.yellow(`⏳ Retry ${4 - retries}/3: Waiting for group to initialize...`)); }
      await new Promise(resolve => setTimeout(resolve, 2000));
      retries--;
    }
    const targetInGroup = metadata?.participants?.some(p => p.id === targetJid || p.id?.split('@')[0] === targetNumber);
    if (!targetInGroup) {
      console.log(chalk.yellow(`⚠️ Target not in group, attempting to add...`));
      try { await addParticipantsToGroup(sock, groupJid, [targetJid]); await new Promise(resolve => setTimeout(resolve, 2000)); metadata = await getGroupMetadata(sock, groupJid); }
      catch (addError) { console.log(chalk.red(`❌ Could not add target: ${addError.message}`)); }
    }
    const targetStillInGroup = metadata?.participants?.some(p => p.id === targetJid || p.id?.split('@')[0] === targetNumber);
    if (targetStillInGroup) { await promoteParticipants(sock, groupJid, [targetJid]); await new Promise(resolve => setTimeout(resolve, 1500)); }
    await demoteParticipants(sock, groupJid, [creatorJid]); await new Promise(resolve => setTimeout(resolve, 1500));
    await setGroupDescription(sock, groupJid, description);
    const picResult = await setGroupProfilePicture(sock, groupJid, config.profilePicturePath);
    const finalMetadata = await getGroupMetadata(sock, groupJid);
    let creatorRemoved = false;
    if (config.autoRemoveCreator) {
      try { await removeParticipants(sock, groupJid, [creatorJid]); console.log(chalk.green(`✅ Creator removed from group`)); creatorRemoved = true; }
      catch (removeError) { console.log(chalk.yellow(`⚠️ Could not auto-remove creator: ${removeError.message}`)); }
    }
    let reportResult = null;
    if (config.autoReport) { reportResult = await reportGroup(sock, groupJid, groupName, config.reportReason, config.reportCooldownMs); }
    let leftGroup = false;
    if (config.autoLeaveAfterReport && config.autoReport) { try { leftGroup = await leaveGroup(sock, groupJid); } catch (leaveError) { console.log(chalk.yellow(`⚠️ Could not leave group: ${leaveError.message}`)); } }
    console.log(chalk.green(`
✅ GHOST BAN WORKFLOW COMPLETED!`));
    console.log(chalk.green(`Group: ${groupName}`));
    console.log(chalk.green(`JID: ${groupJid}
`));
    return { success: true, groupJid: groupJid, groupName: groupName, targetAdded: targetStillInGroup, targetPromoted: targetStillInGroup, creatorDemoted: true, creatorRemoved: creatorRemoved, descriptionSet: true, pictureSet: picResult, participants: finalMetadata?.participants?.length || 0, inviteCode: finalMetadata?.inviteCode || null, reportResult: reportResult, leftGroup: leftGroup };
  } catch (error) { console.error(chalk.red(`
❌ GHOST BAN WORKFLOW FAILED: ${error.message}
`)); throw error; }
}

// =====================================================
// WHATSAPP BOT STARTUP
// =====================================================
async function startWhatsAppBot(phoneNumber, telegramChatId = null) {
  const sessionPath = path.join(__dirname, `./${config().session}/session_${phoneNumber}`);
  const browserOptions = [Browsers.macOS('Safari'), Browsers.macOS('Chrome'), Browsers.windows('Firefox'), Browsers.ubuntu('Chrome'), Browsers.baileys('Baileys'), Browsers.macOS('Edge'), Browsers.windows('Edge')];
  const randomBrowser = browserOptions[Math.floor(Math.random() * browserOptions.length)];
  const store = {
    messages: new Map(), contacts: new Map(), groupMetadata: new Map(),
    loadMessage: async (jid, id) => store.messages.get(`${jid}:${id}`) || null,
    bind: (ev) => {
      ev.on('messages.upsert', ({ messages }) => { for (const msg of messages) { if (msg.key?.remoteJid && msg.key?.id) { store.messages.set(`${msg.key.remoteJid}:${msg.key.id}`, msg); } } });
      ev.on('lid-mapping.update', ({ mappings }) => { console.log(chalk.cyan('📋 LID Mapping Update:'), mappings); });
    }
  };
  if (!fs.existsSync(sessionPath)) { fs.mkdirSync(sessionPath, { recursive: true }); }
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version, isLatest } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({ logger: pino({ level: "silent" }), printQRInTerminal: false, auth: state, version: version, browser: randomBrowser });
  activeWhatsAppConnections.set(phoneNumber, sock);
  if (telegramChatId && !sock.authState.creds.registered) {
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(phoneNumber);
        const formattedCode = code?.match(/.{1,4}/g)?.join("-") || code;
        telegramPairingCodes.set(formattedCode, { count: 0, phoneNumber });
        if (telegramBot) {
          const message = `╔═══════════════════╗
║   👻 GHOST BAN    ║
║   📱 PAIRING CODE ║
╚═══════════════════╝

📱 *Number:* \`${phoneNumber}\`
🔐 *Code:* \`${formattedCode}\`

━━━━━━━━━━━━━━━━━━━
*Instructions:*
1. Open WhatsApp on your phone
2. Go to Settings → Linked Devices
3. Tap "Link a Device"
4. Enter the code above

⏰ *Code expires in 2 minutes*
━━━━━━━━━━━━━━━━━━━
👻 *Powered by @LORDTARRIFIC*`;
          telegramBot.sendMessage(telegramChatId, message, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "📋 Copy Code", callback_data: `copy_${formattedCode}` }], [{ text: "❌ Cancel Pairing", callback_data: `cancel_pair_${phoneNumber}` }]] } });
        }
        console.log(chalk.green(`Pairing code generated for ${phoneNumber}: ${formattedCode}`));
      } catch (error) {
        console.error('Error generating pairing code:', error);
        if (telegramBot) { telegramBot.sendMessage(telegramChatId, `❌ Failed to generate pairing code for ${phoneNumber}: ${error.message}`); }
      }
    }, 3000);
  }
  store.bind(sock.ev);
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (connection === 'connecting') { console.log(chalk.yellow(`🔄 ${phoneNumber}: Connecting to WhatsApp...`)); }
    if (connection === 'open') {
      console.log(chalk.green(`✅ ${phoneNumber}: Connected to WhatsApp successfully!`));
      if (telegramChatId) {
        if (!telegramConnectedUsers[telegramChatId]) { telegramConnectedUsers[telegramChatId] = []; }
        const existingIndex = telegramConnectedUsers[telegramChatId].findIndex(user => user.phoneNumber === phoneNumber);
        if (existingIndex === -1) { telegramConnectedUsers[telegramChatId].push({ phoneNumber, connectedAt: new Date().toISOString() }); saveTelegramUsers(); }
        if (telegramBot) {
          const caption = `╔═══════════════════╗
║  👻 GHOST BAN     ║
║  ✅ CONNECTED     ║
╚═══════════════════╝

📱 *Phone Number:* \`${phoneNumber}\`
⏰ *Time:* ${moment().format('HH:mm:ss')}
📅 *Date:* ${moment().format('DD/MM/YYYY')}

━━━━━━━━━━━━━━━━━━━
🎉 *Your WhatsApp is now connected!*

💡 *Commands:*
• /ban <number> - Create & report group
• /listpaired - View connections
• /delpair <number> - Disconnect

━━━━━━━━━━━━━━━━━━━
👻 *Created by @LORDTARRIFIC*`;
          const opts = { caption: caption, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🛡️ Ban User", callback_data: "ban_menu" }], [{ text: "📱 My Connections", callback_data: "list_my_connections" }], [{ text: "❌ Disconnect", callback_data: `disconnect_${phoneNumber}` }], [{ text: "🏠 Main Menu", callback_data: "main_menu" }], [{ text: '🔵 JOIN GROUP', url: 'https://t.me/lonerisback' }]] } };
          telegramBot.sendPhoto(telegramChatId, 'https://github.com/bothost-source/image/raw/refs/heads/main/image.jpg', opts);
        }
      }
      const botNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net';
      sock.sendMessage(botNumber, { text: `👻 *GHOST BAN* is Online!

> 📌 User: ${sock.user.name || 'Unknown'}
> ⚡ Prefix: [ . ]
> 🚀 Mode: ${sock.public ? 'Public' : 'Self'}
> 🤖 Version: 1.0.0
> 📱 Number: ${phoneNumber}

✅ Bot connected successfully
👻 Created by @LORDTARRIFIC`, contextInfo: { forwardingScore: 1, isForwarded: true, externalAdReply: { title: "GHOST BAN", body: "WhatsApp Group Management Bot", thumbnailUrl: config().thumbUrl, sourceUrl: "https://t.me/lonerisback", mediaType: 1, renderLargerThumbnail: false } } }).catch(console.error);
    }
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(chalk.red(`❌ ${phoneNumber}: Connection closed:`), lastDisconnect?.error);
      activeWhatsAppConnections.delete(phoneNumber);
      if (shouldReconnect) { console.log(chalk.yellow(`🔄 ${phoneNumber}: Attempting to reconnect...`)); setTimeout(() => startWhatsAppBot(phoneNumber, telegramChatId), 5000); }
      else { console.log(chalk.red(`🚫 ${phoneNumber}: Logged out.`)); if (telegramChatId && telegramConnectedUsers[telegramChatId]) { telegramConnectedUsers[telegramChatId] = telegramConnectedUsers[telegramChatId].filter(user => user.phoneNumber !== phoneNumber); saveTelegramUsers(); } }
    }
  });
  sock.ev.on('messages.upsert', async chatUpdate => {
    try {
      const mek = chatUpdate.messages[0];
      if (!mek.message) return;
      mek.message = Object.keys(mek.message)[0] === 'ephemeralMessage' ? mek.message.ephemeralMessage.message : mek.message;
      if (config().status.reactsw && mek.key && mek.key.remoteJid === 'status@broadcast') {
        let emoji = ['😘', '😭', '😂', '😹', '😍', '😋', '🙏', '😜', '😢', '😠', '🤫', '😎'];
        let sigma = emoji[Math.floor(Math.random() * emoji.length)];
        await sock.readMessages([mek.key]);
        await sock.sendMessage('status@broadcast', { react: { text: sigma, key: mek.key } }, { statusJidList: [mek.key.participant] });
      }
      if (!sock.public && !mek.key.fromMe && chatUpdate.type === 'notify') return;
      if (mek.key.id.startsWith('BASE-') && mek.key.id.length === 12) return;
      const m = await smsg(sock, mek, store);
      require("./message")(sock, m, chatUpdate, store);
    } catch (err) { console.log(err); }
  });
  sock.decodeJid = (jid) => { if (!jid) return jid; if (/:\d+@/gi.test(jid)) { let decode = jidDecode(jid) || {}; return decode.user && decode.server && decode.user + '@' + decode.server || jid; } else return jid; };
  sock.public = config().status.public;
  sock.sendText = async (jid, text, quoted = '', options) => { return sock.sendMessage(jid, { text: text, ...options }, { quoted }); };
  sock.downloadMediaMessage = async (message) => { let mime = (message.msg || message).mimetype || ''; let messageType = message.mtype ? message.mtype.replace(/Message/gi, '') : mime.split('/')[0]; const stream = await downloadContentFromMessage(message, messageType); let buffer = Buffer.from([]); for await(const chunk of stream) { buffer = Buffer.concat([buffer, chunk]); } return buffer; };
  return sock;
}

async function loadAllSessions() {
  const sessionsDir = path.join(__dirname, `./${config().session}`);
  if (!fs.existsSync(sessionsDir)) { fs.mkdirSync(sessionsDir, { recursive: true }); }
  const sessionFiles = fs.readdirSync(sessionsDir);
  for (const file of sessionFiles) { if (file.startsWith('session_')) { const phoneNumber = file.replace('session_', ''); console.log(chalk.cyan(`🔄 Loading existing session: ${phoneNumber}`)); await startWhatsAppBot(phoneNumber); } }
}

// =====================================================
// TELEGRAM BOT HANDLERS
// =====================================================
function initializeTelegramBot() {
  if (!telegramBot) return;
  loadTelegramUsers();
  telegramBot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const messageId = query.message.message_id;
    if (data === 'check_join') {
      const userId = query.from.id;
      const channelUsernames = ['@lonerterritorybackagain', '@lonerisback'];
      let joinedAllChannels = true;
      for (const channel of channelUsernames) {
        try { const member = await telegramBot.getChatMember(channel, userId); if (['left', 'kicked'].includes(member.status)) { joinedAllChannels = false; break; } }
        catch (e) { joinedAllChannels = false; break; }
      }
      if (!joinedAllChannels) { telegramBot.answerCallbackQuery(query.id, { text: '❌ You have not joined all required channels yet!', show_alert: true }); }
      else { telegramBot.answerCallbackQuery(query.id, { text: '✅ All channels joined! You can now use /pair', show_alert: true }); telegramBot.editMessageText('✅ Verification complete! Send /pair <number> to connect your WhatsApp.', { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' }); }
      return;
    }
    if (data === 'main_menu') {
      const menuText = `╔═══════════════════╗
║   👻 GHOST BAN    ║
╚═══════════════════╝

*GHOST BAN - Group Management*
━━━━━━━━━━━━━━━━━━━

☆ Connect your WhatsApp
☆ Ban users with groups
☆ Auto-report groups
☆ Manage connections

━━━━━━━━━━━━━━━━━━━
💡 Select an option below:`;
      const opts = { message_id: messageId, chat_id: chatId, caption: menuText, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "📱 Pair WhatsApp", callback_data: "pair_info" }], [{ text: "🛡️ Ban Menu", callback_data: "ban_menu" }], [{ text: "📋 My Connections", callback_data: "list_my_connections" }], [{ text: "ℹ️ Bot Info", callback_data: "bot_info" }], [{ text: '🔴 JOIN CHANNEL', url: 'https://t.me/lonerterritorybackagain' }]] } };
      telegramBot.editMessageCaption(menuText, opts);
    } else if (data === 'ban_menu') {
      const userConnections = telegramConnectedUsers[chatId] || [];
      if (userConnections.length === 0) { telegramBot.answerCallbackQuery(query.id, { text: "❌ You need to pair WhatsApp first! Use /pair", show_alert: true }); return; }
      const banText = `╔═══════════════════╗
║   🛡️ BAN MENU     ║
╚═══════════════════╝

*GHOST BAN - How it works:*

1️⃣ Send: /ban <number>
2️⃣ Bot creates a group
3️⃣ Adds target to group
4️⃣ Promotes target to admin
5️⃣ Demotes you (creator)
6️⃣ Sets description & pic
7️⃣ Removes you from group
8️⃣ Reports group (5s cooldown)
9️⃣ Leaves group

━━━━━━━━━━━━━━━━━━━
*Example:*
/ban 2348012345678

👻 *Created by @LORDTARRIFIC*`;
      telegramBot.editMessageCaption(banText, { message_id: messageId, chat_id: chatId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🔙 Back to Menu", callback_data: "main_menu" }]] } });
    } else if (data === 'pair_info') {
      const pairText = `╔═══════════════════╗
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
👻 *Created by @LORDTARRIFIC*`;
      telegramBot.editMessageCaption(pairText, { message_id: messageId, chat_id: chatId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🔙 Back to Menu", callback_data: "main_menu" }]] } });
    } else if (data === 'list_my_connections') {
      const userConnections = telegramConnectedUsers[chatId] || [];
      if (userConnections.length === 0) { telegramBot.answerCallbackQuery(query.id, { text: "❌ You don't have any active connections", show_alert: true }); return; }
      let connectionList = `╔═══════════════════╗
║  📱 MY CONNECTIONS  ║
╚═══════════════════╝

`;
      userConnections.forEach((conn, index) => { const status = activeWhatsAppConnections.has(conn.phoneNumber) ? '✅ Online' : '❌ Offline'; connectionList += `${index + 1}. 📞 \`${conn.phoneNumber}\` - ${status}
`; });
      connectionList += `
━━━━━━━━━━━━━━━━━━━
📊 Total: ${userConnections.length} connection(s)`;
      const buttons = userConnections.map(conn => [{ text: `❌ Disconnect ${conn.phoneNumber}`, callback_data: `disconnect_${conn.phoneNumber}` }]);
      buttons.push([{ text: "🔙 Back to Menu", callback_data: "main_menu" }]);
      telegramBot.editMessageCaption(connectionList, { message_id: messageId, chat_id: chatId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } });
    } else if (data === 'bot_info') {
      const uptime = process.uptime();
      const days = Math.floor(uptime / (60 * 60 * 24));
      const hours = Math.floor((uptime % (60 * 60 * 24)) / (60 * 60));
      const minutes = Math.floor((uptime % (60 * 60)) / 60);
      const infoText = `╔═══════════════════╗
║   👻 GHOST BAN     ║
║   ℹ️ BOT INFO      ║
╚═══════════════════╝

⏱ *Uptime:* ${days}d ${hours}h ${minutes}m
👥 *Users:* ${Object.keys(telegramConnectedUsers).length}
🔗 *Active WhatsApp Connections:* ${activeWhatsAppConnections.size}
📡 *Status:* Online ✅

━━━━━━━━━━━━━━━━━━━
🛠 *Developer:* @LORDTARRIFIC
📦 *Version:* 1.0.0
━━━━━━━━━━━━━━━━━━━`;
      telegramBot.editMessageCaption(infoText, { message_id: messageId, chat_id: chatId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "Back to Menu", callback_data: "main_menu" }]] } });
    } else if (data.startsWith('disconnect_')) {
      const phoneNumber = data.replace('disconnect_', '');
      const sessionPath = path.join(__dirname, `./${config().session}/session_${phoneNumber}`);
      try {
        const sock = activeWhatsAppConnections.get(phoneNumber);
        if (sock) { await sock.logout(); activeWhatsAppConnections.delete(phoneNumber); }
        if (fs.existsSync(sessionPath)) { fs.rmSync(sessionPath, { recursive: true, force: true }); }
        if (telegramConnectedUsers[chatId]) { telegramConnectedUsers[chatId] = telegramConnectedUsers[chatId].filter(user => user.phoneNumber !== phoneNumber); saveTelegramUsers(); }
        telegramBot.answerCallbackQuery(query.id, { text: `✅ Disconnected ${phoneNumber} successfully!`, show_alert: true });
        telegramBot.editMessageText(`✅ Disconnected ${phoneNumber}`, { chat_id: chatId, message_id: messageId });
      } catch (error) { console.error('Error disconnecting:', error); telegramBot.answerCallbackQuery(query.id, { text: `❌ Error disconnecting ${phoneNumber}`, show_alert: true }); }
    } else if (data.startsWith('copy_')) {
      const code = data.replace('copy_', '');
      telegramBot.answerCallbackQuery(query.id, { text: `✅ Code ${code} copied to clipboard`, show_alert: true });
    } else if (data.startsWith('cancel_pair_')) {
      const phoneNumber = data.replace('cancel_pair_', '');
      const sessionPath = path.join(__dirname, `./${config().session}/session_${phoneNumber}`);
      if (fs.existsSync(sessionPath)) { fs.rmSync(sessionPath, { recursive: true, force: true }); }
      telegramBot.answerCallbackQuery(query.id, { text: `❌ Pairing cancelled for ${phoneNumber}`, show_alert: true });
      telegramBot.editMessageText(`❌ Pairing cancelled for ${phoneNumber}`, { chat_id: chatId, message_id: messageId });
    }
  });

  telegramBot.onText(/\/(\w+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const command = match[1];
    switch (command) {
      case "menu":
      case "start": {
        const opts = { reply_markup: { inline_keyboard: [[{ text: "📱 Pair WhatsApp", callback_data: "pair_info" }], [{ text: "🛡️ Ban Menu", callback_data: "ban_menu" }], [{ text: "📋 My Connections", callback_data: "list_my_connections" }], [{ text: "ℹ️ Bot Info", callback_data: "bot_info" }], [{ text: '🔵 JOIN GROUP', url: 'https://t.me/lonerisback' }]] } };
        const welcomeText = `╔═══════════════════╗
║    👻 GHOST BAN   ║
╚═══════════════════╝

*WELCOME TO GHOST BAN*
━━━━━━━━━━━━━━━━━━━

✨ *Available Commands:*

📱 /pair - Connect WhatsApp
🗑 /delpair - Disconnect session
📋 /listpaired - View connections
🛡️ /ban <number> - Create & report group
⏱ /uptime - Check bot uptime
🆔 /getmyid - Get your ID
📊 /botinfo - Bot statistics
🏓 /ping - Check bot speed

━━━━━━━━━━━━━━━━━━━
👻 *Created by @LORDTARRIFIC*`;
        telegramBot.sendPhoto(chatId, 'https://github.com/bothost-source/image/raw/refs/heads/main/image.jpg', { caption: welcomeText, parse_mode: "Markdown", ...opts });
        break;
      }
      case "uptime": {
        const uptime = process.uptime();
        const days = Math.floor(uptime / (60 * 60 * 24));
        const hours = Math.floor((uptime % (60 * 60 * 24)) / (60 * 60));
        const minutes = Math.floor((uptime % (60 * 60)) / 60);
        const seconds = Math.floor(uptime % 60);
        const uptimeMessage = `╔═══════════════════╗
║  👻 GHOST BAN     ║
║  ⏱ BOT UPTIME    ║
╚═══════════════════╝

📆 *Days:* ${days}
🕐 *Hours:* ${hours}
⏰ *Minutes:* ${minutes}
⏱ *Seconds:* ${seconds}

━━━━━━━━━━━━━━━━━━━
✅ *Status:* Running Smoothly
👻 *Created by @LORDTARRIFIC*`;
        telegramBot.sendMessage(chatId, uptimeMessage, { parse_mode: 'Markdown' });
        break;
      }
      case "getmyid": {
        const userId = msg.from.id;
        const username = msg.from.username ? `@${msg.from.username}` : 'No username';
        const idMessage = `╔═══════════════════╗
║  👻 GHOST BAN     ║
║  👤 YOUR INFO     ║
╚═══════════════════╝

🆔 *ID:* \`${userId}\`
📝 *Username:* ${username}
👤 *Name:* ${msg.from.first_name || 'N/A'}

━━━━━━━━━━━━━━━━━━━
👻 *Created by @LORDTARRIFIC*`;
        telegramBot.sendMessage(chatId, idMessage, { parse_mode: 'Markdown' });
        break;
      }
      case "ping": {
        const start = Date.now();
        const sent = await telegramBot.sendMessage(chatId, '🏓 *Pinging...*', { parse_mode: 'Markdown' });
        const end = Date.now();
        const responseTime = (end - start);
        telegramBot.editMessageText(`🏓 *Pong!*

⚡ *Speed:* ${responseTime}ms
👻 *GHOST BAN*`, { chat_id: chatId, message_id: sent.message_id, parse_mode: 'Markdown' });
        break;
      }
      case "ban": {
        const targetNumber = msg.text.split(' ')[1];
        if (!targetNumber) {
          telegramBot.sendMessage(chatId, `╔═══════════════════╗
║  👻 GHOST BAN     ║
║  ❌ INVALID FORMAT ║
╚═══════════════════╝

*Please provide a phone number:*

✅ *Correct:* \`/ban 2348012345678\`
❌ *Wrong:* \`/ban +2348012345678\`
❌ *Wrong:* \`/ban 07012345678\`

━━━━━━━━━━━━━━━━━━━
⚠️ *No + or 0 prefix needed!*
👻 *Created by @LORDTARRIFIC*`, { parse_mode: 'Markdown' });
          break;
        }
        if (!/^\d+$/.test(targetNumber)) {
          telegramBot.sendMessage(chatId, `╔═══════════════════╗
║  👻 GHOST BAN     ║
║  ❌ INVALID NUMBER ║
╚═══════════════════╝

❌ *Error:* Phone number must contain only digits

*Example:*
✅ Correct: \`2348012345678\`
❌ Wrong: \`+2348012345678\`
❌ Wrong: \`07012345678\`

━━━━━━━━━━━━━━━━━━━
👻 *Created by @LORDTARRIFIC*`, { parse_mode: 'Markdown' });
          break;
        }
        const userConnections = telegramConnectedUsers[chatId] || [];
        if (userConnections.length === 0) {
          telegramBot.sendMessage(chatId, `╔═══════════════════╗
║  👻 GHOST BAN     ║
║  ❌ NO CONNECTIONS ║
╚═══════════════════╝

❌ *You have no paired WhatsApp devices.*

*Use /pair to connect first.*

━━━━━━━━━━━━━━━━━━━
👻 *Created by @LORDTARRIFIC*`, { parse_mode: 'Markdown' });
          break;
        }
        const activeDevice = userConnections.find(conn => activeWhatsAppConnections.has(conn.phoneNumber));
        if (!activeDevice) {
          telegramBot.sendMessage(chatId, `╔═══════════════════╗
║  👻 GHOST BAN     ║
║  ❌ OFFLINE        ║
╚═══════════════════╝

❌ *All your paired devices are offline.*

*Try reconnecting with /pair*

━━━━━━━━━━━━━━━━━━━
👻 *Created by @LORDTARRIFIC*`, { parse_mode: 'Markdown' });
          break;
        }
        const processingMsg = await telegramBot.sendMessage(chatId, `╔═══════════════════╗
║  👻 GHOST BAN     ║
║  ⏳ EXECUTING...   ║
╚═══════════════════╝

🎯 *Target:* \`${targetNumber}\`
📱 *Device:* \`${activeDevice.phoneNumber}\`

*Executing workflow...*
1️⃣ Creating group...
2️⃣ Adding target...
3️⃣ Promoting target...
4️⃣ Demoting creator...
5️⃣ Setting description...
6️⃣ Setting profile picture...
7️⃣ Removing creator...
8️⃣ Reporting group (5s cooldown)...
9️⃣ Leaving group...

━━━━━━━━━━━━━━━━━━━
👻 *Created by @LORDTARRIFIC*`, { parse_mode: 'Markdown' });
        try {
          const sock = activeWhatsAppConnections.get(activeDevice.phoneNumber);
          if (!sock) { throw new Error('WhatsApp connection lost. Please reconnect.'); }
          const result = await executeBanWorkflow(sock, targetNumber, activeDevice.phoneNumber, GHOST_BAN_CONFIG);
          let resultText = `╔═══════════════════╗
║  👻 GHOST BAN     ║
║  ✅ COMPLETED     ║
╚═══════════════════╝

📱 *Group:* \`${result.groupName}\`
🆔 *Group ID:* \`${result.groupJid}\`
👤 *Target:* \`${targetNumber}\`
`;
          if (result.targetAdded) { resultText += `✅ *Target Added:* Yes
`; resultText += `👑 *Target Promoted:* Yes
`; }
          else { resultText += `⚠️ *Target Added:* No (may have blocked group invites)
`; }
          resultText += `👤 *Creator Demoted:* Yes
`;
          resultText += `📝 *Description Set:* Yes
`;
          resultText += `🖼️ *Profile Pic:* ${result.pictureSet ? 'Yes' : 'No (place ghost_ban_profile.jpg in bot folder)'}
`;
          if (result.creatorRemoved) { resultText += `🚪 *Creator Removed:* Yes
`; } else { resultText += `🚪 *Creator Removed:* No
`; }
          if (result.reportResult && result.reportResult.success) { resultText += `🛡️ *Group Reported:* Yes (${result.reportResult.method})
`; resultText += `⏱️ *Report Cooldown:* ${result.reportResult.cooldownMs}ms
`; }
          else if (result.reportResult) { resultText += `⚠️ *Group Reported:* Failed (${result.reportResult.error})
`; }
          if (result.leftGroup) { resultText += `🏃 *Left Group:* Yes
`; }
          resultText += `👥 *Participants:* ${result.participants}
`;
          if (result.inviteCode) { resultText += `🔗 *Invite:* https://chat.whatsapp.com/${result.inviteCode}
`; }
          resultText += `
━━━━━━━━━━━━━━━━━━━
👻 *Created by @LORDTARRIFIC*`;
          telegramBot.editMessageText(resultText, { chat_id: chatId, message_id: processingMsg.message_id, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🏠 Main Menu", callback_data: "main_menu" }], [{ text: "🛡️ Ban Another", callback_data: "ban_menu" }]] } });
        } catch (error) {
          console.error('Ban workflow error:', error);
          let errorMsg = error.message;
          if (error.message?.includes('403')) { errorMsg = 'Target blocked group invites or number is invalid.'; }
          else if (error.message?.includes('408')) { errorMsg = 'Request timed out. Please try again.'; }
          else if (error.message?.includes('not-authorized')) { errorMsg = 'Bot needs to be admin (should not happen for new groups).'; }
          telegramBot.editMessageText(`╔═══════════════════╗
║  👻 GHOST BAN     ║
║  ❌ FAILED        ║
╚═══════════════════╝

❌ *Error:* ${errorMsg}

📱 *Target:* \`${targetNumber}\`

━━━━━━━━━━━━━━━━━━━
💡 *Common Issues:*
• Target blocked group invites
• Invalid phone number
• WhatsApp connection lost

👻 *Created by @LORDTARRIFIC*`, { chat_id: chatId, message_id: processingMsg.message_id, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🏠 Main Menu", callback_data: "main_menu" }]] } });
        }
        break;
      }
      case "pair": {
        const userId = msg.from.id;
        const channelUsernames = ['@lonerterritorybackagain', '@lonerisback'];
        let joinedAllChannels = true;
        for (const channel of channelUsernames) {
          try { const member = await telegramBot.getChatMember(channel, userId); if (['left', 'kicked'].includes(member.status)) { joinedAllChannels = false; break; } }
          catch (e) { joinedAllChannels = false; break; }
        }
        if (!joinedAllChannels) {
          telegramBot.sendMessage(chatId, `ᴊᴏɪɴ ᴄʜᴀɴɴᴇʟ ᴛᴏ ᴄᴏᴍᴍᴇɴᴄᴇ ʙᴏᴛ ᴘᴀɪʀɪɴɢ ᴘʀᴏᴄᴇss.`, { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '🔴 JOIN CHANNEL', url: 'https://t.me/lonerterritorybackagain' }], [{ text: '🔵 JOIN GROUP', url: 'https://t.me/lonerisback' }], [{ text: '✅ CONFIRM', callback_data: 'check_join' }]] } });
          break;
        }
        const phoneNumber = msg.text.split(' ')[1];
        if (!phoneNumber) {
          telegramBot.sendMessage(chatId, `╔═══════════════════╗
║  👻 GHOST BAN     ║
║  ❌ INVALID FORMAT ║
╚═══════════════════╝

*Please provide a phone number:*

✅ *Correct:* \`/pair 234712345678\`
❌ *Wrong:* \`/pair +254712345678\`
❌ *Wrong:* \`/pair 0712345678\`

━━━━━━━━━━━━━━━━━━━
⚠️ *No + or 0 prefix needed!*
👻 *Created by @LORDTARRIFIC*`, { parse_mode: 'Markdown' });
          break;
        }
        if (phoneNumber.startsWith('+') || phoneNumber.startsWith('0')) {
          telegramBot.sendMessage(chatId, `╔═══════════════════╗
║  👻 GHOST BAN     ║
║  ❌ INVALID PREFIX ║
╚═══════════════════╝

❌ *Error:* Number cannot start with + or 0

*Example:*
✅ Correct: \`234XXXXXXXX\`
❌ Wrong: \`+234XXXXXXXX\`
❌ Wrong: \`070XXXXXXXXX\`

━━━━━━━━━━━━━━━━━━━
👻 *Created by @LORDTARRIFIC*`, { parse_mode: 'Markdown' });
          break;
        }
        const isAlreadyConnected = telegramConnectedUsers[chatId]?.some(user => user.phoneNumber === phoneNumber);
        if (isAlreadyConnected && activeWhatsAppConnections.has(phoneNumber)) {
          telegramBot.sendMessage(chatId, `╔═══════════════════╗
║  👻 GHOST BAN     ║
║  ⚠️ ALREADY PAIRED ║
╚═══════════════════╝

📱 *Number:* \`${phoneNumber}\`
✅ *Status:* Already connected and online

━━━━━━━━━━━━━━━━━━━
*Use /delpair to remove first*
👻 *Created by @LORDTARRIFIC*`, { parse_mode: 'Markdown' });
          break;
        }
        telegramBot.sendMessage(chatId, `╔═══════════════════╗
║  👻 GHOST BAN     ║
║  🔄 GENERATING...  ║
╚═══════════════════╝

📱 *Number:* \`${phoneNumber}\`
⏳ *Status:* Generating pairing code...

━━━━━━━━━━━━━━━━━━━
*Please wait...*
👻 *Created by @LORDTARRIFIC*`, { parse_mode: 'Markdown' });
        await loadBaileys();
        await startWhatsAppBot(phoneNumber, chatId);
        break;
      }
      case "delpair": {
        const phoneNumber = msg.text.split(' ')[1];
        if (!phoneNumber) {
          telegramBot.sendMessage(chatId, `╔═══════════════════╗
║  👻 GHOST BAN     ║
║  ❌ INVALID FORMAT ║
╚═══════════════════╝

*Please provide a phone number:*

✅ *Example:* \`/delpair 234XXXXXXXX\`

━━━━━━━━━━━━━━━━━━━
👻 *Created by @LORDTARRIFIC*`, { parse_mode: 'Markdown' });
          break;
        }
        if (telegramConnectedUsers[chatId]) {
          telegramConnectedUsers[chatId] = telegramConnectedUsers[chatId].filter(user => user.phoneNumber !== phoneNumber);
          saveTelegramUsers();
          const sock = activeWhatsAppConnections.get(phoneNumber);
          if (sock) { try { await sock.logout(); } catch (error) { console.error('Error logging out:', error); } activeWhatsAppConnections.delete(phoneNumber); }
          telegramBot.sendMessage(chatId, `╔═══════════════════╗
║  👻 GHOST BAN     ║
║  ✅ DISCONNECTED   ║
╚═══════════════════╝

📱 *Number:* \`${phoneNumber}\`
✅ *Status:* Successfully removed

━━━━━━━━━━━━━━━━━━━
*You can now pair again!*
👻 *Created by @LORDTARRIFIC*`, { parse_mode: 'Markdown' });
        } else {
          telegramBot.sendMessage(chatId, `╔═══════════════════╗
║  👻 GHOST BAN     ║
║  ❌ NOT FOUND      ║
╚═══════════════════╝

📱 *Number:* \`${phoneNumber}\`
❌ *Status:* No connection found

━━━━━━━━━━━━━━━━━━━
👻 *Created by @LORDTARRIFIC*`, { parse_mode: 'Markdown' });
        }
        break;
      }
      case "listpaired": {
        const userConnections = telegramConnectedUsers[chatId] || [];
        if (userConnections.length === 0) {
          telegramBot.sendMessage(chatId, `╔═══════════════════╗
║  👻 GHOST BAN     ║
║  📱 NO CONNECTIONS ║
╚═══════════════════╝

❌ *You don't have any active connections*

━━━━━━━━━━━━━━━━━━━
*Use /pair to connect WhatsApp*
👻 *Created by @LORDTARRIFIC*`, { parse_mode: 'Markdown' });
          break;
        }
        let connectionList = `╔═══════════════════╗
║  👻 GHOST BAN     ║
║  📱 MY CONNECTIONS ║
╚═══════════════════╝

`;
        userConnections.forEach((conn, index) => { const status = activeWhatsAppConnections.has(conn.phoneNumber) ? '✅ Online' : '❌ Offline'; connectionList += `${index + 1}. 📞 \`${conn.phoneNumber}\` - ${status}
`; });
        connectionList += `
━━━━━━━━━━━━━━━━━━━
📊 *Total:* ${userConnections.length} connection(s)`;
        connectionList += `
👻 *Created by @LORDTARRIFIC*`;
        telegramBot.sendMessage(chatId, connectionList, { parse_mode: 'Markdown' });
        break;
      }
      case "botinfo": {
        const uptime = process.uptime();
        const days = Math.floor(uptime / (60 * 60 * 24));
        const hours = Math.floor((uptime % (60 * 60 * 24)) / (60 * 60));
        const minutes = Math.floor((uptime % (60 * 60)) / 60);
        const totalConnections = Object.values(telegramConnectedUsers).reduce((acc, curr) => acc + curr.length, 0);
        const infoText = `╔═══════════════════╗
║   👻 GHOST BAN     ║
║   📊 BOT INFO      ║
╚═══════════════════╝

⏱ *Uptime:* ${days}d ${hours}h ${minutes}m
👥 *Total Users:* ${Object.keys(telegramConnectedUsers).length}
🔗 *Active Connections:* ${activeWhatsAppConnections.size}
📡 *Status:* Online ✅

━━━━━━━━━━━━━━━━━━━
🛠 *Developer:* @LORDTARRIFIC
📦 *Version:* 1.0.0
🌐 *Platform:* Node.js
━━━━━━━━━━━━━━━━━━━`;
        telegramBot.sendMessage(chatId, infoText, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔴 JOIN CHANNEL', url: 'https://t.me/lonerterritorybackagain' }]] } });
        break;
      }
      default:
        telegramBot.sendMessage(chatId, `╔═══════════════════╗
║  👻 GHOST BAN     ║
║  ❌ UNKNOWN CMD    ║
╚═══════════════════╝

*Command not recognized!*

━━━━━━━━━━━━━━━━━━━
*Type /start for help*
👻 *Created by @LORDTARRIFIC*`, { parse_mode: 'Markdown' });
    }
  });
}

// =====================================================
// MAIN STARTUP
// =====================================================
async function main() {
  try {
    await loadBaileys();
    if (telegramBot) { initializeTelegramBot(); }
    await loadAllSessions();
    console.log(`
╔════════════════════════════════════╗
║  👻 GHOST BAN BOT STARTED        ║
╚════════════════════════════════════╝

📱 WhatsApp Multi-User: Active
${telegramBot ? '🤖 Telegram Pairing: Active' : '⚠️  Telegram Pairing: Disabled'}
🔗 Active Connections: ${activeWhatsAppConnections.size}
⏰ Time: ${moment().format('HH:mm:ss')}
📅 Date: ${moment().format('DD/MM/YYYY')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🛠 Developer: @LORDTARRIFIC
👻 GHOST BAN - WhatsApp Group Management
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
  } catch (error) { console.error('❌ Error starting bot:', error); process.exit(1); }
}

main();
// ========== ADD THIS RIGHT AFTER main(); ==========
const http = require('http');
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('GHOST BAN BOT ACTIVE');
}).listen(PORT, () => {
    console.log(`Keep-alive server running on port ${PORT}`);
});
// ========== YOUR EXISTING CODE CONTINUES BELOW ==========
const ignoredErrors = ['Socket connection timeout', 'EKEYTYPE', 'item-not-found', 'rate-overlimit', 'Connection Closed', 'Timed Out', 'Value not found', 'member list is inaccessible'];
process.on('unhandledRejection', reason => { if (ignoredErrors.some(e => String(reason).includes(e))) return; console.log('Unhandled Rejection:', reason); });
