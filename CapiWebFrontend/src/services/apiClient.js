import axios from 'axios'

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

  async request(path, { method = 'GET', data, headers, params, formData, signal, responseType, onUploadProgress } = {}) {
    const url = this.buildUrl(path, params)

    // Use axios for file uploads with progress tracking
    if (formData && onUploadProgress) {
      try {
        const response = await axios({
          method,
          url,
          data: formData,
          headers: headers || {},
          withCredentials: true,
          onUploadProgress,
        })
        return response.data
      } catch (error) {
        if (error.response) {
          throw new ApiError(
            error.response.data?.error || error.response.statusText || 'Error en la solicitud',
            error.response.status,
            error.response.data
          )
        }
        throw error
      }
    }

    // Use fetch for regular requests
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
      responseType,
    }

    if (isFormData) {
      // Mantener headers personalizados sin Content-Type
      config.headers = headers || {}
    }

    const response = await fetch(url, config)
    const contentType = response.headers.get('Content-Type') || ''

    // Handle blob response explicitly if requested or if content type is binary
    if (config.responseType === 'blob' ||
      contentType.includes('application/octet-stream') ||
      contentType.includes('image/') ||
      contentType.includes('application/pdf')) {
      if (!response.ok) throw new Error(response.statusText)
      return response.blob()
    }

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
  // ---- Social --------------------------------------------------------------
  listFriends() {
    return this.request('/friends/', { method: 'GET' })
  }

  searchUsers(query) {
    return this.request('/friends/search_users/', { method: 'GET', params: { q: query } })
  }

  sendFriendRequest(username) {
    return this.request('/friends/send_request/', { method: 'POST', data: { username } })
  }

  removeFriend(username) {
    return this.request('/friends/remove_friend/', { method: 'POST', data: { username } })
  }

  listFriendRequests() {
    return this.request('/friends/requests/', { method: 'GET' })
  }

  acceptFriendRequest(id) {
    return this.request(`/friends/${id}/accept_request/`, { method: 'POST' })
  }

  rejectFriendRequest(id) {
    return this.request(`/friends/${id}/reject_request/`, { method: 'POST' })
  }

  // ---- Transfers -----------------------------------------------------------
  listFiles() {
    return this.request('/transfers/', { method: 'GET' })
  }

  uploadFile(formData, onUploadProgress) {
    return this.request('/transfers/', {
      method: 'POST',
      formData,
      onUploadProgress
    })
  }

  downloadFile(id) {
    return this.request(`/transfers/${id}/download/`, { method: 'GET', responseType: 'blob' })
  }

  markFileViewed(id) {
    return this.request(`/transfers/${id}/mark_viewed/`, {
      method: 'POST'
    })
  }

  deleteFile(id) {
    return this.request(`/transfers/${id}/delete_file/`, {
      method: 'DELETE'
    })
  }

  checkArchive(id) {
    return this.request(`/transfers/${id}/check_archive/`, {
      method: 'GET'
    })
  }

  // ---- Notifications -------------------------------------------------------
  listNotifications() {
    return this.request('/notifications/', { method: 'GET' })
  }

  markNotificationRead(id) {
    return this.request(`/notifications/${id}/mark_read/`, { method: 'POST' })
  }
}

const apiClient = new ApiClient()

export { ApiClient, apiClient, ApiError }

