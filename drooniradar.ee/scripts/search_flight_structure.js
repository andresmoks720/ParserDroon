
const fs = require('fs');
const path = require('path');

const filePath = path.resolve('..', '_app/immutable/nodes/4.CB2fylc3.js');
const fileContent = fs.readFileSync(filePath, 'utf8');

// Search for the flight summary structure and 'int' property
const patterns = [
    'sum.int',
    '.int)',
    'int:',
    '__onIncomingMessage',
    '__cleanThenNotifyIntrusions',
    'fo:e.over,start:e.s,end:e.e'
];

patterns.forEach(pattern => {
    let index = fileContent.indexOf(pattern);
    let count = 0;
    while (index !== -1 && count < 2) {
        console.log(`\n\n=== Found: "${pattern}" at ${index} ===`);
        const start = Math.max(0, index - 500);
        const end = Math.min(fileContent.length, index + 500);
        console.log(fileContent.substring(start, end));

        index = fileContent.indexOf(pattern, index + 1);
        count++;
    }
});
