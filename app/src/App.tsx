import { Routes, Route } from 'react-router-dom'
import { AuthGuard } from './components/AuthGuard'
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

export default function App() {
  return (
    <AuthGuard>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Home />} />
        <Route path="/venues" element={<Venues />} />
        <Route path="/booking" element={<Booking />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/users" element={<Users />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/finance" element={<Finance />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/member-marketing" element={<MemberMarketing />} />
        <Route path="/games" element={<Games />} />
        <Route path="/accounts" element={<Accounts />} />
        <Route path="/reservation" element={<Reservation />} />
      </Routes>
    </AuthGuard>
  )
}
