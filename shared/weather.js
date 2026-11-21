'use strict';
/**
 * weather.js - the Ankara weather line in the showpiece themes (Aurum, Apex, Eclipse).
 *
 * The car's own signals have no forecast, only the outside temperature (hud.js {{ambient}}). This asks
 * Open-Meteo (open-meteo.com, no key, no account) for the current weather in Ankara every 15 minutes,
 * keeps the last answer in <data>/weather.json, and gives hud.js the temperature, the day's high / low
 * and a condition code for the weather icon. No personal data is sent, only the fixed Ankara coordinates.
 *
 * It is off when the "weather" setting is off, and it fails quietly: no internet (or a blocked request)
 * leaves the last cached answer, and a theme with no answer simply draws no weather line. The demo drive
 * uses a fixed Ankara answer (hud.js DEMO_WEATHER) so the previews do not depend on the network.
 *
 * Plain Node 8 (the car's 8.16.2): no optional chaining, no ??, no fetch.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const DEFAULTS = {
    city: 'Ankara',
    lat: 39.9334,
    lon: 32.8597,
    everyMs: 15 * 60 * 1000,
    timeoutMs: 12000,
    staleMs: 6 * 60 * 60 * 1000,
};
const isNum = (v) => typeof v === 'number' && isFinite(v);

/** WMO weather code -> the icon names in icons.js (day / night for the clear skies). */
function iconOf(code, day) {
    if (code === 0) return day ? 'sun' : 'moon';
    if (code === 1 || code === 2) return 'partly';
    if (code === 3) return 'cloud';
    if (code === 45 || code === 48) return 'fog';
    if (code >= 51 && code <= 67) return 'rain';
    if (code >= 71 && code <= 77) return 'snow';
    if (code >= 80 && code <= 82) return 'rain';
    if (code >= 85 && code <= 86) return 'snow';
    if (code >= 95) return 'storm';
    return 'cloud';
}

/** A short English condition, for a layout that wants words as well as the icon. */
function textOf(code) {
    if (code === 0) return 'CLEAR';
    if (code === 1) return 'MAINLY CLEAR';
    if (code === 2) return 'PARTLY CLOUDY';
    if (code === 3) return 'OVERCAST';
    if (code === 45 || code === 48) return 'FOG';
    if (code >= 51 && code <= 57) return 'DRIZZLE';
    if (code >= 61 && code <= 67) return 'RAIN';
    if (code >= 71 && code <= 77) return 'SNOW';
    if (code >= 80 && code <= 82) return 'SHOWERS';
    if (code >= 85 && code <= 86) return 'SNOW SHOWERS';
    if (code >= 95) return 'THUNDER';
    return '';
}

class Weather {
    /**
     * opts: { city, lat, lon, everyMs, dataDir }; the log and onChange() are the Hud's.
     * onChange() is called when there is a new answer (or the cached one is loaded).
     */
    constructor(opts, log, onChange) {
        opts = opts || {};
        this.city = String(opts.city || DEFAULTS.city);
        this.lat = isNum(opts.lat) ? opts.lat : DEFAULTS.lat;
        this.lon = isNum(opts.lon) ? opts.lon : DEFAULTS.lon;
        this.everyMs = isNum(opts.everyMs) && opts.everyMs >= 60000 ? opts.everyMs : DEFAULTS.everyMs;
        this.timeoutMs = isNum(opts.timeoutMs) && opts.timeoutMs > 0 ? opts.timeoutMs : DEFAULTS.timeoutMs;
        this.staleMs = isNum(opts.staleMs) && opts.staleMs > 0 ? opts.staleMs : DEFAULTS.staleMs;
        this.cachePath = opts.dataDir ? path.join(opts.dataDir, 'weather.json') : null;
        this.log = log || { warn: function () {} };
        this.onChange = onChange || function () {};
        this.data = null;
        this.wanted = false;
        this.started = false;
        this.fetching = false;
        this.timer = null;
        this.warned = false;
        this._load();
    }

    /** The last answer, { city, temp, feels, high, low, code, isDay, icon, text, at }, or null. Too old: null. */
    state() {
        if (!this.data) return null;
        if (isNum(this.data.at) && Date.now() - this.data.at > this.staleMs) return null;
        return this.data;
    }

    start() {
        this.started = true;
        if (this.wanted) this._schedule(0);
    }

    stop() {
        this.started = false;
        if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    }

    /** The "weather" setting: on starts the refresh (and asks now), off stops it. Cached data stays. */
    want(on) {
        on = on === true;
        if (on === this.wanted) return;
        this.wanted = on;
        if (on) {
            if (this.started) this._schedule(0);
        } else if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    _load() {
        if (!this.cachePath) return;
        let c;
        try { c = JSON.parse(fs.readFileSync(this.cachePath, 'utf8')); } catch (e) { return; }
        if (!c || !isNum(c.temp)) return;
        // a cache from another city or an older layout: don't show it
        if (c.city && c.city !== this.city) return;
        this._set(c);
    }

    _set(d) {
        d.city = this.city;
        d.at = isNum(d.at) ? d.at : Date.now();
        d.icon = d.icon || iconOf(isNum(d.code) ? d.code : 3, d.isDay !== false);
        d.text = d.text || textOf(isNum(d.code) ? d.code : 3);
        this.data = d;
        try { fs.writeFileSync(this.cachePath, JSON.stringify(d)); } catch (e) { /* data dir not writable (host preview) */ }
        this.onChange();
    }

    _schedule(ms) {
        if (this.timer) { clearTimeout(this.timer); this.timer = null; }
        if (!this.started || !this.wanted) return;
        this.timer = setTimeout(() => { this.timer = null; this._fetch(); }, ms);
        if (this.timer.unref) this.timer.unref();
    }

    _fetch() {
        if (!this.started || !this.wanted || this.fetching) return;
        this.fetching = true;
        const query = '/v1/forecast?latitude=' + this.lat + '&longitude=' + this.lon +
            '&current=temperature_2m,apparent_temperature,is_day,weather_code' +
            '&daily=temperature_2m_max,temperature_2m_min' +
            '&timezone=auto&forecast_days=1';
        let done = false;
        const finish = (err, data) => {
            if (done) return;
            done = true;
            this.fetching = false;
            if (err) {
                if (!this.warned) {
                    this.warned = true;
                    this.log.warn('weather: ' + (err && err.message || err) + ' (keeping the last answer)');
                }
            } else {
                this.warned = false;
                this._set(data);
            }
            this._schedule(this.everyMs);
        };
        let req;
        try {
            req = https.get({
                hostname: 'api.open-meteo.com',
                path: query,
                headers: { 'User-Agent': 'ClusterThemes/0.30', 'Accept': 'application/json' },
            }, (res) => {
                let body = '';
                res.setEncoding('utf8');
                res.on('data', (s) => {
                    body += s;
                    if (body.length > 200000) { try { req.abort(); } catch (e) { /* already gone */ } finish(new Error('answer too large')); }
                });
                res.on('end', () => {
                    if (res.statusCode !== 200) { finish(new Error('HTTP ' + res.statusCode)); return; }
                    let j;
                    try { j = JSON.parse(body); } catch (e) { finish(e); return; }
                    const cur = j && j.current || {}, day = j && j.daily || {};
                    const temp = cur.temperature_2m;
                    if (!isNum(temp)) { finish(new Error('no temperature in the answer')); return; }
                    const high = day.temperature_2m_max && day.temperature_2m_max[0];
                    const low = day.temperature_2m_min && day.temperature_2m_min[0];
                    const code = isNum(cur.weather_code) ? cur.weather_code : 3;
                    const isDay = cur.is_day !== 0;
                    finish(null, {
                        temp: temp,
                        feels: isNum(cur.apparent_temperature) ? cur.apparent_temperature : null,
                        high: isNum(high) ? high : null,
                        low: isNum(low) ? low : null,
                        code: code,
                        isDay: isDay,
                        icon: iconOf(code, isDay),
                        text: textOf(code),
                        at: Date.now(),
                    });
                });
            });
            req.setTimeout(this.timeoutMs, () => { try { req.abort(); } catch (e) { /* already gone */ } finish(new Error('timeout')); });
            req.on('error', finish);
            req.on('socket', (s) => { if (s.unref) s.unref(); });   // the fetch must not keep a test or a stopped app alive
            if (req.unref) req.unref();
        } catch (e) {
            finish(e);
        }
    }
}

module.exports = Weather;
module.exports.iconOf = iconOf;
module.exports.textOf = textOf;
module.exports.DEFAULTS = DEFAULTS;
