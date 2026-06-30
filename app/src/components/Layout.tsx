import { useState } from 'react'
import type { ReactNode } from 'react'
import { Menu, X } from 'lucide-react'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import { cn } from '@/lib/utils'

interface LayoutProps {
  children: ReactNode
  breadcrumb?: string[]
}

export default function Layout({ children, breadcrumb }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-[100dvh] bg-vrbg-base relative">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile toggle button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="fixed top-3 left-3 z-50 lg:hidden p-2 rounded-lg bg-vrbg-elevated border border-vrborder-subtle text-vrtext-primary shadow-lg"
      >
        {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      <aside className={cn(
        'fixed left-3 top-3 bottom-3 z-50 w-[220px] bg-vrbg-sidebar border border-vrborder-subtle flex flex-col overflow-hidden rounded-2xl shadow-[0_20px_45px_rgba(15,23,42,0.08)]',
        'transition-transform duration-300 ease-in-out',
        'lg:translate-x-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <Sidebar />
      </aside>

      <TopBar breadcrumb={breadcrumb} />
      <main className="pt-[68px] pl-0 lg:pl-[244px] min-h-[100dvh]">
        <div className="p-4 md:p-6">
          {children}
        </div>
      </main>
    </div>
  )
}
