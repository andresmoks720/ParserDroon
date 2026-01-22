
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { AirZone, prepareAirZones } = require('../parser/uasParser');

const BASE_URL = 'https://drooniradar.ee';
const GEOJSON_URLS = [
    'https://utm.eans.ee/avm/utm/uas.geojson',
    'https://utm.ans.lt/avm/utm/uas.geojson'
];

async function fetchWithPuppeteer(url, isJson = true) {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();

        // Set a realistic user agent to bypass headless detection
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Hide puppeteer's presence
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
        });

        await page.goto(BASE_URL, { waitUntil: 'networkidle0' });

        const result = await page.evaluate(async (targetUrl, json) => {
            const response = await fetch(targetUrl);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return json ? await response.json() : await response.text();
        }, url, isJson);

        return result;
    } catch (error) {
        console.error(`Error fetching ${url}:`, error.message);
        return null;
    } finally {
        if (browser) await browser.close();
    }
}

async function getAirZones() {
    console.log('Fetching Air Zones...');
    const zones = [];
    for (const url of GEOJSON_URLS) {
        const data = await fetchWithPuppeteer(url);
        if (data && data.features) {
            const prepared = prepareAirZones(data);
            prepared.features.forEach(f => zones.push(new AirZone(f)));
        }
    }
    console.log(`Loaded ${zones.length} air zones.`);
    return zones;
}

async function analyzeBatch(startTimestamp, duration, zones) {
    const url = `${BASE_URL}/api/v1/history/batch?s=${startTimestamp}&d=${duration}`;
    console.log(`Fetching historical data: ${url}`);
    const positions = await fetchWithPuppeteer(url);

    if (!positions || !Array.isArray(positions)) {
        console.log('No historical data found or error fetching.');
        return;
    }

    return processPositions(positions, zones);
}

async function main() {
    const args = process.argv.slice(2);
    if (args.length < 1) {
        console.log('Usage:');
        console.log('  node scripts/violation_analyzer.js --batch START_TIMESTAMP DURATION');
        console.log('  node scripts/violation_analyzer.js --mock');
        return;
    }

    let zones = await getAirZones();

    if (args[0] === '--mock') {
        processMock(zones);
        return;
    }

    if (args[0] === '--batch') {
        const start = args[1];
        const duration = args[2] || 10;
        const violations = await analyzeBatch(start, duration, zones);

        displayViolations(violations);
    }

    if (args[0] === '--local') {
        const filePath = args[1] || 'scripts/test_data.json';
        console.log(`Analyzing local data: ${filePath}`);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const violations = processPositions(data, zones);
        displayViolations(violations);
    }
}

function processPositions(positions, zones) {
    console.log(`Analyzing ${positions.length} positions...`);
    const violations = [];

    positions.forEach(pos => {
        const aircraftPos = {
            lat: pos.dc.lat,
            lng: pos.dc.lng,
            alt: pos.h,
            timestamp: pos.ts,
            aircraftId: pos.aid
        };

        zones.forEach(zone => {
            const violation = zone.checkViolation(aircraftPos);
            if (violation) {
                violations.push({
                    ...violation,
                    aircraftId: aircraftPos.aircraftId,
                    timestamp: new Date(aircraftPos.timestamp).toISOString(),
                    lat: aircraftPos.lat,
                    lng: aircraftPos.lng,
                    alt: aircraftPos.alt
                });
            }
        });
    });

    return violations;
}

function displayViolations(violations) {
    if (violations && violations.length > 0) {
        console.log('\n--- DETECTED VIOLATIONS ---');
        console.table(violations);
    } else {
        console.log('\nNo violations detected.');
    }
}

function processMock(zones) {
    console.log('Running mock analysis...');
    // Create a mock flight path through a known restricted area if possible, 
    // or just pick the first zone and fly through it.
    const targetZone = zones.find(z => z.restriction === 'PROHIBITED') || zones[0];
    if (!targetZone) {
        console.log('No zones available for mock test.');
        return;
    }

    console.log(`Mocking flight through: ${targetZone.name} (${targetZone.identifier})`);

    // Get center of the zone (simple approximation: average of first few points)
    const geom = targetZone.feature.geometry;
    console.log(`Target Zone: ${targetZone.name}, ID: ${targetZone.identifier}`);
    console.log(`Geometry Type: ${geom.type}`);

    if (!geom.coordinates || !Array.isArray(geom.coordinates)) {
        console.log('No coordinates found in geometry.');
        return;
    }

    let ring;
    try {
        if (geom.type === 'Polygon') {
            ring = geom.coordinates[0];
        } else if (geom.type === 'MultiPolygon') {
            ring = geom.coordinates[0][0];
        }
    } catch (e) {
        console.log('Error extracting ring:', e.message);
        return;
    }

    if (!ring || !Array.isArray(ring) || ring.length < 3) {
        console.log('Zone geometry ring is invalid or too short.');
        console.log('Ring structure preview:', JSON.stringify(ring).substring(0, 100));
        return;
    }

    // Average first 3 points to get a point that is likely deep inside
    let mockPoint;
    try {
        const p0 = ring[0], p1 = ring[1], p2 = ring[2];
        mockPoint = {
            lat: (p0[1] + p1[1] + p2[1]) / 3,
            lng: (p0[0] + p1[0] + p2[0]) / 3,
            alt: 100,
            timestamp: Date.now(),
            aircraftId: 'MOCK-DRONE'
        };
    } catch (e) {
        console.log('Error calculating mock point:', e.message);
        return;
    }

    const violation = targetZone.checkViolation(mockPoint);
    console.log(`Testing point: ${JSON.stringify(mockPoint)}`);
    console.log(`Zone properties: ${JSON.stringify(targetZone.feature.properties)}`);
    console.log(`Zone geometry type: ${targetZone.feature.geometry.type}`);

    if (violation) {
        console.log('Mock violation detected successfully!');
        console.log(JSON.stringify(violation, null, 2));
    } else {
        console.log('Mock flight did not trigger violation.');
    }
}

// Internal version of isPointInFeature for debugging
function zoneInsideFeature(point, feature) {
    const { type, coordinates } = feature.geometry;
    if (type === 'Polygon') {
        const xi = coordinates[0][0][0], yi = coordinates[0][0][1];
        console.log(`First point of ring: [${xi}, ${yi}]`);
    }
    return false; // placeholder for debug
}

main().catch(console.error);
