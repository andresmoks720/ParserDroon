
const fs = require('fs');
const path = require('path');

const filePath = path.resolve('..', '_app/immutable/nodes/4.CB2fylc3.js');
const fileContent = fs.readFileSync(filePath, 'utf8');

const searchTerms = [
    'int:',
    'intrusion',
    'violation',
    'forbidden',
    'geofence',
    'geopiirang',
    'restricted'
];

searchTerms.forEach(term => {
    let index = fileContent.toLowerCase().indexOf(term.toLowerCase());
    let count = 0;
    while (index !== -1 && count < 3) {
        console.log(`\n\n--- Found: "${term}" at index ${index} ---`);
        const start = Math.max(0, index - 400);
        const end = Math.min(fileContent.length, index + 400);
        console.log(fileContent.substring(start, end));

        index = fileContent.toLowerCase().indexOf(term.toLowerCase(), index + 1);
        count++;
    }
});
