const fs = require('fs');
const path = require('path');

const HISTORIC_FILE = 'y:/Vasikas/dr1/drooniradar.ee/stream/historic.txt';
const OUTPUT_FILE = 'y:/Vasikas/dr1/drooniradar.ee/stream/mavic_stream.json';
const TARGET_SERIAL = '1581F6Z9C239E0037R9Q';

async function extractMavicStream() {
    console.log(`Reading ${HISTORIC_FILE}...`);
    const content = fs.readFileSync(HISTORIC_FILE, 'utf8');
    const lines = content.split('\n');

    // Line 3 contains the bulk JSON data
    const jsonData = JSON.parse(lines[2]);
    console.log(`Parsed ${jsonData.length} packets from line 3.`);

    // 1. Find the aid associated with the Mavic
    // We look for messages or classifications that link the serial to an aid.
    let mavicAid = null;

    // Scan for any notification or metadata that mentions the serial
    for (const packet of jsonData) {
        if (packet.m && packet.m.includes(TARGET_SERIAL)) {
            console.log(`Found mention of serial in message: ${packet.m}`);
            // Often alerts don't have the aid directly, or they have a different structure.
            // Let's see if this packet has an aid.
            if (packet.aid) {
                mavicAid = packet.aid;
                console.log(`Found Mavic AID from message: ${mavicAid}`);
                break;
            }
        }
    }

    // If still not found, check if any packet has 'l' (label) set to Mavic or similar
    if (!mavicAid) {
        for (const packet of jsonData) {
            if (packet.l && packet.l.toLowerCase().includes('mavic')) {
                mavicAid = packet.aid;
                console.log(`Found Mavic AID from label: ${mavicAid}`);
                break;
            }
            if (packet.l && packet.l.toLowerCase().includes('mini 4 pro')) {
                mavicAid = packet.aid;
                console.log(`Found Mavic AID from label: ${mavicAid}`);
                break;
            }
        }
    }

    // If we can't find it by label/message, we might need to look for specific flight characteristics
    // or known AIDs from classification.json.
    // aid 97/147/175/etc from classification.json are numeric, but historic.txt has hex/string aids.
    // Let's check for AID '461f67' or similar (common prefix in the file).

    if (!mavicAid) {
        console.log("Could not find Mavic aid automatically. Searching for any 'Drone' packets...");
        for (const packet of jsonData) {
            if (packet.l && packet.l.includes('Drone')) {
                console.log(`Potential drone packet: ${JSON.stringify(packet)}`);
                // If there's only one drone flight, we'll take it.
            }
        }
    }

    if (!mavicAid) {
        // Fallback: search for aircraft with low altitude and high frequency
        const aidFreq = {};
        jsonData.forEach(p => {
            if (p.aid) {
                aidFreq[p.aid] = (aidFreq[p.aid] || 0) + 1;
            }
        });

        // Find aid with lowest average height
        const aidHeights = {};
        jsonData.forEach(p => {
            if (p.aid && p.h !== undefined) {
                if (!aidHeights[p.aid]) aidHeights[p.aid] = [];
                aidHeights[p.aid].push(p.h);
            }
        });

        for (const aid in aidHeights) {
            const avg = aidHeights[aid].reduce((a, b) => a + b, 0) / aidHeights[aid].length;
            if (avg < 500) { // Meters? Or feet? 500 is low for planes.
                console.log(`Potential drone aid (low altitude): ${aid} (avg height: ${avg})`);
                mavicAid = aid;
                // break; // Let's keep looking or just take the first one for now
            }
        }
    }

    if (mavicAid) {
        console.log(`Extracting stream for AID: ${mavicAid}`);
        const stream = jsonData.filter(p => p.aid === mavicAid);

        // Sort by timestamp
        stream.sort((a, b) => a.ts - b.ts);

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(stream, null, 2));
        console.log(`Successfully wrote ${stream.length} packets to ${OUTPUT_FILE}`);
    } else {
        console.log("Mavic AID not identified.");
    }
}

extractMavicStream().catch(console.error);
