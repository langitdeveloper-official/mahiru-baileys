"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * token helpers.
 *
 */
const token_second = 30 * 24 * 60 * 60; 
const interval_second = 7 * 24 * 60 * 60; 
function nowSeconds() {
    return Math.floor(Date.now() / 1000);
}

function isTcTokenExpired(timestamp) {
    if (!timestamp) {
        return true;
    }
    const ts = Number(timestamp);
    if (!Number.isFinite(ts) || ts <= 0) {
        return true;
    }
    return (nowSeconds() - ts) > token_second;
}

function shouldSendNewTcToken(senderTimestamp) {
    if (!senderTimestamp) {
        return true;
    }
    const ts = Number(senderTimestamp);
    if (!Number.isFinite(ts) || ts <= 0) {
        return true;
    }
    return (nowSeconds() - ts) > interval_second;
}

async function resolveTcTokenJid(jid, getLIDForPN) {
    try {
        if (typeof getLIDForPN === 'function') {
            const lid = await getLIDForPN(jid);
            if (lid) {
                return lid;
            }
        }
    }
    catch (_a) {
    }
    return jid;
}

async function resolveIssuanceJid(jid, preferLid, getLIDForPN, getPNForLID) {
    try {
        if (preferLid && typeof getLIDForPN === 'function') {
            const lid = await getLIDForPN(jid);
            if (lid) {
                return lid;
            }
        }
        if (!preferLid && typeof getPNForLID === 'function') {
            const pn = await getPNForLID(jid);
            if (pn) {
                return pn;
            }
        }
    }
    catch (_a) {
    }
    return jid;
}

async function storeTcTokensFromIqResult({ result, fallbackJid, keys, getLIDForPN }) {
    var _a, _b, _c;
    try {
        const token = (_c = (_b = (_a = result === null || result === void 0 ? void 0 : result.content) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.content) !== null && _c !== void 0 ? _c : null;
        if (!token || !fallbackJid) {
            return {};
        }
        const jidKey = await resolveTcTokenJid(fallbackJid, getLIDForPN);
        const entry = {
            [jidKey]: {
                token: Buffer.isBuffer(token) ? token : Buffer.from(token),
                timestamp: nowSeconds(),
                senderTimestamp: nowSeconds()
            }
        };
        if (keys === null || keys === void 0 ? void 0 : keys.set) {
            await keys.set({ tctoken: entry });
        }
        return entry;
    }
    catch (_d) {
        return {};
    }
}

async function buildMergedTcTokenIndexWrite(keys, jids) {
    var _a;
    const merged = {};
    try {
        const existing = await (keys === null || keys === void 0 ? void 0 : keys.get('tctoken', jids));
        for (const jid of jids) {
            if ((_a = existing === null || existing === void 0 ? void 0 : existing[jid]) === null || _a === void 0 ? void 0 : _a.token) {
                merged[jid] = existing[jid];
            }
        }
    }
    catch (_b) {
    }
    return merged;
}
exports.isTcTokenExpired = isTcTokenExpired;
exports.shouldSendNewTcToken = shouldSendNewTcToken;
exports.resolveTcTokenJid = resolveTcTokenJid;
exports.resolveIssuanceJid = resolveIssuanceJid;
exports.storeTcTokensFromIqResult = storeTcTokensFromIqResult;
exports.buildMergedTcTokenIndexWrite = buildMergedTcTokenIndexWrite;
