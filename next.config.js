/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  optimizeFonts: false,
  transpilePackages: [
    'kalidokit',
    '@mediapipe/pose',
    '@mediapipe/camera_utils',
    '@mediapipe/drawing_utils',
  ],
}

module.exports = nextConfig
