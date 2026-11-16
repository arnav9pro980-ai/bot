
const mineflayer = require('@wp2508/mineflayer');

const CONFIG = {
    host: 'play.pika-network.net',
    port: 25565,
    username: 'botiee',
    auth: 'offline',
    version: '1.21.8',
    hideErrors: false,
    checkTimeoutInterval: 60000
};

const PASSWORD = 'patrickjane';
const TARGET_MODE = 'oplifesteal';
const TPA_TARGET = 'DudeTNT';

let registered = false;
let loggingIn = false;
let selectorUsed = false;
let modeSelected = false;
let processingWindow = false;

let hasEnteredMode = false;
let awaitingRespawn = false;
let stopped = false;
let loginCount = 0;

function log(message) {
    console.log(`[BOT] ${message}`);
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function normalize(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/§[0-9a-fk-or]/g, '')
        .replace(/[^a-z0-9]/g, '');
}

function getMessageText(message) {
    try {
        return typeof message === 'string'
            ? message
            : message.toString();
    } catch {
        return String(message);
    }
}

function getItemText(item) {
    if (!item) return '';

    return [
        item.name,
        item.displayName,
        item.customName,
        item.nbt ? JSON.stringify(item.nbt) : ''
    ].join(' ');
}

function isBanMessage(message) {
    const text = normalize(getMessageText(message));

    return (
        text.includes('banned') ||
        text.includes('permanentlybanned') ||
        text.includes('temporarilybanned') ||
        text.includes('0hearts') ||
        text.includes('zerohearts') ||
        text.includes('noheartsleft') ||
        text.includes('outofhearts')
    );
}

function stopBot(reason) {
    if (stopped) return;

    stopped = true;

    log('================================');
    log('BOT STOPPING');
    log(reason);
    log('================================');

    clearInterval(selectorInterval);

    try {
        bot.quit();
    } catch {}
}

// ============================================================
// TPA
// ============================================================

let tpaTimer = null;

function enterMode(reason) {
    if (stopped || hasEnteredMode) return;

    hasEnteredMode = true;

    log(`OP Lifesteal detected: ${reason}`);

    tpaTimer = setTimeout(() => {
        if (stopped || !bot.entity) return;

        log(`Sending /tpa ${TPA_TARGET}`);
        bot.chat(`/tpa ${TPA_TARGET}`);
    }, 2500);
}

function sendTPAAfterRespawn() {
    if (stopped || !hasEnteredMode) return;

    setTimeout(() => {
        if (stopped || !bot.entity) return;

        log(`Sending /tpa ${TPA_TARGET} after respawn`);
        bot.chat(`/tpa ${TPA_TARGET}`);
    }, 2500);
}

// ============================================================
// BOT
// ============================================================

const bot = mineflayer.createBot(CONFIG);

// ============================================================
// LOGIN
// ============================================================

bot.on('login', () => {
    loginCount++;

    log(`Logged in! (Login event ${loginCount})`);

    // PikaNetwork can reconnect the bot when switching servers.
    if (modeSelected && loginCount >= 2) {
        enterMode('Server transfer login');
    }
});

bot.on('spawn', () => {
    if (stopped) return;

    log(`Spawned as ${bot.username}`);

    if (awaitingRespawn) {
        awaitingRespawn = false;

        log('Respawn detected!');
        sendTPAAfterRespawn();
    }
});

// ============================================================
// CHAT / REGISTRATION / MODE DETECTION
// ============================================================

// ============================================================
// CHAT DEATH DETECTION
// ============================================================

let deathTPASent = false;

bot.on('message', message => {
    if (stopped) return;

    const text = message.toString();
    const lower = text.toLowerCase();

    console.log('[CHAT]', text);

    // Ban detection
    if (isBanMessage(text)) {
        stopBot('Ban or zero-hearts message: ' + text);
        return;
    }

    // Actual PikaNetwork death message
    if (lower.includes('you were killed by')) {
        log('Death detected from server chat!');

        awaitingRespawn = true;
        deathTPASent = false;

        return;
    }

    // Detect respawn / return to the game.
    if (
        awaitingRespawn &&
        (
            lower.includes('fly mode enabled') ||
            lower.includes('welcome to')
        )
    ) {
        awaitingRespawn = false;

        log('Returned to the game after death.');

        setTimeout(() => {
            if (stopped || deathTPASent) return;

            deathTPASent = true;

            log(`Sending /tpa ${TPA_TARGET} after death.`);
            bot.chat(`/tpa ${TPA_TARGET}`);
        }, 2500);
    }

    // Registration
    if (!registered && lower.includes('please register')) {
        registered = true;

        setTimeout(() => {
            if (stopped) return;

            bot.chat(`/register ${PASSWORD} ${PASSWORD}`);
            log('Registration command sent.');
        }, 1500);

        return;
    }

    // Login
    if (
        !loggingIn &&
        (
            lower.includes('please login') ||
            lower.includes('please log in') ||
            lower.includes('/login')
        )
    ) {
        loggingIn = true;

        setTimeout(() => {
            if (stopped) return;

            bot.chat(`/login ${PASSWORD}`);
            log('Login command sent.');
        }, 1500);
    }

    // Initial game entry
    if (
        modeSelected &&
        !hasEnteredMode &&
        lower.includes('fly mode enabled')
    ) {
        enterMode(text);
    }
});
// ============================================================
// SERVER SELECTOR
// ============================================================

async function openServerSelector() {
    if (stopped || selectorUsed || !bot.entity) return;

    const compass = bot.inventory.items().find(
        item => item.name === 'compass'
    );

    if (!compass) {
        log('Server Selector compass not found.');
        return;
    }

    try {
        log('Found Server Selector compass.');

        await bot.equip(compass, 'hand');
        await delay(1000);

        if (stopped) return;

        log('Right-clicking Server Selector...');

        selectorUsed = true;
        bot.activateItem();

    } catch (err) {
        log('Selector error: ' + err.message);
        selectorUsed = false;
    }
}

// ============================================================
// GUI
// ============================================================

bot.on('windowOpen', async window => {
    if (stopped || processingWindow) return;

    processingWindow = true;

    try {
        log('CHEST MENU OPENED');
        log('Title: ' + JSON.stringify(window.title));

        await delay(700);

        if (stopped || !bot.currentWindow) return;

        // Custom respawn menu, if the server opens one.
        if (awaitingRespawn) {
            let respawnSlot = -1;

            for (let i = 0; i < window.slots.length; i++) {
                const item = window.slots[i];

                if (!item) continue;

                const itemText = normalize(getItemText(item));

                if (
                    itemText.includes('respawn') ||
                    itemText.includes('revive')
                ) {
                    respawnSlot = i;
                    break;
                }
            }

            if (respawnSlot !== -1) {
                log(`Found Respawn button at slot ${respawnSlot}.`);

                await bot.clickWindow(respawnSlot, 0, 0);

                log('Clicked Respawn!');
                return;
            }
        }

        if (modeSelected) return;

        let targetSlot = -1;

        for (let i = 0; i < window.slots.length; i++) {
            const item = window.slots[i];

            if (!item) continue;

            log(`Slot ${i}: ${item.name} | ${item.displayName}`);

            if (item.name === 'golden_apple') {
                targetSlot = i;
                break;
            }
        }

        if (targetSlot === -1) {
            log('Golden Apple not found!');
            return;
        }

        log(`Found Golden Apple at slot ${targetSlot}.`);

        await delay(1000);

        if (stopped || !bot.currentWindow) return;

        await bot.clickWindow(targetSlot, 0, 0);

        modeSelected = true;

        log('Clicked Golden Apple!');
        log('Waiting to enter OP Lifesteal...');

    } catch (err) {
        log('GUI error: ' + err.message);
    } finally {
        processingWindow = false;
    }
});

// ============================================================
// AUTOMATIC SERVER SELECTOR
// ============================================================

let selectorAttempts = 0;

const selectorInterval = setInterval(async () => {
    if (stopped || !bot.entity || selectorUsed || modeSelected) return;

    selectorAttempts++;

    if (selectorAttempts > 15) {
        clearInterval(selectorInterval);
        log('Could not automatically open Server Selector.');
        return;
    }

    await openServerSelector();
}, 2000);

// ============================================================
// DEATH / RESPAWN
// ============================================================

bot.on('death', async () => {
    if (stopped || awaitingRespawn) return;

    log('Bot died!');
    awaitingRespawn = true;

    await delay(1500);

    if (stopped || !awaitingRespawn) return;

    try {
        log('Requesting respawn...');
        bot.respawn();
    } catch (err) {
        log('Respawn error: ' + err.message);
    }
});

// ============================================================
// PLAYER CHAT
// ============================================================

bot.on('chat', (username, message) => {
    console.log(`[PLAYER CHAT] ${username}: ${message}`);

    if (stopped) return;

    if (isBanMessage(message)) {
        stopBot('Ban detected: ' + message);
    }
});

// ============================================================
// KICK / BAN
// ============================================================

bot.on('kicked', reason => {
    const text = getMessageText(reason);

    console.log('[KICKED]', text);

    stopBot(
        isBanMessage(text)
            ? 'Ban detected: ' + text
            : 'Server disconnected the bot: ' + text
    );
});

// ============================================================
// ERRORS / DISCONNECTION
// ============================================================

bot.on('error', err => {
    console.error('[ERROR]', err.stack || err);
});

bot.on('end', reason => {
    log(`Disconnected: ${reason || 'Unknown reason'}`);

    stopped = true;
    clearInterval(selectorInterval);

    if (tpaTimer) clearTimeout(tpaTimer);
});

// ============================================================
// MANUAL STOP
// ============================================================

process.on('SIGINT', () => {
    log('Stopping bot...');

    stopped = true;
    clearInterval(selectorInterval);

    if (tpaTimer) clearTimeout(tpaTimer);

    try {
        bot.quit();
    } catch {}

    process.exit(0);
});
