"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});

const fetch = require("node-fetch");
const pkg = require("../../../package.json");

async function TikTok(url) {
    const base = pkg.profile.baseurl;

    const res = await fetch(
        `${base}/download/tiktok?url=${encodeURIComponent(url)}`
    );

    return await res.json();
}

exports.TikTok = TikTok;