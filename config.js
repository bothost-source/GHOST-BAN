/**
 * Configuration for GHOST BAN / TARRIFIC MD
 */

const config = {
    // Bot Owner Configuration
    ownerNumber: ['2349121747036'],
    ownerName: 'TARRIFIC',

    // Bot Identity
    botName: 'TARRIFIC MD',
    botVersion: '1.0.0',
    prefix: '.',
    
    // Hosting & Session
    session: 'sessions', // Folder where WhatsApp login data is stored
    timezone: 'Africa/Nairobi',

    // UI & Branding
    thumbUrl: 'https://github.com/bothost-source/image/raw/refs/heads/main/image.jpg',

    // Status & Permissions (Required by your new index.js)
    status: {
        public: true,      // Allows others to use the bot if paired
        reactsw: true      // Auto-react to WhatsApp statuses
    },

    // Ghost Ban Specific Defaults
    ghostBan: {
        reportReason: "illegal",
        cooldown: 5000
    }
};

// This wrapper function is REQUIRED because your index.js calls it as config()
module.exports = () => {
    return config;
};
