/**
 * Drooniradar Batch Request Interceptor
 * 
 * Injects a fetch interceptor to capture /api/v1/history/batch requests.
 * Captured requests are stored in window._batchRequests.
 */
(function () {
    window._batchRequests = window._batchRequests || [];
    const originalFetch = window.fetch;
    window.fetch = async function (input, init) {
        const url = (typeof input === 'string') ? input : (input instanceof Request ? input.url : String(input));

        // Log that we are fetching
        // console.log(`[Interceptor] Fetching: ${url}`);

        const res = await originalFetch(input, init);

        if (url.includes('/api/v1/history/batch')) {
            const clone = res.clone();
            try {
                const data = await clone.json();
                const captured = {
                    url: url,
                    requestHeaders: init?.headers || (input instanceof Request ? Object.fromEntries(input.headers.entries()) : {}),
                    responseHeaders: Object.fromEntries(res.headers.entries()),
                    data: data,
                    timestamp: Date.now()
                };
                window._batchRequests.push(captured);
                console.log(`[Interceptor] Captured batch: ${url}`, captured);
            } catch (err) {
                console.error("[Interceptor] Failed to parse batch JSON", err);
            }
        }
        return res;
    };
    console.log("[Interceptor] Batch interceptor active. View data in window._batchRequests");
    return "Batch interceptor active";
})();
