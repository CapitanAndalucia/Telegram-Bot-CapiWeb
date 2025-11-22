import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient, ApiError } from '../../services/apiClient'
import styles from './TicketsAuth.module.css'

const TITLES = {
  login: {
    heading: '📄 Gestor de Tickets',
    subheading: 'Inicia sesión para continuar',
    button: 'Iniciar sesión',
    linkText: '¿No tienes cuenta?',
    linkHref: '/tickets/register',
    linkCta: 'Regístrate aquí',
  },
  register: {
    heading: '📄 Gestor de Tickets',
    subheading: 'Crea tu cuenta para comenzar',
    button: 'Crear cuenta',
    linkText: '¿Ya tienes cuenta?',
    linkHref: '/tickets/login',
    linkCta: 'Inicia sesión aquí',
  },
}

export default function TicketsAuth({ mode = 'login' }) {
  const navigate = useNavigate()
  const meta = TITLES[mode]
  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [status, setStatus] = useState({ loading: false, error: '', success: '' })

  const passwordStrength = useMemo(() => calculatePasswordStrength(form.password), [form.password])

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setStatus({ loading: true, error: '', success: '' })

    if (!form.username || !form.password) {
      setStatus((prev) => ({ ...prev, loading: false, error: 'Usuario y contraseña son obligatorios' }))
      return
    }

    if (mode === 'register') {
      if (form.password !== form.confirmPassword) {
        setStatus((prev) => ({ ...prev, loading: false, error: 'Las contraseñas no coinciden' }))
        return
      }
      if (form.password.length < 6) {
        setStatus((prev) => ({ ...prev, loading: false, error: 'La contraseña debe tener al menos 6 caracteres' }))
        return
      }
    }

    try {
      if (mode === 'login') {
        await apiClient.login({
          username: form.username.trim(),
          password: form.password,
        })
        setStatus({ loading: false, error: '', success: 'Inicio de sesión exitoso. Redirigiendo...' })
      } else {
        await apiClient.register({
          username: form.username.trim(),
          password: form.password,
          email: form.email.trim() || undefined,
        })
        setStatus({ loading: false, error: '', success: 'Registro exitoso. Redirigiendo...' })
      }

      setTimeout(() => navigate('/tickets', { replace: true }), 600)
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.payload?.error || 'Credenciales inválidas'
          : 'Error de conexión. Intenta nuevamente.'
      setStatus({ loading: false, error: message, success: '' })
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <header className={styles.header}>
          <h1>{meta.heading}</h1>
          <p>{meta.subheading}</p>
        </header>

        {status.error ? <div className={styles.error}>{status.error}</div> : null}
        {status.success ? <div className={styles.success}>{status.success}</div> : null}

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label htmlFor="username">Usuario</label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              value={form.username}
              onChange={handleChange}
              required
            />
          </div>

          {mode === 'register' && (
            <div className={styles.formGroup}>
              <label htmlFor="email">Email (opcional)</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={handleChange}
              />
            </div>
          )}

          <div className={styles.formGroup}>
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={form.password}
              onChange={handleChange}
              required
            />
            {mode === 'register' && form.password ? (
              <>
                <div className={styles.strength}>
                  <div
                    className={styles.strengthBar}
                    data-strength={passwordStrength.level}
                    style={{ width: passwordStrength.width }}
                  />
                </div>
                <p className={styles[`strengthText-${passwordStrength.level}`]}>{passwordStrength.label}</p>
              </>
            ) : null}
          </div>

          {mode === 'register' && (
            <div className={styles.formGroup}>
              <label htmlFor="confirmPassword">Confirmar contraseña</label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={form.confirmPassword}
                onChange={handleChange}
                required
              />
            </div>
          )}

          <button type="submit" className={styles.submit} disabled={status.loading}>
            {status.loading ? <span className={styles.loader} /> : meta.button}
          </button>
        </form>

        <div className={styles.divider}>
          <span>o</span>
        </div>

        <p className={styles.link}>
          {meta.linkText} <a href={meta.linkHref}>{meta.linkCta}</a>
        </p>
      </div>
    </div>
  )
}

function calculatePasswordStrength(password) {
  if (!password) {
    return { width: '0%', level: 'empty', label: '' }
  }
  let score = 0
  if (password.length >= 6) score++
  if (password.length >= 8) score++
  if (password.length >= 12) score++
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++
  if (/\d/.test(password)) score++
  if (/[^a-zA-Z\d]/.test(password)) score++

  if (score >= 5) return { width: '100%', level: 'strong', label: '🟢 Seguridad: Fuerte' }
  if (score >= 3) return { width: '66%', level: 'medium', label: '🟡 Seguridad: Media' }
  return { width: '33%', level: 'weak', label: '🔴 Seguridad: Débil' }
}

