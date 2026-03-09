// st-evermind 本地代理
// 作用：把来自浏览器扩展的请求转发给 EverMind Cloud，附加 CORS 头
// 用法：node proxy.js [PORT] [API_KEY]
// 默认端口：7721

import http from 'http';
import https from 'https';

const PORT = parseInt(process.argv[2]) || 7721;
const API_KEY = process.argv[3] || process.env.EVERMIND_API_KEY || '';
const TARGET_HOST = 'api.evermind.ai';

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

http.createServer((req, res) => {

    // OPTIONS 预检请求直接放行
    if (req.method === 'OPTIONS') {
        res.writeHead(204, CORS_HEADERS);
        res.end();
        return;
    }

    // 收集请求 body
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
        const body = chunks.length ? Buffer.concat(chunks) : null;

        // 构造转发的请求头
        const headers = {
            'Content-Type': 'application/json',
            'User-Agent': 'st-evermind-proxy/1.0',
        };
        // 优先使用客户端传来的 Authorization，其次用启动时配置的 API_KEY
        const authHeader = req.headers['authorization'];
        if (authHeader) {
            headers['Authorization'] = authHeader;
        } else if (API_KEY) {
            headers['Authorization'] = `Bearer ${API_KEY}`;
        }
        if (body) headers['Content-Length'] = body.length;

        const options = {
            hostname: TARGET_HOST,
            port: 443,
            path: req.url,     // /api/v0/memories 等路径原样透传
            method: req.method,
            headers,
        };

        const proxyReq = https.request(options, proxyRes => {
            const responseChunks = [];
            proxyRes.on('data', c => responseChunks.push(c));
            proxyRes.on('end', () => {
                const responseBody = Buffer.concat(responseChunks);
                res.writeHead(proxyRes.statusCode, {
                    ...CORS_HEADERS,
                    'Content-Type': proxyRes.headers['content-type'] || 'application/json',
                });
                res.end(responseBody);
                console.log(`[evermind-proxy] ${req.method} ${req.url} → ${proxyRes.statusCode}`);
            });
        });

        proxyReq.on('error', err => {
            console.error('[evermind-proxy] Forward error:', err.message);
            res.writeHead(502, CORS_HEADERS);
            res.end(JSON.stringify({ error: err.message }));
        });

        if (body) proxyReq.write(body);
        proxyReq.end();
    });

}).listen(PORT, '127.0.0.1', () => {
    console.log(`[evermind-proxy] Running on http://127.0.0.1:${PORT}`);
    console.log(`[evermind-proxy] Forwarding to https://${TARGET_HOST}`);
    console.log(`[evermind-proxy] API Key: ${API_KEY ? '已配置' : '未配置（需在扩展设置里填写）'}`);
});
