import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import './hub.css'

export default function Hub() {
  const navigate = useNavigate()

  useEffect(() => {
    const particlesContainer = document.getElementById('particles')
    const isMobile = window.innerWidth <= 768

    const created = []
    if (!isMobile && particlesContainer) {
      const particleCount = 15
      for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div')
        particle.className = 'particle'
        const size = Math.random() * 60 + 20
        particle.style.width = size + 'px'
        particle.style.height = size + 'px'
        particle.style.left = Math.random() * 100 + '%'
        particle.style.animationDelay = Math.random() * 15 + 's'
        particle.style.animationDuration = (Math.random() * 10 + 10) + 's'
        particlesContainer.appendChild(particle)
        created.push(particle)
      }
    }

    const cards = Array.from(document.querySelectorAll('.app-card:not(.add-app-card)'))

    const handlers = cards.map(card => {
      const onTouchStart = () => { card.style.transform = 'scale(0.98)' }
      const onTouchEnd = () => { card.style.transform = 'scale(1)' }
      const onTouchCancel = () => { card.style.transform = 'scale(1)' }
      card.addEventListener('touchstart', onTouchStart)
      card.addEventListener('touchend', onTouchEnd)
      card.addEventListener('touchcancel', onTouchCancel)

      let onMouseMove
      if (!isMobile) {
        onMouseMove = (e) => {
          const rect = card.getBoundingClientRect()
          const x = e.clientX - rect.left
          const y = e.clientY - rect.top
          card.style.setProperty('--mouse-x', x + 'px')
          card.style.setProperty('--mouse-y', y + 'px')
        }
        card.addEventListener('mousemove', onMouseMove)
      }

      return { card, onTouchStart, onTouchEnd, onTouchCancel, onMouseMove }
    })

    // iOS scroll tweak
    let lastTouchY = 0
    const onDocTouchStart = (e) => { lastTouchY = e.touches[0].clientY }
    document.addEventListener('touchstart', onDocTouchStart, { passive: true })
    if (isMobile) document.body.style.overflow = 'auto'

    return () => {
      created.forEach(el => el.remove())
      handlers.forEach(h => {
        h.card.removeEventListener('touchstart', h.onTouchStart)
        h.card.removeEventListener('touchend', h.onTouchEnd)
        h.card.removeEventListener('touchcancel', h.onTouchCancel)
        if (h.onMouseMove) h.card.removeEventListener('mousemove', h.onMouseMove)
      })
      document.removeEventListener('touchstart', onDocTouchStart)
    }
  }, [])

  return (
    <>
      <div className="background-animation" id="particles" />
      <div className="hub-wrapper">
        <div className="container">
          <header>
            <h1>Mi Plataforma</h1>
            <p className="subtitle">Selecciona una aplicación para comenzar</p>
          </header>
          <div className="apps-grid">
            <div className="app-card" onClick={() => navigate('/portafolio/curriculum')}>
              <div className="app-icon">👤</div>
              <h2>Portfolio</h2>
              <p>Explora mis proyectos, experiencia profesional y habilidades técnicas</p>
            </div>

            <div className="app-card" onClick={() => navigate('/portafolio/portfolio_arte')}>
              <div className="app-icon">🎨</div>
              <h2>Portfolio Arte</h2>
              <p>Explora mis proyectos artisticos</p>
            </div>

            <div className="app-card" onClick={() => navigate('/api')}>
              <div className="app-icon">🔗</div>
              <h2>API</h2>
              <p>API que utilizo para las llamadas de otras aplicaciones</p>
            </div>

            <div className="app-card" onClick={() => navigate('/tickets')}>
              <div className="app-icon">🎫</div>
              <h2>Tickets</h2>
              <p>Gestión de TICKETS</p>
            </div>

            <div className="app-card add-app-card">
              <div className="add-icon">+</div>
              <div className="add-text">Próximamente</div>
            </div>
          </div>
          <footer>
            <p>© 2025 Mi Plataforma. Todos los derechos reservados.</p>
          </footer>
        </div>
      </div>
    </>
  )
}
