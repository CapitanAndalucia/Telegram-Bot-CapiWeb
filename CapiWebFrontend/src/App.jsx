import { Routes, Route, Link } from 'react-router-dom'
import Hub from './pages/hub/Hub.jsx'
import MainIndex from './pages/hub/MainIndex.jsx' // Moved to hub as it's part of the main app
import PortfolioCurriculum from './pages/portfolio/PortfolioCurriculum.jsx'
import PortfolioArte from './pages/portfolio/PortfolioArte.jsx'
import TicketsIndex from './pages/tickets/TicketsIndex.jsx'
import TicketsLogin from './pages/tickets/TicketsLogin.jsx'
import TicketsRegister from './pages/tickets/TicketsRegister.jsx'
import Api from './pages/api/Api.jsx'
import './App.css'

export default function App() {
  return (
    <div>
      <Routes>
        <Route path="/" element={<Hub />} />
        <Route path="/main" element={<MainIndex />} />
        <Route path="/portafolio/curriculum" element={<PortfolioCurriculum />} />
        <Route path="/portafolio/portfolio_arte" element={<PortfolioArte />} />
        <Route path="/tickets" element={<TicketsIndex />} />
        <Route path="/tickets/login" element={<TicketsLogin />} />
        <Route path="/tickets/register" element={<TicketsRegister />} />
        <Route path="/api" element={<Api />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  )
}

function NotFound() {
  return (
    <div style={{ padding: 24, color: 'white' }}>
      <h2>Página no encontrada</h2>
      <p>La ruta solicitada no existe.</p>
      <Link to="/">Volver al Hub</Link>
    </div>
  )
}
