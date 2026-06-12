// tailwind v4 postcss 插件 + oklch/color-mix 构建期降级（WXSS 不支持现代色彩函数 — 铁律 5）
module.exports = {
  plugins: {
    '@tailwindcss/postcss': {},
    'postcss-preset-env': {
      stage: 3,
      features: {
        'oklab-function': { preserve: false },
        'color-mix': { preserve: false },
      },
    },
  },
};
