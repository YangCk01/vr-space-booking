import { Routes, Route } from 'react-router-dom'
import { AuthGuard } from './components/AuthGuard'
import { Toaster } from '@/components/ui/sonner'
import Home from './pages/Home'
import Venues from './pages/Venues'
import Booking from './pages/Booking'
import Orders from './pages/Orders'
import Users from './pages/Users'
import Analytics from './pages/Analytics'
import Finance from './pages/Finance'
import Settings from './pages/Settings'
import MemberMarketing from './pages/MemberMarketing'
import Games from './pages/Games'
import Accounts from './pages/Accounts'
import Reservation from './pages/Reservation'
import Login from './pages/Login'
import AuditLogs from './pages/AuditLogs'
import Roles from './pages/Roles'
import CouponEffects from './pages/CouponEffects'
import VenueAnalytics from './pages/VenueAnalytics'
import Campaigns from './pages/Campaigns'
import TriggerRules from './pages/TriggerRules'
import Approvals from './pages/Approvals'

export default function App() {
  return (
    <>
      <Toaster position="top-right" />
      <AuthGuard>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Home />} />
          <Route path="/venues" element={<Venues />} />
          <Route path="/booking" element={<Booking />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/approvals" element={<Approvals />} />
          <Route path="/users" element={<Users />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/finance" element={<Finance />} />
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
          <Route path="/trigger-rules" element={<TriggerRules />} />
        </Routes>
      </AuthGuard>
    </>
  )
}
