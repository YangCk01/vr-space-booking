import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { QueryProvider } from './providers/QueryProvider'
import './index.css'
import App from './App.tsx'
import { LanguageProvider } from './i18n/language'

// 初始化主题（在 React 渲染前执行，避免闪烁）
const saved = localStorage.getItem('theme') as 'light' | 'dark' | null
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
const theme = saved || (prefersDark ? 'dark' : 'light')
if (theme === 'dark') document.documentElement.classList.add('dark')
else document.documentElement.classList.remove('dark')

createRoot(document.getElementById('root')!).render(
  <HashRouter>
    <QueryProvider>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </QueryProvider>
  </HashRouter>,
)
