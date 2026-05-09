const { jidDecode } = require('@whiskeysockets/baileys');
const smsg = (sock, m, store) => {
    if (!m) return m;
    if (m.key) {
        m.id = m.key.id;
        m.chat = m.key.remoteJid;
        m.fromMe = m.key.fromMe;
        m.sender = jidDecode(sock.user.id).user + '@s.whatsapp.net';
    }
    return m;
};
module.exports = { smsg };
