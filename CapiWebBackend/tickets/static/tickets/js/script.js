// Si API_URL no viene del template, fallback
const API = (typeof API_URL !== "undefined" && API_URL) ? API_URL : "/api/tickets/";
let page = 1;
let hasMore = true;
let editingId = null;

// ---- util CSRF ----
function getCookie(name) {
  let cookieValue = null;
  if (document.cookie && document.cookie !== "") {
    const cookies = document.cookie.split(";");
    for (let cookie of cookies) {
      cookie = cookie.trim();
      if (cookie.startsWith(name + "=")) {
        cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
        break;
      }
    }
  }
  return cookieValue;
}
const csrftoken = getCookie("csrftoken");

async function fetchWithAuth(url, opts = {}) {
  opts.credentials = "include";
  opts.headers = opts.headers || {};
  if (!opts.method || ["POST","PUT","PATCH","DELETE"].includes(opts.method.toUpperCase())) {
    opts.headers["X-CSRFToken"] = csrftoken || "";
  }
  
  const response = await fetch(url, opts);
  
  // Si recibimos 401, redirigir a login
  if (response.status === 401) {
    window.location.href = "/tickets/login/";
    return response;
  }
  
  return response;
}

// ---- Verificar autenticación al cargar ----
async function checkAuth() {
  try {
    const response = await fetch('/api/auth/check/', {
      credentials: 'include'
    });
    
    if (!response.ok) {
      console.log('No autenticado, redirigiendo a login...');
      window.location.href = "/tickets/login/";
      return false;
    }
    
    const data = await response.json();
    console.log('Usuario autenticado:', data.username);
    
    if (data.username) {
      document.getElementById("username").textContent = data.username;
    }
    
    // Mostrar contenido
    document.getElementById("loadingScreen").style.display = "none";
    document.getElementById("mainHeader").style.display = "flex";
    document.getElementById("mainContent").style.display = "block";
    
    return true;
  } catch (error) {
    console.error('Error al verificar autenticación:', error);
    window.location.href = "/tickets/login/";
    return false;
  }
}

// ---- Logout ----
async function logout() {
  try {
    await fetchWithAuth('/api/auth/logout/', {
      method: 'POST'
    });
    window.location.href = "/tickets/login/";
  } catch (error) {
    console.error('Error al cerrar sesión:', error);
  }
}

// ---- fetch tickets ----
async function fetchTickets(reset=false) {
  if (reset) {
    page = 1;
    hasMore = true;
    document.getElementById("ticketsContainer").innerHTML = "";
  }
  if (!hasMore && !reset) return;

  const dateFrom = document.getElementById("dateFrom").value;
  const dateTo = document.getElementById("dateTo").value;
  const sort = document.getElementById("sortOrder").value;

  let url = new URL(API, window.location.origin);
  url.searchParams.set("page", page);
  url.searchParams.set("ordering", sort === "newest" ? "-fecha" : "fecha");
  if (dateFrom) url.searchParams.set("fecha__gte", dateFrom);
  if (dateTo) url.searchParams.set("fecha__lte", dateTo);

  const res = await fetchWithAuth(url.toString());
  if (!res.ok) {
    console.error(await res.text());
    return;
  }
  const data = await res.json();
  (data.results || data).forEach(renderTicket);
  
  // Solo mostrar información si hay filtros de fecha aplicados
  if (dateFrom || dateTo) {
    const totalGastado = (data.results || data).reduce((sum, ticket) => sum + parseFloat(ticket.coste || 0), 0);
    const count = data.count || (data.results || data).length;
    document.getElementById("ticketCount").innerText = `${count} tickets - Total gastado: ${totalGastado.toFixed(2)} €`;
  } else {
    document.getElementById("ticketCount").innerText = "";
  }
  
  hasMore = !!data.next;
  document.getElementById("loadMoreBtn").style.display = hasMore ? "block" : "none";
}

// ---- render ticket sin innerHTML ----
function renderTicket(ticket) {
  const container = document.getElementById("ticketsContainer");
  const card = document.createElement("div");
  card.className = "ticket-card";

  const infoDiv = document.createElement("div");
  infoDiv.className = "ticket-info";

  // const idDiv = document.createElement("div");
  // idDiv.className = "ticket-id";
  // idDiv.textContent = `ID: ${ticket.id}`;

  const conceptDiv = document.createElement("div");
  conceptDiv.className = "ticket-concept";
  conceptDiv.textContent = ticket.titulo;

  const datetimeDiv = document.createElement("div");
  datetimeDiv.className = "ticket-datetime";

  const fechaSpan = document.createElement("span");
  const fecha = ticket.fecha ? ticket.fecha.split("T")[0] : "";
  fechaSpan.textContent = `📅 ${formatDate(fecha)}`;

  const costeSpan = document.createElement("span");
  costeSpan.textContent = `💰 ${ticket.coste} €`;

  datetimeDiv.appendChild(fechaSpan);
  datetimeDiv.appendChild(costeSpan);

  // infoDiv.appendChild(idDiv);
  infoDiv.appendChild(conceptDiv);
  infoDiv.appendChild(datetimeDiv);

  const actionsDiv = document.createElement("div");
  actionsDiv.className = "ticket-actions";

  const editBtn = document.createElement("button");
  editBtn.className = "action-btn edit-btn";
  editBtn.textContent = "✏️ Editar";
  editBtn.onclick = () => openModal(ticket.id, ticket.titulo, ticket.coste, fecha);

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "action-btn delete-btn";
  deleteBtn.textContent = "🗑️ Eliminar";
  deleteBtn.onclick = () => deleteTicket(ticket.id);

  actionsDiv.appendChild(editBtn);
  actionsDiv.appendChild(deleteBtn);

  card.appendChild(infoDiv);
  card.appendChild(actionsDiv);
  container.appendChild(card);
}

function formatDate(dateString) {
  if (!dateString) return "";
  const d = new Date(dateString + "T00:00:00");
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

// ---- Modal ----
function openModal(id=null, titulo="", coste="", fecha="") {
  editingId = id;
  document.getElementById("modalTitle").innerText = id ? "Editar Ticket" : "Crear Nuevo Ticket";
  document.getElementById("ticketConcept").value = titulo || "";
  document.getElementById("ticketCoste").value = coste || "";
  document.getElementById("ticketFecha").value = fecha || "";
  document.getElementById("ticketModal").classList.add("active");
}
function closeModal() {
  editingId = null;
  document.getElementById("ticketForm").reset();
  document.getElementById("ticketModal").classList.remove("active");
}

// ---- CRUD ----
document.getElementById("ticketForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const titulo = document.getElementById("ticketConcept").value.trim();
  const coste = document.getElementById("ticketCoste").value;
  const fecha = document.getElementById("ticketFecha").value;

  const payload = {
    titulo,
    coste,
    fecha: fecha ? (fecha + "T00:00:00Z") : new Date().toISOString(),
    moneda: "EUR"
  };

  const method = editingId ? "PUT" : "POST";
  const url = editingId ? `${API}${editingId}/` : API;

  await fetchWithAuth(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  closeModal();
  fetchTickets(true);
});

async function deleteTicket(id) {
  if (!confirm("¿Eliminar ticket?")) return;
  await fetchWithAuth(`${API}${id}/`, { method: "DELETE" });
  fetchTickets(true);
}

// ---- filtros ----
function clearFilters() {
  document.getElementById("dateFrom").value = "";
  document.getElementById("dateTo").value = "";
  document.getElementById("sortOrder").value = "newest";
  fetchTickets(true);
}
document.getElementById("dateFrom").addEventListener("change", () => fetchTickets(true));
document.getElementById("dateTo").addEventListener("change", () => fetchTickets(true));
document.getElementById("sortOrder").addEventListener("change", () => fetchTickets(true));

function loadMore() {
  if (!hasMore) return;
  page++;
  fetchTickets();
}

// cerrar modal al click fuera
document.getElementById("ticketModal").addEventListener("click", (e) => {
  if (e.target.classList.contains("modal")) closeModal();
});

// ==================== MODAL DE USUARIO ====================
let currentUserId = null;

async function openUserModal() {
  try {
    // Obtener datos del usuario actual
    const response = await fetchWithAuth('/api/auth/check/');
    if (!response.ok) {
      alert('Error al obtener datos del usuario');
      return;
    }
    
    const userData = await response.json();
    currentUserId = userData.user_id;
    
    // Obtener datos completos incluyendo telegram_id
    const userResponse = await fetchWithAuth(`/api/users/${currentUserId}/`);
    if (!userResponse.ok) {
      alert('Error al cargar datos del usuario');
      return;
    }
    
    const fullUserData = await userResponse.json();
    
    // Rellenar el formulario
    document.getElementById("userUsername").value = fullUserData.username || '';
    document.getElementById("userEmail").value = fullUserData.email || '';
    document.getElementById("userTelegramId").value = fullUserData.telegram_id || '';
    document.getElementById("userPassword").value = '';
    
    // Mostrar modal
    document.getElementById("userModal").classList.add("active");
  } catch (error) {
    console.error('Error al abrir modal de usuario:', error);
    alert('Error al cargar datos del usuario');
  }
}

function closeUserModal() {
  currentUserId = null;
  document.getElementById("userForm").reset();
  document.getElementById("userModal").classList.remove("active");
}

// Manejar submit del formulario de usuario
document.getElementById("userForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  
  if (!currentUserId) {
    alert('Error: No se pudo identificar el usuario');
    return;
  }
  
  const username = document.getElementById("userUsername").value.trim();
  const email = document.getElementById("userEmail").value.trim();
  const telegramId = document.getElementById("userTelegramId").value.trim();
  const password = document.getElementById("userPassword").value;
  
  const payload = {
    username,
    email,
    telegram_id: telegramId ? parseInt(telegramId) : null
  };
  
  // Si hay contraseña, agregarla al payload
  if (password) {
    payload.password = password;
  }
  
  try {
    const response = await fetchWithAuth(`/api/users/${currentUserId}/`, {
      method: 'PATCH',
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      alert('Error al actualizar usuario: ' + JSON.stringify(errorData));
      return;
    }
    
    alert('✅ Usuario actualizado correctamente');
    
    // Actualizar el nombre de usuario en el header si cambió
    document.getElementById("username").textContent = username;
    
    closeUserModal();
  } catch (error) {
    console.error('Error al actualizar usuario:', error);
    alert('Error al actualizar usuario');
  }
});

// Cerrar modal de usuario al click fuera
document.getElementById("userModal").addEventListener("click", (e) => {
  if (e.target.classList.contains("modal")) closeUserModal();
});

// inicio - verificar autenticación primero
(async function init() {
  const isAuthenticated = await checkAuth();
  if (isAuthenticated) {
    fetchTickets(true);
  }
})();
