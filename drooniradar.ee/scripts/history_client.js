
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

/**
 * Drooniradar History Client (Puppeteer Version)
 * 
 * Uses a headless browser to fetch historic flight data, bypassing 
 * potential 403 restrictions on direct node-fetch requests.
 * 
 * Usage:
 *   node scripts/history_client.js --date YYYYMMDD
 *   node scripts/history_client.js --batch START_TIMESTAMP DURATION
 *   node scripts/history_client.js --aircraft AIRCRAFT_ID
 */

const BASE_URL = 'https://drooniradar.ee';

async function fetchWithPuppeteer(url) {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();

        // Go to home page first to initialize any session/cookies
        await page.goto(BASE_URL, { waitUntil: 'networkidle0' });

        // Perform the fetch in the browser context
        const result = await page.evaluate(async (targetUrl) => {
            const response = await fetch(targetUrl, {
                headers: {
                    'Accept': 'application/json, text/plain, */*',
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        }, url);

        return result;

    } catch (error) {
        console.error('Puppeteer fetch error:', error.message);
        return null;
    } finally {
        if (browser) await browser.close();
    }
}

async function getDailyFlights(dateString, tzOffset = 0) {
    const url = `${BASE_URL}/api/v2/history/flights?day=${dateString}&tz=${tzOffset}&signal=true&mannedAircrafts=true&radar=true`;
    return fetchWithPuppeteer(url);
}

async function getBatchData(startTimestamp, duration) {
    const url = `${BASE_URL}/api/v1/history/batch?s=${startTimestamp}&d=${duration}`;
    return fetchWithPuppeteer(url);
}

async function getAircraftHistory(aircraftId) {
    const url = `${BASE_URL}/api/v1/history/${aircraftId}/all_flights`;
    return fetchWithPuppeteer(url);
}

async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('Usage:');
        console.log('  node history_client.js --date 20231027');
        console.log('  node history_client.js --batch 1698393600 3600');
        console.log('  node history_client.js --aircraft 12345');
        return;
    }

    const command = args[0];

    if (command === '--date') {
        const date = args[1]; // YYYYMMDD
        if (!date) {
            console.error('Please provide a date in YYYYMMDD format');
            return;
        }
        const data = await getDailyFlights(date);
        console.log(JSON.stringify(data, null, 2));
    } else if (command === '--batch') {
        const start = args[1];
        const duration = args[2] || 60;
        if (!start) {
            console.error('Please provide a start timestamp');
            return;
        }
        const data = await getBatchData(start, duration);
        console.log(JSON.stringify(data, null, 2));
    } else if (command === '--aircraft') {
        const id = args[1];
        if (!id) {
            console.error('Please provide an aircraft ID');
            return;
        }
        const data = await getAircraftHistory(id);
        console.log(JSON.stringify(data, null, 2));
    } else {
        console.error('Unknown command');
    }
}

main().catch(console.error);
