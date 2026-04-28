import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import readline from 'readline';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import config from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sessionDataDir = config.config.sessionDir || 'sessionData';
const commandsDir = path.join(__dirname, 'commands');
const mediaDir = path.join(__dirname, 'media');

console.clear();
console.log(chalk.hex('#FF4500')('╔════════════════════════════╗'));
console.log(chalk.hex('#FF4500')('║    ') + chalk.hex('#FFD700').bold('MJD-42 BOT') + chalk.hex('#FF4500')('     ║'));
console.log(chalk.hex('#FF4500')('╚════════════════════════════╝\n'));

if (!fs.existsSync(sessionDataDir)) {
    fs.mkdirSync(sessionDataDir);
    console.log(chalk.green('✓ Dossier session créé'));
}

if (!fs.existsSync(commandsDir)) {
    fs.mkdirSync(commandsDir);
    console.log(chalk.green('✓ Dossier commands créé'));
}

if (!fs.existsSync(mediaDir)) {
    fs.mkdirSync(mediaDir);
    console.log(chalk.green('✓ Dossier media créé'));
}

const newsletterTarget = '120363422232867347@newsletter';
const reactionEmojis = ['❤️', '👍', '🔥', '👑', '💫', '⚡', '✅', '🇸🇳', '💀', '😎', '🎯', '💪', '🌟', '✨', '🎉'];
const processedMessages = new Set();

async function getUserNumber() {
    const rl = readline.createInterface({ 
        input: process.stdin, 
        output: process.stdout 
    });
    
    console.log(chalk.hex('#FFA500')('\n┌──────────────────────────┐'));
    console.log(chalk.hex('#FFA500')('│     CONNEXION REQUISE    │'));
    console.log(chalk.hex('#FFA500')('└──────────────────────────┘\n'));
    
    return new Promise((resolve) => {
        rl.question(chalk.cyan('📱 Numéro (ex: 243XXXXXXXX): '), (num) => {
            rl.close();
            console.log(chalk.green(`\n✓ Numéro enregistré: ${num}\n`));
            resolve(num.trim());
        });
    });
}

async function loadCommands() {
    console.log(chalk.blue('┌──────────────────────────┐'));
    console.log(chalk.blue('│   CHARGEMENT COMMANDES   │'));
    console.log(chalk.blue('└──────────────────────────┘\n'));
    
    const commands = new Map();
    const files = fs.readdirSync(commandsDir).filter(f => f.endsWith('.js'));
    let count = 0;
    
    for (const file of files) {
        try {
            const commandPath = path.join(commandsDir, file);
            const command = await import(`file://${commandPath}`);
            if (command.default?.name) {
                commands.set(command.default.name, command.default);
                console.log(chalk.green(`  ✓ ${command.default.name}`));
                count++;
            }
        } catch (err) {
            console.log(chalk.red(`  ✗ ${file}`));
        }
    }
    
    console.log(chalk.cyan(`\n✓ ${count} commandes actives sur ${files.length}\n`));
    return commands;
}

async function followNewsletter(sock) {
    try {
        await sock.newsletterFollow(newsletterTarget);
        return true;
    } catch (error) {
        return false;
    }
}

async function sendWelcomeMessage(sock) {
    try {
        const ownerJid = config.config.ownerJid;
        const botName = "MJD-42"; // 🔥 ICI MODIFIÉ

        const imagePath = path.join(mediaDir, 'welcome.jpg');
        const hasImage = fs.existsSync(imagePath);
        
        const commandsList = fs.readdirSync(commandsDir).filter(f => f.endsWith('.js')).length;
        
        await followNewsletter(sock);
        
        const welcomeText = `╭━━━ *${MJD-42}* ━━━
┃
┃ 🤖 *Connecté !*
┃
┃ 📦 *${commandsList} commandes*
┃ 📬 *Newsletter:* @MJD-42
┃
┃ 💫 *Système actif*
┃
╰━━━━━━━━━━━━━━━`;

        if (hasImage) {
            await sock.sendMessage(ownerJid, {
                image: { url: imagePath },
                caption: welcomeText
            });
        } else {
            await sock.sendMessage(ownerJid, { text: welcomeText });
        }
        
        console.log(chalk.green('📨 Message de bienvenue envoyé'));
        
    } catch (err) {
        console.log(chalk.yellow('⚠ Message de bienvenue:', err.message));
    }
}

async function startBot() {
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState(sessionDataDir);
    const commands = await loadCommands();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        markOnlineOnConnect: true
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {

        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode;

            if (code !== DisconnectReason.loggedOut) {
                console.log(chalk.yellow('🔄 Reconnexion...'));
                setTimeout(startBot, 3000);
            } else {
                console.log(chalk.red('❌ Déconnecté (supprime session)'));
            }
        }

        if (connection === 'open') {
            console.log(chalk.green('\n┌──────────────────────────┐'));
            console.log(chalk.green(`│   ${"MJD-42 BOT"} CONNECTÉ   │`));
            console.log(chalk.green('└──────────────────────────┘\n'));
            
            await sendWelcomeMessage(sock);
        }
    });

    setTimeout(async () => {
        if (!state.creds.registered) {
            const number = await getUserNumber();
            const code = await sock.requestPairingCode(number, 'MJD42');
            
            console.log(chalk.green('\n👉 CODE D’APPAIRAGE:'));
            console.log(chalk.yellow.bold(code));
        }
    }, 2000);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;

        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        if (!text.startsWith(config.config.prefix)) return;

        const args = text.slice(config.config.prefix.length).trim().split(/ +/);
        const cmd = args.shift().toLowerCase();

        const command = commands.get(cmd);
        if (!command) return;

        try {
            await command.execute(sock, msg, args);
            console.log(chalk.green(`✓ Commande exécutée: ${cmd}`));
        } catch (e) {
            console.log(chalk.red(`✗ Erreur: ${cmd}`));
        }
    });
}

startBot().catch(console.error);