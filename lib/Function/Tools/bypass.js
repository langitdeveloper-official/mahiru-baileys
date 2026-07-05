"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});

const fetch = require("node-fetch");
const pkg = require("../../../package.json");

async function BypassTurnstileMin(url, siteKey) {
    const base = pkg.profile.baseurl;

    const res = await fetch(
        `${base}/tools/turnstile-min?url=${encodeURIComponent(url)}&siteKey=${encodeURIComponent(siteKey)}`
    );

    return await res.json();
}

exports.BypassTurnstileMin = BypassTurnstileMin;