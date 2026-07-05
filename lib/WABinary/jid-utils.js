"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.jidNormalizedUser = exports.isJidNewsLetter = exports.isJidStatusBroadcast = exports.isJidGroup = exports.isJidBroadcast = exports.isLidUser = exports.isJidUser = exports.areJidsSameUser = exports.jidDecode = exports.jidEncode = exports.STORIES_JID = exports.PSA_WID = exports.SERVER_JID = exports.OFFICIAL_BIZ_JID = exports.S_WHATSAPP_NET = void 0;
exports.isPnUser = exports.isHostedPnUser = exports.isHostedLidUser = exports.WAJIDDomains = exports.getServerFromDomainType = exports.transferDevice = exports.isJidBot = void 0;
/** matches WA's official bot phone-number patterns (used to gate TC token issuance away from bots) */
const botRegexp = /^1313555\d{4}$|^131655500\d{2}$/;
const isJidBot = (jid) => !!(jid && botRegexp.test(jid.split('@')[0]) && jid.endsWith('@c.us'));
exports.isJidBot = isJidBot;
exports.S_WHATSAPP_NET = '@s.whatsapp.net';
exports.OFFICIAL_BIZ_JID = '16505361212@c.us';
exports.SERVER_JID = 'server@c.us';
exports.PSA_WID = '0@c.us';
exports.STORIES_JID = 'status@broadcast';
/** numeric domain-type codes used by newer WA clients for lid/hosted accounts */
const WAJIDDomains = { WHATSAPP: 0, LID: 1, HOSTED: 128, HOSTED_LID: 129 };
exports.WAJIDDomains = WAJIDDomains;
const getServerFromDomainType = (initialServer, domainType) => {
    switch (domainType) {
        case WAJIDDomains.LID:
            return 'lid';
        case WAJIDDomains.HOSTED:
            return 'hosted';
        case WAJIDDomains.HOSTED_LID:
            return 'hosted.lid';
        case WAJIDDomains.WHATSAPP:
        default:
            return initialServer;
    }
};
exports.getServerFromDomainType = getServerFromDomainType;
const jidEncode = (user, server, device, agent) => {
    return `${user || ''}${!!agent ? `_${agent}` : ''}${!!device ? `:${device}` : ''}@${server}`;
};
exports.jidEncode = jidEncode;
const jidDecode = (jid) => {
    const sepIdx = typeof jid === 'string' ? jid.indexOf('@') : -1;
    if (sepIdx < 0) {
        return undefined;
    }
    const server = jid.slice(sepIdx + 1);
    const userCombined = jid.slice(0, sepIdx);
    const [userAgent, device] = userCombined.split(':');
    const user = userAgent.split('_')[0];
    let domainType = WAJIDDomains.WHATSAPP;
    if (server === 'lid') {
        domainType = WAJIDDomains.LID;
    } else if (server === 'hosted') {
        domainType = WAJIDDomains.HOSTED;
    } else if (server === 'hosted.lid') {
        domainType = WAJIDDomains.HOSTED_LID;
    }
    return {
        server,
        user,
        domainType,
        device: device ? +device : undefined
    };
};
exports.jidDecode = jidDecode;
/** transfers the device id from one jid onto another (used during lid<->pn swaps) */
const transferDevice = (fromJid, toJid) => {
    const fromDecoded = jidDecode(fromJid);
    const deviceId = (fromDecoded && fromDecoded.device) || 0;
    const toDecoded = jidDecode(toJid);
    return jidEncode(toDecoded.user, toDecoded.server, deviceId);
};
exports.transferDevice = transferDevice;
/** is the jid a user */
const areJidsSameUser = (jid1, jid2) => {
    var _a, _b;
    return (((_a = (0, exports.jidDecode)(jid1)) === null || _a === void 0 ? void 0 : _a.user) === ((_b = (0, exports.jidDecode)(jid2)) === null || _b === void 0 ? void 0 : _b.user));
};
exports.areJidsSameUser = areJidsSameUser;
/** is the jid a user */
const isJidUser = (jid) => (jid === null || jid === void 0 ? void 0 : jid.endsWith('@s.whatsapp.net'));
exports.isJidUser = isJidUser;
/** is the jid a group */
const isLidUser = (jid) => (jid === null || jid === void 0 ? void 0 : jid.endsWith('@lid'));
exports.isLidUser = isLidUser;
/** is the jid a regular phone-number user (alias of isJidUser, used by lid-mapping) */
const isPnUser = (jid) => (jid === null || jid === void 0 ? void 0 : jid.endsWith('@s.whatsapp.net'));
exports.isPnUser = isPnUser;
/** is the jid a "hosted" phone-number account */
const isHostedPnUser = (jid) => (jid === null || jid === void 0 ? void 0 : jid.endsWith('@hosted'));
exports.isHostedPnUser = isHostedPnUser;
/** is the jid a "hosted" lid account */
const isHostedLidUser = (jid) => (jid === null || jid === void 0 ? void 0 : jid.endsWith('@hosted.lid'));
exports.isHostedLidUser = isHostedLidUser;
/** is the jid a broadcast */
const isJidBroadcast = (jid) => (jid === null || jid === void 0 ? void 0 : jid.endsWith('@broadcast'));
exports.isJidBroadcast = isJidBroadcast;
/** is the jid a group */
const isJidGroup = (jid) => (jid === null || jid === void 0 ? void 0 : jid.endsWith('@g.us'));
exports.isJidGroup = isJidGroup;
/** is the jid the status broadcast */
const isJidStatusBroadcast = (jid) => jid === 'status@broadcast';
exports.isJidStatusBroadcast = isJidStatusBroadcast;
/** is the jid the newsletter */
const isJidNewsLetter = (jid) => (jid === null || jid === void 0 ? void 0 : jid.endsWith('newsletter'));
exports.isJidNewsLetter = isJidNewsLetter;
/**
 * SPECULATIVE - WA Username / BSUID support (rollout mulai Jul 2026, blm masuk ID, blm ada di protokol MD resmi).
 * BSUID format yg kekonfirm sejauh ini (Cloud API): "US.13491208655302741918" -> kode negara + "." + digit panjang.
 * Belum jelas apakah MD protocol bakal pake domain baru (mis. "@username"/"@bsuid") atau tetap "@s.whatsapp.net"
 * dgn field tambahan. Ini cuma placeholder detector, JANGAN dipake buat encode/kirim sampe ada konfirmasi real traffic.
 */
const bsuidRegexp = /^[A-Z]{2}\.\d{6,}$/;
/** cek apakah string berbentuk BSUID (country-code prefixed id), bukan jid biasa */
const isBsuid = (id) => !!(id && bsuidRegexp.test(id.split('@')[0]));
exports.isBsuid = isBsuid;
/** cek apakah jid pake domain "username" (tebakan, blm ada konfirmasi format resmi dari WA MD protocol) */
const isUsernameJid = (jid) => (jid === null || jid === void 0 ? void 0 : jid.endsWith('@username'));
exports.isUsernameJid = isUsernameJid;
const jidNormalizedUser = (jid) => {
    const result = (0, exports.jidDecode)(jid);
    if (!result) {
        return '';
    }
    const { user, server } = result;
    return (0, exports.jidEncode)(user, server === 'c.us' ? 's.whatsapp.net' : server);
};
exports.jidNormalizedUser = jidNormalizedUser;
