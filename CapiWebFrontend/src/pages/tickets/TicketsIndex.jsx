import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient, ApiError } from '../../services/apiClient'
import styles from './TicketsDashboard.module.css'

const EMPTY_FORM = {
  titulo: '',
  fecha: '',
  coste: '',
  moneda: 'EUR',
}

export default function TicketsIndex() {
  const navigate = useNavigate()
  const [authStatus, setAuthStatus] = useState('checking')
  const [user, setUser] = useState(null)
  const [tickets, setTickets] = useState([])
  const [filters, setFilters] = useState({ from: '', to: '', ordering: '-fecha' })
  const [loadingTickets, setLoadingTickets] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTicket, setEditingTicket] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  useEffect(() => {
    const init = async () => {
      try {
        const data = await apiClient.checkAuth()
        console.log("Data de inicio sesion")
        console.log(data)
        setUser(data)
        setAuthStatus('ready')
        await loadTickets()
      } catch {
        setAuthStatus('unauthorized')
        navigate('/tickets/login', { replace: true })
      }
    }
    init()
  }, [navigate])

  const filteredTickets = useMemo(() => tickets, [tickets])

  const loadTickets = async (customFilters = filters) => {
    setLoadingTickets(true)
    setError('')
    try {
      const params = {}

      // Si hay fecha "desde", añadir hora 00:00:00 para incluir todo el día desde el inicio
      if (customFilters.from) {
        params.fecha__gte = `${customFilters.from}T00:00:00`
      }

      // Si hay fecha "hasta", añadir hora 23:59:59 para incluir todo el día hasta el final
      if (customFilters.to) {
        params.fecha__lte = `${customFilters.to}T23:59:59`
      }

      if (customFilters.ordering) params.ordering = customFilters.ordering

      const response = await apiClient.listTickets(params)
      if (Array.isArray(response)) {
        setTickets(response)
      } else if (response?.results) {
        setTickets(response.results)
      } else {
        setTickets([])
      }
    } catch (err) {
      const message =
        err instanceof ApiError ? err.payload?.error || 'No se pudieron cargar los tickets' : 'Error de conexión'
      setError(message)
    } finally {
      setLoadingTickets(false)
    }
  }

  const handleFilterChange = (e) => {
    const { name, value } = e.target
    setFilters((prev) => ({ ...prev, [name]: value }))
  }

  const applyFilters = async () => {
    await loadTickets({ ...filters })
  }

  const clearFilters = async () => {
    const reset = { from: '', to: '', ordering: '-fecha' }
    setFilters(reset)
    await loadTickets(reset)
  }

  const openModal = (ticket = null) => {
    console.log(ticket)
    console.log(user)

    if (ticket) {
      setEditingTicket(ticket)
      setForm({
        titulo: ticket.titulo || '',
        coste: ticket.coste ?? '',
        moneda: ticket.moneda || 'EUR',
        fecha: toLocalInput(ticket.fecha),
      })
    } else {
      setEditingTicket(null)
      setForm(EMPTY_FORM)
    }
    setModalOpen(true)
    setInfo('')
    setError('')
  }

  const closeModal = () => {
    setModalOpen(false)
    setForm(EMPTY_FORM)
    setEditingTicket(null)
  }

  const handleFormChange = (e) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.titulo || !form.fecha || !form.coste) {
      setError('Todos los campos son obligatorios')
      return
    }
    const payload = {
      titulo: form.titulo.trim(),
      coste: parseFloat(form.coste),
      moneda: form.moneda,
      fecha: new Date(form.fecha).toISOString(),
    }
    try {
      if (editingTicket) {
        await apiClient.updateTicket(editingTicket.id, payload)
        setInfo('Ticket actualizado correctamente')
      } else {
        await apiClient.createTicket(payload)
        setInfo('Ticket creado correctamente')
      }
      closeModal()
      await loadTickets()
    } catch (err) {
      const message =
        err instanceof ApiError ? err.payload?.error || 'No se pudo guardar el ticket' : 'Error de conexión'
      setError(message)
    }
  }

  const handleDelete = async (ticketId) => {
    if (!window.confirm('¿Eliminar este ticket?')) return
    try {
      await apiClient.deleteTicket(ticketId)
      setInfo('Ticket eliminado')
      await loadTickets()
    } catch (err) {
      const message =
        err instanceof ApiError ? err.payload?.error || 'No se pudo eliminar el ticket' : 'Error de conexión'
      setError(message)
    }
  }

  const handleLogout = async () => {
    try {
      await apiClient.logout()
    } catch {
      // ignore
    } finally {
      navigate('/tickets/login', { replace: true })
    }
  }

  if (authStatus === 'checking') {
    return (
      <div className={styles.fullscreen}>
        <p>🔄 Verificando autenticación...</p>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>📄 Gestor de Tickets</h1>
          {user ? <p className={styles.subtitle}>Bienvenido, {user.username}</p> : null}
        </div>
        <button onClick={handleLogout} className={styles.logout}>
          🚪 Cerrar sesión
        </button>
      </header>

      <main className={styles.main}>
        <section className={styles.filters}>
          <label>
            Desde
            <input type="date" name="from" value={filters.from} onChange={handleFilterChange} />
          </label>
          <label>
            Hasta
            <input type="date" name="to" value={filters.to} onChange={handleFilterChange} />
          </label>
          <label>
            Orden
            <select name="ordering" value={filters.ordering} onChange={handleFilterChange}>
              <option value="-fecha">Más recientes</option>
              <option value="fecha">Más antiguos</option>
              <option value="coste">Coste asc</option>
              <option value="-coste">Coste desc</option>
            </select>
          </label>
          <div className={styles.filterActions}>
            <button onClick={applyFilters}>Aplicar</button>
            <button onClick={clearFilters} className={styles.ghost}>
              Limpiar
            </button>
          </div>
        </section>

        <section className={styles.actions}>
          <div className={styles.counter}>
            {loadingTickets ? 'Cargando...' : `${filteredTickets.length} ticket(s)`}
          </div>
          <button className={styles.primary} onClick={() => openModal()}>
            ➕ Crear ticket
          </button>
        </section>

        {error ? <div className={styles.error}>{error}</div> : null}
        {info ? <div className={styles.success}>{info}</div> : null}

        <section className={styles.list}>
          {loadingTickets ? (
            <div className={styles.placeholder}>Cargando tickets...</div>
          ) : filteredTickets.length === 0 ? (
            <div className={styles.placeholder}>No hay tickets. ¡Crea el primero!</div>
          ) : (
            filteredTickets.map((ticket) => (
              <article key={ticket.id} className={styles.card}>
                <div>
                  <h3>{ticket.titulo}</h3>
                  <p className={styles.date}>{formatDate(ticket.fecha)}</p>
                  <p className={styles.amount}>{formatCurrency(ticket.coste, ticket.moneda)}</p>
                </div>
                <div className={styles.cardActions}>
                  <button onClick={() => openModal(ticket)}>✏️ Editar</button>
                  <button onClick={() => handleDelete(ticket.id)} className={styles.danger}>
                    🗑️ Eliminar
                  </button>
                </div>
              </article>
            ))
          )}
        </section>
      </main>

      {modalOpen ? (
        <div className={styles.modalBackdrop} onClick={closeModal}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2>{editingTicket ? 'Editar ticket' : 'Crear ticket'}</h2>
            <form className={styles.modalForm} onSubmit={handleSubmit}>
              <label>
                Concepto
                <input name="titulo" value={form.titulo} onChange={handleFormChange} required />
              </label>
              <label>
                Fecha
                <input type="datetime-local" name="fecha" value={form.fecha} onChange={handleFormChange} required />
              </label>
              <label>
                Coste
                <input type="number" step="0.01" name="coste" value={form.coste} onChange={handleFormChange} required />
              </label>
              <label>
                Moneda
                <input name="moneda" maxLength={3} value={form.moneda} onChange={handleFormChange} />
              </label>

              <div className={styles.modalActions}>
                <button type="submit" className={styles.primary}>
                  {editingTicket ? 'Guardar cambios' : 'Crear ticket'}
                </button>
                <button type="button" className={styles.ghost} onClick={closeModal}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function toLocalInput(value) {
  if (!value) return ''
  const date = new Date(value)
  const tzOffset = date.getTimezoneOffset() * 60000
  const localISOTime = new Date(date.getTime() - tzOffset).toISOString().slice(0, 16)
  return localISOTime
}

function formatDate(value) {
  if (!value) return 'Sin fecha'
  const date = new Date(value)
  return date.toLocaleString('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function formatCurrency(amount, currency = 'EUR') {
  if (amount === undefined || amount === null) return '-'
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: currency || 'EUR' }).format(amount)
}
