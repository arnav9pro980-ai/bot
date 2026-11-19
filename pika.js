const mineflayer = require('@wp2508/mineflayer');

// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
    host: 'play.bananasmp.net',
    port: 25565,
    auth: 'offline',
    version: '1.21.10',
    hideErrors: false,
    checkTimeoutInterval: 60000
};

const PASSWORD = 'patrickjane';
const DUDETNT = 'DudeTNT';

const MAX_BOTS = 20;
const SPAWN_DELAY = 10000;
const FIRST_SPAWN_DELAY = 0;

const TPA_RETRY_DELAY = 15000;
const TPA_CONFIRM_DELAY = 1500;
const DEATH_RESPAWN_DELAY = 2000;

// ============================================================
// GLOBAL STATE
// ============================================================

const bots = new Map();

let botCounter = 0;
let spawnTimer = null;
let shuttingDown = false;

// ============================================================
// HELPERS
// ============================================================

function log(role, message) {
    console.log(`[${role}] ${message}`);
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function normalize(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/§[0-9a-fk-or]/gi, '')
        .replace(/[^a-z0-9]/g, '');
}

function randomThreeLetters() {
    return Array.from({ length: 3 }, () =>
        String.fromCharCode(97 + Math.floor(Math.random() * 26))
    ).join('');
}

function extractText(value, output = []) {
    if (value === null || value === undefined) return output;

    if (typeof value === 'string' || typeof value === 'number') {
        output.push(String(value));
        return output;
    }

    if (Array.isArray(value)) {
        for (const item of value) extractText(item, output);
        return output;
    }

    if (typeof value === 'object') {
        if (typeof value.text === 'string') output.push(value.text);
        if (typeof value.translate === 'string') output.push(value.translate);
        if (value.with) extractText(value.with, output);
        if (value.extra) extractText(value.extra, output);
        if (value.value !== undefined) extractText(value.value, output);
        if (value.children) extractText(value.children, output);
    }

    return output;
}

function getMessageText(message) {
    if (typeof message === 'string') return message;
    if (!message) return '';

    const output = [];

    try {
        if (typeof message.toJSON === 'function') {
            extractText(message.toJSON(), output);
        }

        if (typeof message.toString === 'function') {
            const readable = message.toString();

            if (readable && readable !== '[object Object]') {
                output.push(readable);
            }
        }

        if (!output.length) extractText(message, output);
    } catch {
        return String(message);
    }

    return output.join(' ');
}

function getItemText(item) {
    if (!item) return '';

    let nbt = '';

    try {
        nbt = item.nbt ? JSON.stringify(item.nbt) : '';
    } catch {}

    return [
        item.name,
        item.displayName,
        item.customName,
        nbt
    ].join(' ');
}

// ============================================================
// BOT CREATION
// ============================================================

function createBot(username) {
    const bot = mineflayer.createBot({
        ...CONFIG,
        username
    });

    const state = {
        stopped: false,

        registered: false,
        loggingIn: false,
        authReady: false,

        lastAuthCommand: 0,

        selectorUsed: false,
        selectorBusy: false,
        modeSelected: false,
        hasEnteredMode: false,

        awaitingTpaGui: false,
        teleportPending: false,

        processingWindow: false,
        windowQueue: Promise.resolve(),

        eating: false,

        selectorInterval: null,
        foodInterval: null,
        authTimer: null,
        tpaTimer: null,
        tpaRetryTimer: null,
        respawnTimer: null
    };

    function botLog(message) {
        log(username, message);
    }

    // ========================================================
    // TIMERS
    // ========================================================

    function clearTimers() {
        clearInterval(state.selectorInterval);
        clearInterval(state.foodInterval);

        clearTimeout(state.authTimer);
        clearTimeout(state.tpaTimer);
        clearTimeout(state.tpaRetryTimer);
        clearTimeout(state.respawnTimer);
    }

    // ========================================================
    // STOP
    // ========================================================

    function stop(reason) {
        if (state.stopped) return;

        state.stopped = true;

        botLog(`Stopping: ${reason}`);

        clearTimers();

        try {
            bot.quit();
        } catch {}
    }

    // ========================================================
    // AUTHENTICATION
    // ========================================================

    function authenticationComplete() {
        if (state.stopped || state.authReady) return;

        state.authReady = true;
        state.loggingIn = false;

        botLog('Authentication successful.');

        state.authTimer = setTimeout(() => {
            if (state.stopped) return;

            botLog('Inventory:');

            for (const item of bot.inventory.items()) {
                botLog(`${item.name} | ${item.displayName} | ${item.slot}`);
            }
        }, 3000);
    }

    function handleAuthentication(message) {
        if (state.stopped || state.authReady) return;

        const text = normalize(getMessageText(message));

        if (!text) return;

        const now = Date.now();

        const success =
            text.includes('successfullyloggedin') ||
            text.includes('loggedinsuccessfully') ||
            text.includes('loginsuccessful') ||
            text.includes('successfullyregistered') ||
            text.includes('registrationsuccessful') ||
            text.includes('youarenowloggedin') ||
            text.includes('authenticationsuccessful');

        if (success) {
            authenticationComplete();
            return;
        }

        const register =
            text.includes('registerusing') ||
            text.includes('pleasecreateanaccount') ||
            text.includes('notregistered');

        if (
            register &&
            !state.registered &&
            now - state.lastAuthCommand > 3000
        ) {
            state.registered = true;
            state.lastAuthCommand = now;

            botLog('Registering account...');

            bot.chat(`/register ${PASSWORD} ${PASSWORD}`);
            return;
        }

        const login =
            text.includes('pleaselogin') ||
            text.includes('loginusing') ||
            text.includes('youneedtologin') ||
            text.includes('pleaseauthenticate') ||
            text.includes('authenticationrequired');

        if (
            login &&
            !state.loggingIn &&
            now - state.lastAuthCommand > 3000
        ) {
            state.loggingIn = true;
            state.lastAuthCommand = now;

            botLog('Logging in...');

            bot.chat(`/login ${PASSWORD}`);
            return;
        }

        if (
            text.includes('incorrectpassword') ||
            text.includes('wrongpassword') ||
            text.includes('invalidpassword')
        ) {
            state.loggingIn = false;
            botLog('Incorrect password!');
        }
    }

    // ========================================================
    // SERVER SELECTOR
    // ========================================================

    async function openServerSelector() {
        if (
            state.stopped ||
            !state.authReady ||
            state.selectorUsed ||
            state.selectorBusy ||
            !bot.entity
        ) {
            return;
        }

        state.selectorBusy = true;

        try {
            const items = bot.inventory.items();

            const selector = items.find(item => {
                const name = normalize(getItemText(item));

                return (
                    item.name === 'compass' ||
                    name.includes('serverselector') ||
                    name.includes('gameselector') ||
                    name.includes('servermenu') ||
                    name.includes('gamemenu')
                );
            });

            if (!selector) return;

            botLog(`Selector found: ${selector.name}`);

            await bot.equip(selector, 'hand');
            await delay(800);

            if (state.stopped) return;

            await bot.activateItem();

            state.selectorUsed = true;

            botLog('Server selector activated.');
        } catch (err) {
            botLog(`Selector error: ${err.message}`);
        } finally {
            state.selectorBusy = false;
        }
    }

    // ========================================================
    // LIFESTEAL
    // ========================================================

    function enterMode(reason) {
        if (
            state.stopped ||
            state.hasEnteredMode
        ) {
            return;
        }

        state.hasEnteredMode = true;

        botLog(`Entered Lifesteal: ${reason}`);

        setTimeout(() => {
            if (state.stopped) return;

            requestTeleport();
        }, 2000);
    }

    // ========================================================
    // TELEPORT
    // ========================================================

    function requestTeleport() {
        if (
            state.stopped ||
            !state.authReady ||
            !state.hasEnteredMode ||
            state.awaitingTpaGui ||
            state.teleportPending ||
            !bot.entity
        ) {
            return;
        }

        state.awaitingTpaGui = true;

        botLog(`Sending TPA request to ${DUDETNT}...`);

        bot.chat(`/tpa ${DUDETNT}`);

        clearTimeout(state.tpaRetryTimer);

        state.tpaRetryTimer = setTimeout(() => {
            if (state.stopped || !state.awaitingTpaGui) return;

            botLog('TPA confirmation timed out. Retrying.');

            state.awaitingTpaGui = false;

            requestTeleport();
        }, TPA_RETRY_DELAY);
    }

    // ========================================================
    // TPA GUI
    // ========================================================

    async function handleTpaWindow(window) {
        if (!state.awaitingTpaGui) return false;

        botLog('TPA confirmation GUI detected.');

        const slot = window.slots.findIndex(item => {
            if (!item) return false;

            const name = normalize(getItemText(item));

            return (
                item.name === 'lime_shulker_box' ||
                item.name === 'green_shulker_box' ||
                (
                    name.includes('shulker') &&
                    (
                        name.includes('lime') ||
                        name.includes('green')
                    )
                )
            );
        });

        if (slot === -1) {
            botLog('Green/lime shulker not found.');

            window.slots.forEach((item, index) => {
                if (item) {
                    botLog(`TPA Slot ${index}: ${item.name} | ${item.displayName}`);
                }
            });

            return true;
        }

        botLog(`Found confirmation item at slot ${slot}.`);

        await bot.clickWindow(slot, 0, 0);

        if (state.stopped) return true;

        clearTimeout(state.tpaRetryTimer);

        state.awaitingTpaGui = false;
        state.teleportPending = true;

        botLog('TPA confirmation clicked.');

        state.tpaTimer = setTimeout(() => {
            if (state.stopped) return;

            state.teleportPending = false;

            botLog('Teleport wait completed.');
        }, 8000);

        return true;
    }

    // ========================================================
    // AUTOMATIC FOOD
    // ========================================================

    async function eatFoodIfNeeded() {
        if (
            state.stopped ||
            !state.authReady ||
            !bot.entity ||
            bot.food === undefined ||
            bot.food >= 18 ||
            state.eating ||
            bot.currentWindow
        ) {
            return;
        }

        const safeFood = [
            'apple',
            'bread',
            'carrot',
            'baked_potato',
            'melon_slice',
            'sweet_berries',
            'glow_berries',
            'cookie',
            'pumpkin_pie',
            'cooked_beef',
            'cooked_porkchop',
            'cooked_chicken',
            'cooked_mutton',
            'cooked_rabbit',
            'cooked_cod',
            'cooked_salmon',
            'golden_carrot',
            'golden_apple',
            'beetroot',
            'dried_kelp'
        ];

        const food = bot.inventory.items().find(item =>
            safeFood.includes(item.name)
        );

        if (!food) return;

        state.eating = true;

        try {
            botLog(`Eating ${food.name}...`);

            await bot.equip(food, 'hand');

            if (state.stopped) return;

            await bot.consume();

            botLog('Food consumed.');
        } catch (err) {
            botLog(`Food error: ${err.message}`);
        } finally {
            state.eating = false;
        }
    }

    // ========================================================
    // GUI HANDLER
    // ========================================================

    async function processWindow(window) {
        if (
            state.stopped ||
            bot.currentWindow !== window
        ) {
            return;
        }

        state.processingWindow = true;

        try {
            botLog('========== GUI OPENED ==========');
            botLog(`Title: ${getMessageText(window.title)}`);

            await delay(700);

            if (
                state.stopped ||
                bot.currentWindow !== window
            ) {
                return;
            }

            // TPA GUI

            if (state.awaitingTpaGui) {
                await handleTpaWindow(window);
                return;
            }

            // Server selector GUI

            if (state.modeSelected) return;

            let targetSlot = -1;

            for (let i = 0; i < window.slots.length; i++) {
                const item = window.slots[i];

                if (!item) continue;

                const itemText = normalize(getItemText(item));

                botLog(
                    `Slot ${i}: ${item.name} | ${item.displayName}`
                );

                if (
                    item.name === 'red_dye' ||
                    (
                        itemText.includes('lifesteal') &&
                        itemText.includes('red')
                    )
                ) {
                    targetSlot = i;
                    break;
                }
            }

            if (targetSlot === -1) {
                botLog('Lifesteal Red Dye not found.');
                return;
            }

            botLog(`Found Lifesteal at slot ${targetSlot}.`);

            await delay(800);

            if (
                state.stopped ||
                bot.currentWindow !== window
            ) {
                return;
            }

            await bot.clickWindow(targetSlot, 0, 0);

            state.modeSelected = true;

            botLog('Lifesteal selected.');
        } catch (err) {
            botLog(`GUI error: ${err.message}`);
        } finally {
            state.processingWindow = false;
        }
    }

    // ========================================================
    // RESOURCE PACK
    // ========================================================

    bot.on('resourcePack', () => {
        try {
            bot.denyResourcePack();
        } catch (err) {
            botLog(`Resource pack error: ${err.message}`);
        }
    });

    // ========================================================
    // LOGIN
    // ========================================================

    bot.on('login', () => {
        botLog(`Logged in as ${bot.username}.`);
    });

    // ========================================================
    // SPAWN
    // ========================================================

    bot.on('spawn', () => {
        if (state.stopped) return;

        botLog('Spawned.');

        if (state.modeSelected && !state.hasEnteredMode) {
            enterMode('Spawn after Lifesteal selection');
        }

        if (state.hasEnteredMode) {
            clearTimeout(state.tpaTimer);
            state.teleportPending = false;

            setTimeout(() => {
                if (state.stopped) return;
                requestTeleport();
            }, 2000);
        }
    });

    // ========================================================
    // SERVER MESSAGES
    // ========================================================

    bot.on('message', message => {
        if (state.stopped) return;

        const text = getMessageText(message);

        if (!text) return;

        handleAuthentication(message);

        const normalized = normalize(text);

        if (
            normalized.includes('welcome') &&
            normalized.includes('tolifesteal')
        ) {
            enterMode('Lifesteal welcome message');
        }

        if (
            normalized.includes('teleportingto') ||
            normalized.includes('teleportedsuccessfully') ||
            normalized.includes('teleportationcomplete')
        ) {
            state.teleportPending = false;
            botLog('Teleport confirmation received.');
        }
    });

    // ========================================================
    // CHAT
    // ========================================================

    bot.on('chat', (player, message) => {
        if (state.stopped) return;
    });

    // ========================================================
    // WINDOW OPEN
    // ========================================================

    bot.on('windowOpen', window => {
        state.windowQueue = state.windowQueue
            .then(() => processWindow(window))
            .catch(err => {
                botLog(`Window queue error: ${err.message}`);
            });
    });

    // ========================================================
    // SELECTOR LOOP
    // ========================================================

    state.selectorInterval = setInterval(() => {
        if (
            state.stopped ||
            !state.authReady ||
            !bot.entity ||
            state.selectorUsed ||
            state.modeSelected
        ) {
            return;
        }

        openServerSelector();
    }, 3000);

    // ========================================================
    // FOOD LOOP
    // ========================================================

    state.foodInterval = setInterval(() => {
        eatFoodIfNeeded();
    }, 5000);

    // ========================================================
    // DEATH / RESPAWN
    // ========================================================

    bot.on('death', () => {
        if (state.stopped) return;

        botLog('Bot died.');

        state.teleportPending = false;
        state.awaitingTpaGui = false;

        clearTimeout(state.tpaTimer);
        clearTimeout(state.tpaRetryTimer);

        state.respawnTimer = setTimeout(() => {
            if (state.stopped) return;

            try {
                botLog('Requesting respawn...');
                bot.respawn();
            } catch (err) {
                botLog(`Respawn error: ${err.message}`);
            }
        }, DEATH_RESPAWN_DELAY);
    });

    // ========================================================
    // KICK
    // ========================================================

    bot.on('kicked', (reason, loggedIn) => {
        botLog('========== KICKED ==========');
        botLog(`Reason: ${getMessageText(reason)}`);
        botLog(`Logged in: ${loggedIn}`);

        state.stopped = true;
        clearTimers();
    });

    // ========================================================
    // ERRORS
    // ========================================================

    bot.on('error', err => {
        botLog(`ERROR: ${err.message}`);
    });

    // ========================================================
    // DISCONNECT
    // ========================================================

    bot.on('end', reason => {
        botLog(`Disconnected: ${String(reason || 'Unknown')}`);

        state.stopped = true;
        clearTimers();

        bots.delete(username);

        if (!shuttingDown) {
            scheduleBots();
        }
    });

    bots.set(username, bot);

    bot._agentState = state;

    return bot;
}

// ============================================================
// SPAWN SYSTEM
// ============================================================

function scheduleBots() {
    if (shuttingDown || spawnTimer) return;

    if (bots.size >= MAX_BOTS) return;

    spawnTimer = setTimeout(() => {
        spawnTimer = null;

        if (shuttingDown || bots.size >= MAX_BOTS) return;

        spawnGanger();

        if (bots.size < MAX_BOTS) {
            scheduleBots();
        }
    }, SPAWN_DELAY);
}

function spawnGanger() {
    if (shuttingDown || bots.size >= MAX_BOTS) return;

    botCounter++;

    const username = `MohanJudariooo${randomThreeLetters()}`;

    log('SYSTEM', '================================');
    log('SYSTEM', `Creating Bot #${botCounter}`);
    log('SYSTEM', `Username: ${username}`);
    log('SYSTEM', `Active bots: ${bots.size + 1}/${MAX_BOTS}`);
    log('SYSTEM', '================================');

    createBot(username);
}

// ============================================================
// START
// ============================================================

log('SYSTEM', 'Starting multi-bot system.');
log('SYSTEM', `Maximum bots: ${MAX_BOTS}`);
log('SYSTEM', `Teleport target: ${DUDETNT}`);
log('SYSTEM', 'Inventory dropping: DISABLED');
log('SYSTEM', 'Kit selection: DISABLED');
log('SYSTEM', 'Automatic food: ENABLED');

setTimeout(() => {
    spawnGanger();
    scheduleBots();
}, FIRST_SPAWN_DELAY);

// ============================================================
// SHUTDOWN
// ============================================================

process.on('SIGINT', () => {
    log('SYSTEM', 'Shutting down all bots...');

    shuttingDown = true;

    clearTimeout(spawnTimer);

    for (const [username, bot] of bots) {
        log('SYSTEM', `Disconnecting ${username}`);

        try {
            bot.quit();
        } catch {}
    }

    bots.clear();

    process.exit(0);
});
