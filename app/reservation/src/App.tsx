import { Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { useRef } from 'react'
import Home from './pages/Home'
import VenueList from './pages/VenueList'
import VenueDetail from './pages/VenueDetail'
import GameDetail from './pages/GameDetail'
import OrderConfirm from './pages/OrderConfirm'
import OrderSuccess from './pages/OrderSuccess'
import Recharge from './pages/Recharge'
import Orders from './pages/Orders'
import Pay from './pages/Pay'
import Profile from './pages/Profile'
import AccountRecords from './pages/AccountRecords'
import MemberBenefits from './pages/MemberBenefits'
import Coupons from './pages/Coupons'
import HelpFeedback from './pages/HelpFeedback'
import AccountSettings from './pages/AccountSettings'
import AuthPage from './pages/AuthPage'
import PointsMall from './pages/PointsMall'
import MyPointsOrders from './pages/MyPointsOrders'
import BottomNav from './components/BottomNav'
import { ScrollContainerContext } from './hooks/useScrollContainer'

export default function App() {
  const location = useLocation()
  // 隐藏底部导航的页面
  const hideNav = ['/confirm', '/success', '/login', '/recharge', '/game', '/pay', '/account-records', '/member-benefits', '/coupons', '/help', '/account-settings', '/points-mall', '/points-orders'].some((p) => location.pathname.startsWith(p))

  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const routes = (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<Home />} />
        <Route path="/venues" element={<VenueList />} />
        <Route path="/venue/:id" element={<VenueDetail />} />
        <Route path="/game/:id" element={<GameDetail />} />
        <Route path="/confirm" element={<OrderConfirm />} />
        <Route path="/success" element={<OrderSuccess />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/login" element={<AuthPage />} />
        <Route path="/recharge" element={<Recharge />} />
        <Route path="/account-records" element={<AccountRecords />} />
        <Route path="/member-benefits" element={<MemberBenefits />} />
        <Route path="/coupons" element={<Coupons />} />
        <Route path="/help" element={<HelpFeedback />} />
        <Route path="/account-settings" element={<AccountSettings />} />
        <Route path="/points-mall" element={<PointsMall />} />
        <Route path="/points-orders" element={<MyPointsOrders />} />
        <Route path="/pay/:id" element={<Pay />} />
      </Routes>
    </AnimatePresence>
  )

  return (
    <ScrollContainerContext.Provider value={scrollContainerRef}>
      <div className="min-h-[100dvh] text-[var(--text-primary)] relative">
        {/* 桌面端：iPhone 17 Pro Max 模拟器框架（430×932） */}
        <div className="hidden sm:flex sm:flex-col sm:items-center sm:min-h-[100dvh] sm:bg-black sm:p-6 sm:overflow-y-auto">
          <div className="w-[430px] h-[932px] bg-[var(--bg-primary)] rounded-[48px] overflow-hidden shadow-2xl border border-white/10 relative flex flex-col shrink-0 [transform:translateZ(0)]">
            {/* 顶部刘海/状态栏占位 */}
            <div className="h-[var(--safe-top)] shrink-0" />
            {/* 可滚动内容区 */}
            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto scrollbar-hide">
              {routes}
            </div>
            {/* 底部导航 */}
            {!hideNav && <BottomNav fixed={false} />}
          </div>
        </div>

        {/* 手机端：全宽 */}
        <div className="sm:hidden min-h-[100dvh] bg-[var(--bg-primary)] relative">
          <div className="h-[var(--safe-top)]" />
          {routes}
          {!hideNav && <BottomNav />}
        </div>
      </div>
    </ScrollContainerContext.Provider>
  )
}
