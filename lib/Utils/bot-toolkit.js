"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeBotToolkit = void 0;
/**
 * A grab-bag of small, self-contained quality-of-life features that don't
 * exist in upstream Baileys or other forks. None of this touches the core
 * decrypt/encrypt/socket pipeline - it's all additive, attached to the
 * socket's return object.
 */
const makeBotToolkit = (conn, logger) => {
    const startedAt = Date.now();
    const seenMessageIds = new Map(); // id -> timestamp, used for dedup
    const rateLimitBuckets = new Map(); // `${jid}:${key}` -> last timestamp
    const DEDUP_TTL_MS = 60 * 1000;
    const dedupCleanupEvery = 200;
    let dedupCounter = 0;
    /** internal: drop old entries from the dedup map so it doesn't grow forever */
    const cleanupDedup = () => {
        const now = Date.now();
        for (const [id, ts] of seenMessageIds) {
            if (now - ts > DEDUP_TTL_MS) {
                seenMessageIds.delete(id);
            }
        }
    };
    const pollTallies = new Map(); // pollMsgId -> { question, options, votes: Map<voterJid, optionIndex[]>, listening }
    const groupMetaCache = new Map(); // jid -> { data, fetchedAt }
    const GROUP_META_TTL_MS = 60 * 1000;
    return {
        /**
         * Releases bot-toolkit's own internal state (poll trackers, group
         * metadata cache, dedup/rate-limit maps). Call this when a session
         * ends/logs out, alongside the socket's own cleanup, so nothing in
         * this toolkit keeps holding memory for a dead connection.
         */
        destroy() {
            seenMessageIds.clear();
            rateLimitBuckets.clear();
            groupMetaCache.clear();
            pollTallies.clear();
        },
        /**
         * Checks if a user is an admin/superadmin in a group, using the
         * cached metadata getter above so repeated checks (every message in
         * a busy group) don't keep re-fetching from WA.
         */
        async isGroupAdmin(groupJid, userJid) {
            const meta = await this.getCachedGroupMetadata(groupJid);
            const participant = meta?.participants?.find((p) => p.id === userJid || p.jid === userJid);
            return participant?.admin === 'admin' || participant?.admin === 'superadmin';
        },
        /**
         * Splits long text into WhatsApp-safe chunks and sends them one
         * after another (with a small delay), so a long AI response or log
         * dump doesn't get truncated or rejected for being too long.
         */
        async sendChunked(jid, text, options = {}, maxLen = 4000, delayMs = 800) {
            if (!text || text.length <= maxLen) {
                return [await conn.sendMessage(jid, { text, ...options })];
            }
            const chunks = [];
            for (let i = 0; i < text.length; i += maxLen) {
                chunks.push(text.slice(i, i + maxLen));
            }
            const sent = [];
            for (let i = 0; i < chunks.length; i++) {
                sent.push(await conn.sendMessage(jid, { text: chunks[i], ...options }));
                if (i < chunks.length - 1) {
                    await new Promise((r) => setTimeout(r, delayMs));
                }
            }
            return sent;
        },
        /**
         * Shows "typing..." presence for a bit before actually sending - makes
         * the bot feel less robotic. `typingMs` is how long to show typing
         * before the message goes out.
         */
        async sendWithTyping(jid, content, options = {}, typingMs = 1200) {
            try {
                await conn.sendPresenceUpdate('composing', jid);
                await new Promise((r) => setTimeout(r, typingMs));
                await conn.sendPresenceUpdate('paused', jid);
            }
            catch (err) {
                logger.debug({ err }, 'sendWithTyping: presence update failed, sending anyway');
            }
            return conn.sendMessage(jid, content, options);
        },
        /**
         * sendMessage with automatic retry on transient failures (network
         * blips, rate limiting) - NOT for permanent failures like invalid
         * jid. Retries up to `retries` times with growing delay.
         */
        async sendMessageSafe(jid, content, options = {}, retries = 3) {
            let lastErr;
            for (let attempt = 1; attempt <= retries; attempt++) {
                try {
                    return await conn.sendMessage(jid, content, options);
                }
                catch (err) {
                    lastErr = err;
                    const isLikelyTransient = /(timed out|ECONNRESET|ETIMEDOUT|rate-overlimit|Internal Server Error)/i.test(err?.message || '');
                    if (!isLikelyTransient || attempt === retries) {
                        throw err;
                    }
                    logger.debug({ attempt, err }, 'sendMessageSafe: transient failure, retrying');
                    await new Promise((r) => setTimeout(r, 1000 * attempt));
                }
            }
            throw lastErr;
        },
        /**
         * Downloads any URL into a Buffer - the one-liner you end up writing
         * in every plugin that needs to grab an image/file from the internet
         * before sending it.
         */
        async getBuffer(url, opts = {}) {
            const res = await fetch(url, opts);
            if (!res.ok) {
                throw new Error(`getBuffer: HTTP ${res.status} fetching ${url}`);
            }
            const arrBuf = await res.arrayBuffer();
            return Buffer.from(arrBuf);
        },
        /**
         * Downloads a URL and sends it as the right message type automatically,
         * based on the response's content-type (falls back to sniffing the
         * file extension in the URL if the server doesn't send one).
         *   await conn.sendFileFromUrl(jid, 'https://example.com/cat.png', { caption: 'meow' })
         */
        async sendFileFromUrl(jid, url, options = {}) {
            const res = await fetch(url);
            if (!res.ok) {
                throw new Error(`sendFileFromUrl: HTTP ${res.status} fetching ${url}`);
            }
            const contentType = res.headers.get('content-type') || '';
            const buffer = Buffer.from(await res.arrayBuffer());
            let contentKey = 'document';
            if (contentType.startsWith('image/') || /\.(jpe?g|png|webp|gif)$/i.test(url)) {
                contentKey = 'image';
            }
            else if (contentType.startsWith('video/') || /\.(mp4|mkv|mov)$/i.test(url)) {
                contentKey = 'video';
            }
            else if (contentType.startsWith('audio/') || /\.(mp3|ogg|wav|m4a)$/i.test(url)) {
                contentKey = 'audio';
            }
            const content = { [contentKey]: buffer, ...options };
            if (contentKey === 'document' && !content.mimetype) {
                content.mimetype = contentType || 'application/octet-stream';
            }
            return conn.sendMessage(jid, content, options.messageOptions || {});
        },
        /** human-readable uptime string, e.g. "2h 14m 9s", for status/.ping commands */
        uptimeString() {
            const ms = Date.now() - startedAt;
            const s = Math.floor(ms / 1000) % 60;
            const m = Math.floor(ms / 60000) % 60;
            const h = Math.floor(ms / 3600000);
            return `${h}h ${m}m ${s}s`;
        },
        /**
         * Cached groupMetadata - avoids hammering WA's servers when you call
         * groupMetadata() repeatedly for the same group in a short window
         * (e.g. every message handler checking admin status). Falls back to
         * a real fetch automatically once the cache entry goes stale.
         */
        async getCachedGroupMetadata(jid, ttlMs = GROUP_META_TTL_MS) {
            const cached = groupMetaCache.get(jid);
            const now = Date.now();
            if (cached && now - cached.fetchedAt < ttlMs) {
                return cached.data;
            }
            const data = await conn.groupMetadata(jid);
            groupMetaCache.set(jid, { data, fetchedAt: now });
            return data;
        },
        /** drops a single group (or the whole cache if no jid given) from getCachedGroupMetadata's cache */
        invalidateGroupMetadataCache(jid) {
            if (jid) {
                groupMetaCache.delete(jid);
            }
            else {
                groupMetaCache.clear();
            }
        },
        /**
         * Scans message text for @628xxx-style mentions and returns the jids
         * it found, so you don't have to write the regex yourself every time
         * you want to build a mentions-enabled message.
         *   const mentions = conn.parseMentions('hai @6281234567890 apa kabar')
         *   conn.sendMessage(jid, { text, mentions })
         */
        parseMentions(text) {
            if (!text) {
                return [];
            }
            const matches = text.match(/@(\d{5,16})/g) || [];
            return matches.map((m) => `${m.slice(1)}@s.whatsapp.net`);
        },
        /**
         * Normalizes a loosely-formatted phone number into a proper WA jid.
         * Strips spaces/dashes/plus/parens, and turns a leading "0" into "62"
         * (change defaultCountryCode if most of your users aren't Indonesian).
         *   conn.formatJid('0812-3456-7890') -> '6281234567890@s.whatsapp.net'
         *   conn.formatJid('+62 812 3456 7890') -> '6281234567890@s.whatsapp.net'
         */
        formatJid(numberOrJid, defaultCountryCode = '62') {
            if (!numberOrJid) {
                return null;
            }
            if (numberOrJid.includes('@')) {
                return numberOrJid;
            }
            let digits = numberOrJid.replace(/[^\d]/g, '');
            if (digits.startsWith('0')) {
                digits = defaultCountryCode + digits.slice(1);
            }
            return `${digits}@s.whatsapp.net`;
        },
        /**
         * Unwraps a view-once message (any version) and returns the real
         * underlying content (imageMessage/videoMessage/audioMessage), so you
         * can download/save it before it's gone. Returns null if the message
         * isn't a view-once wrapper.
         */
        extractViewOnce(message) {
            if (!message) {
                return null;
            }
            const wrapped = message.viewOnceMessage?.message
                || message.viewOnceMessageV2?.message
                || message.viewOnceMessageV2Extension?.message
                || null;
            if (!wrapped) {
                return null;
            }
            const innerType = Object.keys(wrapped)[0];
            return { type: innerType, content: wrapped[innerType], message: wrapped };
        },
        /**
         * Downloads whatever media is in a message (image/video/audio/sticker/
         * document), automatically unwrapping view-once first if needed.
         * Returns { buffer, type } or null if there's no media to download.
         */
        async downloadAnyMedia(message) {
            let target = message;
            const unwrapped = (message?.viewOnceMessage?.message)
                || (message?.viewOnceMessageV2?.message)
                || (message?.viewOnceMessageV2Extension?.message);
            if (unwrapped) {
                target = unwrapped;
            }
            const mediaTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage', 'documentWithCaptionMessage'];
            const foundType = mediaTypes.find((t) => target?.[t]);
            if (!foundType) {
                return null;
            }
            const { downloadMediaMessage } = require('./messages');
            const buffer = await downloadMediaMessage({ message: target }, 'buffer', {});
            return { buffer, type: foundType };
        },
        /**
         * Starts auto-tracking votes for a poll you just sent, so you don't have
         * to manually call getAggregateVotesInPollMessage yourself every time.
         * `pollMsg` is the message object returned by sendMessage() for a poll.
         * Returns a live snapshot getter; call .stop() to stop tracking it.
         */
        trackPoll(pollMsg) {
            var _a, _b, _c;
            const pollMsgId = pollMsg?.key?.id;
            if (!pollMsgId) {
                throw new Error('trackPoll: pollMsg.key.id is missing');
            }
            const pollCreation = (_c = (_b = (_a = pollMsg.message) === null || _a === void 0 ? void 0 : _a.pollCreationMessage) !== null && _b !== void 0 ? _b : pollMsg.message?.pollCreationMessageV3) !== null && _c !== void 0 ? _c : pollMsg.message?.pollCreationMessageV2;
            const options = (pollCreation?.options || []).map((o) => o.optionName);
            const state = { question: pollCreation?.name || '', options, voters: new Map() };
            pollTallies.set(pollMsgId, state);
            const onUpdate = (updates) => {
                for (const { key, update } of updates) {
                    const pollUpdates = update?.pollUpdates;
                    if (!pollUpdates || key?.id !== pollMsgId) {
                        continue;
                    }
                    try {
                        const { getAggregateVotesInPollMessage } = require('./messages');
                        const tally = getAggregateVotesInPollMessage({ message: pollMsg.message, pollUpdates }, conn.authState?.creds?.me?.id);
                        state.lastTally = tally;
                    }
                    catch (err) {
                        logger.error({ err }, 'trackPoll: failed to aggregate votes');
                    }
                }
            };
            conn.ev.on('messages.update', onUpdate);
            return {
                getResults: () => state.lastTally || options.map((name) => ({ name, voters: [] })),
                stop: () => {
                    conn.ev.off('messages.update', onUpdate);
                    pollTallies.delete(pollMsgId);
                }
            };
        },
        /**
         * One-stop JID inspector: decodes a jid and tells you exactly what
         * kind of address it is, without having to juggle isJidGroup/isLidUser/
         * isJidUser/jidDecode yourself every time.
         */
        resolveJid(jid) {
            var _a;
            const { isJidUser, isLidUser, isJidGroup, isJidBroadcast, isJidStatusBroadcast, isJidNewsLetter, isHostedPnUser, isHostedLidUser, jidDecode: decode } = require('../WABinary');
            const decoded = decode(jid);
            let kind = 'unknown';
            if (isJidStatusBroadcast(jid)) {
                kind = 'status';
            }
            else if (isJidNewsLetter(jid)) {
                kind = 'newsletter';
            }
            else if (isJidGroup(jid)) {
                kind = 'group';
            }
            else if (isJidBroadcast(jid)) {
                kind = 'broadcast';
            }
            else if (isHostedLidUser(jid)) {
                kind = 'hosted-lid';
            }
            else if (isLidUser(jid)) {
                kind = 'lid';
            }
            else if (isHostedPnUser(jid)) {
                kind = 'hosted-pn';
            }
            else if (isJidUser(jid)) {
                kind = 'pn';
            }
            return {
                jid,
                kind,
                user: (_a = decoded === null || decoded === void 0 ? void 0 : decoded.user) !== null && _a !== void 0 ? _a : null,
                device: (decoded === null || decoded === void 0 ? void 0 : decoded.device) !== undefined ? decoded.device : null,
                server: (decoded === null || decoded === void 0 ? void 0 : decoded.server) || null,
                isLid: kind === 'lid' || kind === 'hosted-lid',
                isPn: kind === 'pn' || kind === 'hosted-pn'
            };
        },
        /**
         * Returns a one-shot snapshot of the connection's health - useful for a
         * `.status` style command without having to manually gather state from
         * five different places.
         */
        healthCheck() {
            var _a, _b, _c, _d, _e, _f;
            const wsState = (_b = (_a = conn.ws) === null || _a === void 0 ? void 0 : _a.socket) === null || _b === void 0 ? void 0 : _b.readyState;
            const wsStateNames = { 0: 'CONNECTING', 1: 'OPEN', 2: 'CLOSING', 3: 'CLOSED' };
            return {
                uptimeMs: Date.now() - startedAt,
                wsState: wsStateNames[wsState] || 'UNKNOWN',
                isOnline: wsState === 1,
                me: ((_c = conn.authState) === null || _c === void 0 ? void 0 : _c.creds.me) || null,
                lidMappingCacheSize: (_f = (_e = (_d = conn.signalRepository) === null || _d === void 0 ? void 0 : _d.lidMapping) === null || _e === void 0 ? void 0 : _e.mappingCache) === null || _f === void 0 ? void 0 : _f.size,
                dedupTracked: seenMessageIds.size,
                rateLimitBucketsTracked: rateLimitBuckets.size
            };
        },
        /**
         * Like `conn.ev.on`, but the handler is isolated: a throw or rejection
         * is caught & logged instead of bubbling up, and an optional timeout
         * guards against a handler that hangs forever (e.g. a stuck network
         * call inside a plugin) from quietly blocking that listener's "lane".
         *
         * @param event   event name, e.g. 'messages.upsert'
         * @param handler (data) => any | Promise<any>
         * @param opts.timeoutMs  if set, logs a warning if the handler doesn't
         *                        settle within this time (does NOT kill it -
         *                        JS can't cancel a running sync/async function -
         *                        it's a "hey this looks stuck" signal only)
         */
        onSafe(event, handler, opts = {}) {
            const { timeoutMs } = opts;
            const wrapped = (data) => {
                let timeoutHandle;
                try {
                    const result = handler(data);
                    if (result && typeof result.then === 'function') {
                        if (timeoutMs) {
                            timeoutHandle = setTimeout(() => {
                                logger.warn({ event, timeoutMs }, 'onSafe handler is taking unusually long (still running)');
                            }, timeoutMs);
                        }
                        result
                            .catch((err) => {
                            logger.error({ err, event }, 'onSafe: unhandled async error, ignored');
                        })
                            .finally(() => {
                            if (timeoutHandle) {
                                clearTimeout(timeoutHandle);
                            }
                        });
                    }
                }
                catch (err) {
                    logger.error({ err, event }, 'onSafe: error, ignored');
                }
            };
            conn.ev.on(event, wrapped);
            return () => conn.ev.off(event, wrapped);
        },
        /**
         * Returns true if this message id has already been seen recently
         * (within DEDUP_TTL_MS). Marks it as seen either way. Use at the top
         * of your messages.upsert handler to skip WA's occasional duplicate
         * delivery (reconnect races etc.) without writing your own cache.
         */
        isDuplicateMessage(messageId) {
            if (!messageId) {
                return false;
            }
            const seen = seenMessageIds.has(messageId);
            seenMessageIds.set(messageId, Date.now());
            dedupCounter += 1;
            if (dedupCounter % dedupCleanupEvery === 0) {
                cleanupDedup();
            }
            return seen;
        },
        /**
         * Simple per-(jid, key) cooldown helper. Returns true if the action
         * is currently rate-limited (i.e. you should NOT proceed), false if
         * it's OK to go ahead (and marks the timestamp).
         *   if (conn.isRateLimited(m.chat, 'menu', 5000)) return;
         */
        isRateLimited(jid, key, windowMs) {
            const bucketKey = `${jid}:${key}`;
            const now = Date.now();
            const last = rateLimitBuckets.get(bucketKey);
            if (last && now - last < windowMs) {
                return true;
            }
            rateLimitBuckets.set(bucketKey, now);
            return false;
        },
        /**
         * Asks an Anthropic model to help debug an error / snippet against
         * THIS fork's actual Baileys source, so suggestions are grounded in
         * what's really in your codebase instead of generic upstream advice.
         * Wire this up to whatever command prefix you like in your own bot
         * dispatcher (e.g. `.aimahiru`) - this function only does the actual
         * call + prompt shaping, not command parsing.
         */
    };
};
exports.makeBotToolkit = makeBotToolkit;
