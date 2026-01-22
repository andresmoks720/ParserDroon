
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    // Enable console logging from the page
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    console.log('Setting up request interception...');
    await page.setRequestInterception(true);

    page.on('request', request => {
        if (request.url().includes('/api/')) {
            console.log('--- API Request Detected ---');
            console.log('URL:', request.url());
            console.log('Method:', request.method());
            if (Object.keys(request.headers()).length > 0) {
                console.log('Headers:', JSON.stringify(request.headers(), null, 2));
            }
            console.log('----------------------------');
        }
        request.continue();
    });

    console.log('Navigating to drooniradar.ee...');
    await page.goto('https://drooniradar.ee', { waitUntil: 'networkidle0' });

    console.log('Page loaded.');

    // Log Cookies
    const cookies = await page.cookies();
    console.log('Cookies:', JSON.stringify(cookies, null, 2));

    // Log HTML Content (first 500 chars) to see if it's a login page or app
    const content = await page.content();
    console.log('Page Content Preview:', content.substring(0, 500));

    // Save full HTML for inspection
    const fs = require('fs');
    fs.writeFileSync('page_dump.html', content);
    console.log('Saved page_dump.html');

    // Check for global variables or tokens
    const globals = await page.evaluate(() => {
        return {
            windowKeys: Object.keys(window).filter(k => !k.startsWith('On') && !k.startsWith('on')), // filter out events for brevity
            documentCookie: document.cookie
        };
    });
    // console.log('Globals:', JSON.stringify(globals, null, 2)); // Too verbose

    console.log('Waiting for potential background requests...');
    await new Promise(r => setTimeout(r, 2000));

    // Interact to trigger history if needed (though usually it's a separate page or loaded on demand)
    // For now, let's just see if visiting the main page triggers any relevant auth headers we can reuse.
    // If we need to login or go to a specific history page, we might need to add steps here.

    // Attempt to manually trigger a fetch from the browser context
    console.log('Attempting fetch of /api/v1/areas (checking public access)...');
    await page.evaluate(async () => {
        try {
            const response = await fetch('https://drooniradar.ee/api/v1/areas');
            console.log('Areas fetch status:', response.status);
            if (response.ok) {
                const data = await response.json();
                console.log('Areas data sample:', JSON.stringify(data).substring(0, 100));
            }
        } catch (e) {
            console.error('Areas fetch failed:', e);
        }

        // Also try the history one again to see the status explicitly
        try {
            const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const response = await fetch(`https://drooniradar.ee/api/v2/history/flights?day=${date}&tz=0&signal=true&mannedAircrafts=true&radar=true`);
            console.log('History fetch status:', response.status);
        } catch (e) {
            console.error('History fetch failed:', e);
        }
    });

    // Listen for the manual fetch request in the 'request' listener above

    await browser.close();
})();
