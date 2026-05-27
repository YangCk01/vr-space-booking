import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { QueryProvider } from './providers/QueryProvider'
import './index.css'
import App from './App.tsx'

// 初始化主题（在 React 渲染前执行，避免闪烁）
const saved = localStorage.getItem('theme') as 'light' | 'dark' | null
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
const theme = saved || (prefersDark ? 'dark' : 'light') // 默认暗色
if (theme === 'dark') document.documentElement.classList.add('dark')
else document.documentElement.classList.remove('dark')

createRoot(document.getElementById('root')!).render(
  <HashRouter>
    <QueryProvider>
      <App />
    </QueryProvider>
  </HashRouter>,
)
