export default defineAppConfig({
  pages: ['pages/index/index', 'pages/room/index'],
  darkmode: true,
  themeLocation: 'theme.json',
  window: {
    backgroundTextStyle: '@bgTxtStyle',
    navigationBarBackgroundColor: '@navBgColor',
    navigationBarTitleText: '闹麻大话骰',
    navigationBarTextStyle: '@navTxtStyle',
    backgroundColor: '@bgColor',
  },
})
