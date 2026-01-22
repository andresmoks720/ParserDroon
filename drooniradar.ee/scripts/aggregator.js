const fs = require('fs');
const path = require('path');
const { prepareAirZones, transformFeature } = require('../parser/uasParser');

// Configuration
const SOURCES = [
    'https://utm.eans.ee/avm/utm/uas.geojson'
];
const OUTPUT_FILE = path.resolve(__dirname, '../public/data/airspace-latest.json');

// Mock fetch for Node environment if not available (Node 18+ has fetch)
if (!global.fetch) {
    global.fetch = require('node-fetch');
}

/**
 * Fetches data from a URL
 */
async function fetchData(url) {
    console.log(`Fetching ${url}...`);
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Status ${response.status}`);
        return await response.json();
    } catch (e) {
        console.error(`Error fetching ${url}:`, e.message);
        return null;
    }
}

/**
 * Main Aggregator Function
 */
async function run() {
    console.log('--- Airspace Aggregator Started ---');
    const allFeatures = [];
    let fetchCount = 0;

    for (const url of SOURCES) {
        const data = await fetchData(url);
        if (data) {
            // Use existing parser logic to filter unwanted zones
            const prepared = prepareAirZones(data);

            // Transform each feature to schema
            prepared.features.forEach(f => {
                try {
                    const schemaFeature = transformFeature(f);
                    allFeatures.push(schemaFeature);
                } catch (err) {
                    console.warn(`Failed to transform feature ${f?.properties?.identifier}:`, err.message);
                }
            });
            fetchCount++;
        }
    }

    const output = {
        type: "FeatureCollection",
        generatedAt: new Date().toISOString(),
        metadata: {
            eaipVersion: "unknown",
            notamFetchTime: new Date().toISOString(),
            activeCount: allFeatures.length,
            sourcesFetched: fetchCount
        },
        features: allFeatures
    };

    // Ensure directory exists
    const dir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    // Write file
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    console.log(`\nSuccessfully wrote ${allFeatures.length} features to:`);
    console.log(OUTPUT_FILE);
    console.log('--- Aggregation Complete ---');
}

run().catch(console.error);
