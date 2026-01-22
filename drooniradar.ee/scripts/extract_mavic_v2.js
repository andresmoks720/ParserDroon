const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

/**
 * Mavic Stream Extractor v2
 * 
 * Fetches historical batch data and filters for the specific Mavic aircraft.
 * Target: DJI Mini 4 Pro (1581F6Z9C239E0037R9Q)
 * Start Timestamp: 1767522214
 */

const BASE_URL = 'https://drooniradar.ee';
const OUTPUT_FILE = path.join(__dirname, '../stream/mavic_stream.json');
const START_TS = 1767522214;
const DURATION = 10;
const MAX_BATCHES = 100; // Safety limit
const TARGET_AID = '4b6b6d'; // Identified in BATCH_STREAM_ANALYSIS.md

async function fetchBatch(page, startTime) {
    const url = `${BASE_URL}/api/v1/history/batch?s=${startTime}&d=${DURATION}`;
    console.log(`Fetching: ${url}`);

    try {
        const result = await page.evaluate(async (targetUrl) => {
            const response = await fetch(targetUrl, {
                headers: {
                    'Accept': 'application/json, text/plain, */*',
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });
            if (!response.ok) {
                if (response.status === 404) return [];
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        }, url);
        return result;
    } catch (error) {
        console.error(`Error fetching batch at ${startTime}:`, error.message);
        return null;
    }
}

async function main() {
    console.log(`Starting Mavic stream extraction for AID: ${TARGET_AID}`);

    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled'
        ]
    });

    try {
        const page = await browser.newPage();

        // Set realistic User-Agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Overwrite navigator.webdriver
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => false,
            });
        });

        // Set realistic viewport
        await page.setViewport({ width: 1920, height: 1080 });

        await page.goto(BASE_URL, { waitUntil: 'networkidle2' });

        // Wait a bit to ensure session is fully set
        await new Promise(r => setTimeout(r, 2000));

        let currentTs = START_TS;
        let allPoints = [];
        let consecutiveEmpty = 0;

        for (let i = 0; i < MAX_BATCHES; i++) {
            const batch = await fetchBatch(page, currentTs);

            if (!batch || batch.length === 0) {
                consecutiveEmpty++;
                if (consecutiveEmpty > 3) {
                    console.log("No more data found in 3 consecutive batches. Stopping.");
                    break;
                }
            } else {
                consecutiveEmpty = 0;
                const filtered = batch.filter(p => p.aid === TARGET_AID);
                console.log(`Batch ${i + 1}: Found ${filtered.length} points for ${TARGET_AID} (Total batch size: ${batch.length})`);

                if (filtered.length > 0) {
                    allPoints.push(...filtered);
                }
            }

            currentTs += DURATION;
            // Respectful delay
            await new Promise(r => setTimeout(r, 1000));
        }

        if (allPoints.length > 0) {
            // Sort by timestamp
            allPoints.sort((a, b) => a.ts - b.ts);

            // Ensure directory exists
            const dir = path.dirname(OUTPUT_FILE);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allPoints, null, 2));
            console.log(`\nSuccessfully extracted ${allPoints.length} points.`);
            console.log(`Saved to: ${OUTPUT_FILE}`);
        } else {
            console.log("\nNo points found for the target aircraft ID.");
        }

    } finally {
        await browser.close();
    }
}

main().catch(console.error);
