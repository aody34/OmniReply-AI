/** @type {import('next').NextConfig} */
const rawBackendUrl = (process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_URL || '').trim();
const withProtocol = rawBackendUrl && /^https?:\/\//i.test(rawBackendUrl)
    ? rawBackendUrl
    : rawBackendUrl
        ? `https://${rawBackendUrl}`
        : '';
const sanitizedBackendUrl = withProtocol.endsWith('/') ? withProtocol.slice(0, -1) : withProtocol;
const backendUrl = sanitizedBackendUrl.endsWith('/api')
    ? sanitizedBackendUrl.slice(0, -4)
    : sanitizedBackendUrl;

const nextConfig = {
    images: {
        remotePatterns: [
            { protocol: 'https', hostname: 'api.qrserver.com' },
        ],
    },
    async rewrites() {
        if (!backendUrl) {
            return [];
        }

        return [
            {
                source: '/api/:path*',
                destination: `${backendUrl}/api/:path*`,
            },
            {
                source: '/health',
                destination: `${backendUrl}/health`,
            },
            {
                source: '/ready',
                destination: `${backendUrl}/ready`,
            },
        ];
    },
};

export default nextConfig;
