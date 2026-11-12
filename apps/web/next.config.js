// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  optimizeFonts: false,
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'minio',
        port: '9000',
        pathname: '/**',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '9000',
        pathname: '/**',
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
        port: '9000',
        pathname: '/**',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '9001',
        pathname: '/**',
      },
    ],
  },
}

const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  // The default "apis" rule (NetworkFirst, cached) never finishes caching the notification event stream, so each page
  // leaves an open connection behind; after a few pages the browser's 6 connections per host are taken and requests hang.
  extendDefaultRuntimeCaching: true,
  workboxOptions: {
    runtimeCaching: [{
      urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname === "/api/notifications/stream",
      handler: "NetworkOnly",
    }, {
      // Mini-app pages are per user and an app can be removed at any time: never answer them from the cache.
      urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/apps/"),
      handler: "NetworkOnly",
    }],
  },
});

module.exports = withPWA(nextConfig)
