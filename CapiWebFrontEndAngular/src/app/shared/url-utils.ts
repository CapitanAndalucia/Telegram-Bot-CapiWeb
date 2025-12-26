export function normalizeLocalhostUrl(url: string): string {
    if (!url || typeof window === 'undefined') return url;

    try {
        const parsed = new URL(url, window.location.href);
        const host = window.location.hostname;

        // If the url host is localhost or 127.0.0.1 and we're being accessed via LAN IP,
        // replace host with current hostname and keep original port (usually 8000).
        if ((parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
            && host && host !== 'localhost' && host !== '127.0.0.1') {
            const protocol = window.location.protocol || parsed.protocol;
            const port = parsed.port || '8000';
            return `${protocol}//${host}:${port}${parsed.pathname}${parsed.search}${parsed.hash}`;
        }
    } catch (e) {
        // If URL constructor fails, fall back to original
        return url;
    }

    return url;
}
