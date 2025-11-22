const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
}

const GLOBAL_BASE_URL =
  typeof window !== 'undefined' && window.__API_BASE_URL
    ? window.__API_BASE_URL
    : undefined

const DEFAULT_BASE_URL =
  GLOBAL_BASE_URL?.replace(/\/$/, '') ||
  import.meta?.env?.VITE_API_BASE_URL?.replace(/\/$/, '') ||
  '/api'

class ApiError extends Error {
  constructor(message, status, payload) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.payload = payload
  }
}

class ApiClient {
  constructor(baseUrl = DEFAULT_BASE_URL) {
    this.baseUrl = baseUrl
  }

  buildUrl(path, params) {
    const normalizedPath = path.startsWith('/')
      ? path
      : `/${path}`
    if (!params || Object.keys(params).length === 0) {
      return `${this.baseUrl}${normalizedPath}`
    }
    const searchParams = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return
      if (Array.isArray(value)) {
        value.forEach((v) => searchParams.append(key, v))
      } else {
        searchParams.append(key, value)
      }
    })
    const query = searchParams.toString()
    return query
      ? `${this.baseUrl}${normalizedPath}?${query}`
      : `${this.baseUrl}${normalizedPath}`
  }

  async request(path, { method = 'GET', data, headers, params, formData, signal } = {}) {
    const url = this.buildUrl(path, params)

    const isFormData = formData instanceof FormData
    const body = isFormData
      ? formData
      : data !== undefined
        ? JSON.stringify(data)
        : undefined

    const config = {
      method,
      credentials: 'include',
      headers: isFormData
        ? headers
        : {
          ...DEFAULT_HEADERS,
          ...headers,
        },
      body,
      signal,
    }

    if (isFormData) {
      // Mantener headers personalizados sin Content-Type
      config.headers = headers || {}
    }

    const response = await fetch(url, config)
    const contentType = response.headers.get('Content-Type') || ''
    const isJson = contentType.includes('application/json')
    const payload = isJson ? await response.json().catch(() => null) : await response.text()

    if (!response.ok) {
      throw new ApiError(
        payload?.error || response.statusText || 'Error en la solicitud',
        response.status,
        payload
      )
    }

    return payload
  }

  // ---- Auth ----------------------------------------------------------------
  register(data) {
    return this.request('/auth/register/', { method: 'POST', data })
  }

  login(data) {
    return this.request('/auth/login/', { method: 'POST', data })
  }

  logout() {
    return this.request('/auth/logout/', { method: 'POST' })
  }

  refresh() {
    return this.request('/auth/refresh/', { method: 'POST' })
  }

  checkAuth() {
    return this.request('/auth/check/', { method: 'GET' })
  }

  // ---- Dibujos -------------------------------------------------------------
  listDibujos(params) {
    return this.request('/dibujos/', { method: 'GET', params })
  }

  getDibujo(id) {
    return this.request(`/dibujos/${id}/`, { method: 'GET' })
  }

  createDibujo(data) {
    const formData = data instanceof FormData ? data : this.toFormData(data)
    return this.request('/dibujos/', { method: 'POST', formData })
  }

  updateDibujo(id, data) {
    const formData = data instanceof FormData ? data : this.toFormData(data)
    return this.request(`/dibujos/${id}/`, { method: 'PUT', formData })
  }

  patchDibujo(id, data) {
    const formData = data instanceof FormData ? data : this.toFormData(data)
    return this.request(`/dibujos/${id}/`, { method: 'PATCH', formData })
  }

  deleteDibujo(id) {
    return this.request(`/dibujos/${id}/`, { method: 'DELETE' })
  }

  // ---- Tickets (requiere autenticación) -----------------------------------
  listTickets(params) {
    return this.request('/tickets/', { method: 'GET', params })
  }

  getTicket(id) {
    return this.request(`/tickets/${id}/`, { method: 'GET' })
  }

  createTicket(data) {
    return this.request('/tickets/', { method: 'POST', data })
  }

  updateTicket(id, data) {
    return this.request(`/tickets/${id}/`, { method: 'PUT', data })
  }

  patchTicket(id, data) {
    return this.request(`/tickets/${id}/`, { method: 'PATCH', data })
  }

  deleteTicket(id) {
    return this.request(`/tickets/${id}/`, { method: 'DELETE' })
  }

  totalTicketsEntreFechas({ inicio, fin }) {
    return this.request('/tickets/total_entre_fechas/', {
      method: 'GET',
      params: { inicio, fin },
    })
  }

  // ---- Portfolio Photo -----------------------------------------------------
  getPortfolioPhoto() {
    return this.request('/portfolio-photo/', { method: 'GET' })
  }

  savePortfolioPhoto(data) {
    const formData = data instanceof FormData ? data : this.toFormData(data)
    return this.request('/portfolio-photo/', { method: 'POST', formData })
  }

  // ---- Telegram utilities (requiere admin) ---------------------------------
  getTelegramUser(username) {
    return this.request('/telegram/user/', { method: 'GET', params: { username } })
  }

  listTelegramProfiles() {
    return this.request('/telegram/profiles/', { method: 'GET' })
  }

  // ---- User detail ---------------------------------------------------------
  getUserDetail(userId) {
    return this.request(`/users/${userId}/`, { method: 'GET' })
  }

  updateUserDetail(userId, data) {
    return this.request(`/users/${userId}/`, { method: 'PATCH', data })
  }

  // ---- Helpers -------------------------------------------------------------
  toFormData(payload = {}) {
    const form = new FormData()
    Object.entries(payload).forEach(([key, value]) => {
      if (value === undefined || value === null) return
      if (Array.isArray(value)) {
        value.forEach((item) => form.append(`${key}[]`, item))
      } else {
        form.append(key, value)
      }
    })
    return form
  }
}

const apiClient = new ApiClient()

export { ApiClient, apiClient, ApiError }

