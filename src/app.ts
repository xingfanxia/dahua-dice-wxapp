import { PropsWithChildren } from 'react'
import Taro, { useLaunch } from '@tarojs/taro'

import './app.css'
import './app.scss'

/** 云开发 EnvId 显式写死（铁律 10：不依赖 CLI 当前选中环境） */
export const CLOUD_ENV_ID = 'cloud1-d5gfumwck6e89f9e6'

function App({ children }: PropsWithChildren<any>) {
  useLaunch(() => {
    Taro.cloud.init({ env: CLOUD_ENV_ID })
  })

  // children 是将要会渲染的页面
  return children
}
  


export default App
