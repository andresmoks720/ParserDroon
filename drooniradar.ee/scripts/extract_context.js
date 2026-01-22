
const fs = require('fs');
const path = require('path');

const filePath = path.resolve('..', '_app/immutable/nodes/4.CB2fylc3.js');
const fileContent = fs.readFileSync(filePath, 'utf8');

const searchTerms = [
    '/api/v2/history',
    '/api/v1/history',
    'socket.io',
    'Authorization',
    'Bearer',
    'api/v1/areas'
];

searchTerms.forEach(term => {
    let index = fileContent.indexOf(term);
    while (index !== -1) {
        console.log(`\n\n--- Found: "${term}" at index ${index} ---`);
        const start = Math.max(0, index - 300);
        const end = Math.min(fileContent.length, index + 300);
        console.log(fileContent.substring(start, end));

        index = fileContent.indexOf(term, index + 1);
    }
});
