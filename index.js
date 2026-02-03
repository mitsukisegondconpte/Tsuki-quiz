const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    delay
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
require('dotenv').config();

const QuizManager = require('./quizzes/quizManager');
const { sendMessageWA } = require('./utils/sendMessageWA');

const logger = pino({ level: 'silent' });
const quizManager = new QuizManager(sendMessageWA);

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: true,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        defaultQueryTimeoutMs: 60000,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        generateHighQualityLinkPreview: true,
        markOnlineOnConnect: true,
        syncFullHistory: false
    });

    if (process.env.WHATSAPP_NUMBER && !sock.authState.creds.registered) {
        const phoneNumber = process.env.WHATSAPP_NUMBER.replace(/[^0-9]/g, '');
        await delay(3000);
        try {
            const code = await sock.requestPairingCode(phoneNumber);
            console.log(`\n========================================\nCODE DE PAIRAGE : ${code}\n========================================\n`);
        } catch (e) {
            console.error("Erreur pairing code:", e.message);
        }
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const statusCode = (lastDisconnect?.error instanceof Boom)?.output?.statusCode || lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            
            console.log(`Connexion fermée (raison: ${statusCode}). Reconnexion: ${shouldReconnect}`);
            
            if (shouldReconnect) {
                const delayMs = 5000;
                console.log(`Tentative de reconnexion dans ${delayMs/1000}s...`);
                await delay(delayMs);
                startBot();
            }
        } else if (connection === 'open') {
            console.log('✅ Bot connecté et prêt !');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        for (const msg of messages) {
            if (!msg.message || msg.key.fromMe) continue;
            
            const from = msg.key.remoteJid;
            const sender = msg.key.participant || msg.key.remoteJid;
            const testNumber = process.env.TEST_NUMBER;

            // Restrict bot to test number if specified in .env
            if (testNumber && !from.includes(testNumber) && !sender.includes(testNumber)) {
                return;
            }
            
            // Handle regular text and button responses
            let body = "";
            if (msg.message.buttonsResponseMessage) {
                body = msg.message.buttonsResponseMessage.selectedButtonId;
            } else if (msg.message.templateButtonReplyMessage) {
                body = msg.message.templateButtonReplyMessage.selectedId;
            } else if (msg.message.interactiveResponseMessage) {
                try {
                    const response = JSON.parse(msg.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson);
                    body = response.id || response.item_id || response.button_id || "";
                } catch (e) {
                    body = msg.message.interactiveResponseMessage.nativeFlowResponseMessage?.paramsJson || "";
                }
            } else if (msg.message.listResponseMessage) {
                body = msg.message.listResponseMessage.singleSelectReply.selectedRowId;
            } else {
                body = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
            }

            await quizManager.handleMessage(sock, msg, from, body, sender, msg);
        }
    });
}

startBot();
