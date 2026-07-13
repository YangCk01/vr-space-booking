import { Routes, Route } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { AuthGuard } from './components/AuthGuard'
import { Toaster } from '@/components/ui/sonner'

const Home = lazy(() => import('./pages/Home'))
const Venues = lazy(() => import('./pages/Venues'))
const Booking = lazy(() => import('./pages/Booking'))
const Orders = lazy(() => import('./pages/Orders'))
const MemberCenter = lazy(() => import('./pages/MemberCenter'))
const Analytics = lazy(() => import('./pages/Analytics'))
const Finance = lazy(() => import('./pages/Finance'))
const FinanceCompliance = lazy(() => import('./pages/FinanceCompliance'))
const Settings = lazy(() => import('./pages/Settings'))
const MemberMarketing = lazy(() => import('./pages/MemberMarketing'))
const Games = lazy(() => import('./pages/Games'))
const Accounts = lazy(() => import('./pages/Accounts'))
const Reservation = lazy(() => import('./pages/Reservation'))
const Login = lazy(() => import('./pages/Login'))
const AuditLogs = lazy(() => import('./pages/AuditLogs'))
const Roles = lazy(() => import('./pages/Roles'))
const CouponEffects = lazy(() => import('./pages/CouponEffects'))
const VenueAnalytics = lazy(() => import('./pages/VenueAnalytics'))
const Campaigns = lazy(() => import('./pages/Campaigns'))
const CampaignRewardRecords = lazy(() => import('./pages/CampaignRewardRecords'))
const Approvals = lazy(() => import('./pages/Approvals'))
const GroupBuys = lazy(() => import('./pages/GroupBuys'))
const PlatformManagement = lazy(() => import('./pages/PlatformManagement'))

function PageLoading() {
  return (
    <div className="min-h-[100dvh] bg-vrbg-base flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-vraccent-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export default function App() {
  return (
    <>
      <Toaster position="bottom-right" />
      <AuthGuard>
        <Suspense fallback={<PageLoading />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Home />} />
            <Route path="/venues" element={<Venues />} />
            <Route path="/booking" element={<Booking />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/approvals" element={<Approvals />} />
            <Route path="/member-center" element={<MemberCenter />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/finance" element={<Finance />} />
            <Route path="/finance/compliance" element={<FinanceCompliance />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/member-marketing" element={<MemberMarketing />} />
            <Route path="/games" element={<Games />} />
            <Route path="/accounts" element={<Accounts />} />
            <Route path="/reservation" element={<Reservation />} />
            <Route path="/audit-logs" element={<AuditLogs />} />
            <Route path="/roles" element={<Roles />} />
            <Route path="/coupon-effects" element={<CouponEffects />} />
            <Route path="/venue-analytics" element={<VenueAnalytics />} />
            <Route path="/campaigns" element={<Campaigns />} />
            <Route path="/campaign-reward-records" element={<CampaignRewardRecords />} />
            <Route path="/group-buys" element={<GroupBuys />} />
            <Route path="/platforms" element={<PlatformManagement />} />
          </Routes>
        </Suspense>
      </AuthGuard>
    </>
  )
}
