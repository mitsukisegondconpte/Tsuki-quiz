const StephUI = require('stephtech-ui');

async function sendMessageWA(sock, jid, text, mentions = [], buttons = []) {
    if (!sock) {
        console.error("Erreur: Instance socket Baileys manquante dans sendMessageWA");
        return;
    }
    
    try {
        const UIClass = StephUI.default || StephUI;
        const ui = new UIClass(sock);
        
        if (buttons && buttons.length > 0) {
            return await ui.buttons(jid, {
                text: text,
                footer: ">  TSUKI_QUIZ-BOT",
                buttons: buttons.map(b => ({
                    id: b.id || b.buttonId,
                    text: b.text || b.buttonText?.displayText || b.displayText || "Option"
                })),
                contextInfo: mentions && mentions.length > 0 ? { mentionedJid: mentions } : {}
            });
        }
    } catch (e) {
        console.error("Erreur StephUI, repli sur message texte:", e);
    }

    const messageOptions = {
        text: text,
        mentions: mentions,
    };
    return await sock.sendMessage(jid, messageOptions);
}

module.exports = { sendMessageWA };
