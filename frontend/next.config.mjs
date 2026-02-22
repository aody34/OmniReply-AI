/** @type {import('next').NextConfig} */
const rawBackendUrl = process.env.NEXT_PUBLIC_API_URL || process.env.BACKEND_API_URL || '';
const backendUrl = rawBackendUrl.endsWith('/') ? rawBackendUrl.slice(0, -1) : rawBackendUrl;

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
