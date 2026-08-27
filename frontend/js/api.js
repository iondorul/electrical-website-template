// Coduri care înseamnă cu adevărat "sesiune expirată / token invalid" — vezi
// authMiddleware.js/errors.js. SINGURELE coduri pentru care api.js forțează
// logout automat. Orice alt 401/403 (ex. CURRENT_PASSWORD_INCORRECT la
// schimbarea parolei, REPORT_DELETE_FORBIDDEN pentru un user non-admin) e o
// eroare de business cu un status HTTP similar, NU o sesiune invalidă — nu
// trebuie să delogheze userul, ci să ajungă ca eroare normală (cu `code`
// propriu) la modulul apelant, exact ca orice alt 400/404/500.
const SESSION_INVALID_CODES = ["SESSION_EXPIRED", "TOKEN_INVALID"];

const API = {
  async request(endpoint, options = {}) {
    const token = localStorage.getItem("token");

    const headers = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    };

    const config = {
      ...options,
      headers,
    };

    try {
      const response = await fetch(`${CONFIG.API_BASE_URL}${endpoint}`, config);
      const data = await response.json().catch(() => ({}));

      if (
        (response.status === 401 || response.status === 403) &&
        SESSION_INVALID_CODES.includes(data.code || data.error)
      ) {
        localStorage.removeItem("token");
        window.location.href = "login.html";
        return;
      }

      if (!response.ok) {
        const apiError = new Error(
          data.message || `Eroare HTTP! Status: ${response.status}`,
        );
        // Cod mașină (ex. "CLIENT_NOT_FOUND") — permite modulelor consumatoare
        // să mapeze eroarea la propria cheie de traducere, în loc să afișeze
        // direct `message` (text hardcodat server-side, mereu RO/EN). `data`
        // duce eventuale valori de interpolare (ex. { itemIndex: 2 }).
        apiError.code = data.code || data.error || null;
        apiError.data = data.data || null;
        throw apiError;
      }

      return data;
    } catch (error) {
      console.error(`API Error [${endpoint}]:`, error);
      throw error;
    }
  },

  get(endpoint) {
    return this.request(endpoint, { method: "GET" });
  },

  post(endpoint, body) {
    return this.request(endpoint, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  put(endpoint, body) {
    return this.request(endpoint, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },

  delete(endpoint) {
    return this.request(endpoint, { method: "DELETE" });
  },
};
