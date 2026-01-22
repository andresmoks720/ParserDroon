const fs = require('fs');

const HISTORIC_FILE = 'y:/Vasikas/dr1/drooniradar.ee/stream/historic.txt';
const TARGET_LAT = 59.45;
const TARGET_LNG = 24.723;
const THRESHOLD = 0.01;

function findMavicByCoords() {
    console.log(`Searching for coordinates near ${TARGET_LAT}, ${TARGET_LNG} in ${HISTORIC_FILE}...`);
    const content = fs.readFileSync(HISTORIC_FILE, 'utf8');
    const lines = content.split('\n');

    // Line 3 contains the bulk JSON data
    const jsonData = JSON.parse(lines[2]);
    console.log(`Parsed ${jsonData.length} packets.`);

    const foundAids = new Set();

    for (const packet of jsonData) {
        if (packet.dc) {
            const dLat = Math.abs(packet.dc.lat - TARGET_LAT);
            const dLng = Math.abs(packet.dc.lng - TARGET_LNG);
            if (dLat < THRESHOLD && dLng < THRESHOLD) {
                console.log(`Found matching packet: ${JSON.stringify(packet)}`);
                foundAids.add(packet.aid);
            }
        }
    }

    if (foundAids.size > 0) {
        console.log(`Found AIDs near target: ${Array.from(foundAids).join(', ')}`);
    } else {
        console.log("No packets found near the target coordinates.");
    }
}

findMavicByCoords();
