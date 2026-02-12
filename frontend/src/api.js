// Единая обёртка над fetch, чтобы:
// - автоматически подставлять Authorization
// - красиво обрабатывать ошибки (в том числе не-JSON ответы)

const VITE_API_BASE =
  typeof import.meta !== "undefined" && import.meta.env
    ? import.meta.env.VITE_API_BASE
    : "";
const DEFAULT_API_BASE = `${window.location.protocol}//${window.location.hostname}:12007/api`;
const API_BASE = VITE_API_BASE || DEFAULT_API_BASE;
const STRAPI_BASE = API_BASE;

function isAscii(value) {
  return /^[\x00-\x7F]*$/.test(String(value || ""));
}

function getAuthHeader() {
  const token = localStorage.getItem("kpi_token");
  if (!token || !isAscii(token)) {
    if (token) {
      localStorage.removeItem("kpi_token");
    }
    return {};
  }
  return { Authorization: `Bearer ${token}` };
}

async function handleResponse(res) {
  const contentType = res.headers.get("content-type") || "";
  let data = null;

  if (contentType.includes("application/json")) {
    data = await res.json();
  } else {
    const text = await res.text();
    if (text && text.trim().startsWith("{")) {
      data = JSON.parse(text);
    } else {
      if (!res.ok) {
        throw new Error(text || `HTTP ${res.status}`);
      }
      return text;
    }
  }

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    if (data) {
      if (typeof data.error === 'string') {
        msg = data.error;
      } else if (typeof data.message === 'string') {
        msg = data.message;
      } else if (data.error && typeof data.error === 'object') {
        msg = data.error.message || JSON.stringify(data.error);
      } else if (data.message && typeof data.message === 'object') {
        msg = data.message.message || JSON.stringify(data.message);
      }
    }
    throw new Error(msg);
  }

  return data;
}

export async function apiHolidays(year, month) {
  const query = `?filters[year][$eq]=${year}&filters[month][$eq]=${month}&pagination[pageSize]=1000`;
  const res = await fetch(`${STRAPI_BASE}/holidays${query}`);
  const data = await handleResponse(res);
  
  // Strapi REST API возвращает данные в формате { data: [...] }
  const items = data.data || [];
  
  // Возвращаем массив объектов {id, date} для возможности удаления
  const holidays = items
    .map((item) => {
      // Может быть item.id и item.attributes.date или просто item.date
      const id = item.id;
      const date = item?.attributes?.date || item?.date;
      return { id, date };
    })
    .filter((item) => item.date && item.id);
  
  // Сортируем по дате
  return holidays.sort((a, b) => a.date.localeCompare(b.date));
}

export async function apiAddHoliday(date, year, month, description = '') {
  // Создаём новый праздник (проверка на дубликаты делается на сервере)
  const res = await fetch(`${STRAPI_BASE}/holidays`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      data: {
        date,
        year: parseInt(year, 10),
        month: parseInt(month, 10),
        description,
      },
    }),
  });
  return handleResponse(res);
}

export async function apiDeleteHoliday(id) {
  const res = await fetch(`${STRAPI_BASE}/holidays/${id}`, {
    method: 'DELETE',
  });
  return handleResponse(res);
}

export async function apiLogin(login, password) {
  // Strapi Users & Permissions: POST /auth/local { identifier, password }
  const res = await fetch(`${API_BASE}/auth/local`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      identifier: login,
      password,
    }),
  });
  const data = await handleResponse(res);
  // { jwt, user: { username, email, ... , role? } }
  const token = data.jwt;
  const user = data.user || {};
  const username = user.username || user.email || user.id;
  const allowedDepartments = Array.isArray(user.allowedDepartments)
    ? user.allowedDepartments
    : [];
  const role =
    (user.role && (user.role.name || user.type)) !== undefined
      ? String(user.role.name || user.type)
      : "user";

  if (token) {
    localStorage.setItem("kpi_token", token);
  }

  return {
    token,
    login: String(username || ""),
    role,
    allowedDepartments,
  };
}

export async function apiMe() {
  const headers = { ...getAuthHeader() };
  const res = await fetch(`${API_BASE}/users/me`, {
    headers,
  });
  const data = await handleResponse(res);
  const allowedDepartments = Array.isArray(data.allowedDepartments)
    ? data.allowedDepartments
    : [];
  return {
    login: String(data.username || data.email || ""),
    role:
      (data.role && (data.role.name || data.type)) !== undefined
        ? String(data.role.name || data.type)
        : "user",
    allowedDepartments,
  };
}

export async function apiCalcKpiJson(formData, opts = {}) {
  const params = new URLSearchParams();
  if (opts.department) {
    params.set("department", opts.department);
  }
  if (opts.debug) {
    params.set("debug", "1");
  }
  const query = params.toString();
  const res = await fetch(
    `${STRAPI_BASE}/kpi-calculator/calculate${query ? `?${query}` : ""}`,
    {
      method: "POST",
    headers: {
      ...getAuthHeader(),
    },
    body: formData,
    }
  );
  return handleResponse(res);
}

export async function apiCalcKpiExcel(formData, mode, opts = {}) {
  // mode: "excel" | "1c" | "buh"
  const path =
    mode === "1c"
      ? "/kpi-calculator/download-1c"
      : mode === "buh"
      ? "/kpi-calculator/download-buh"
      : "/kpi-calculator/download-excel";

  const params = new URLSearchParams();
  if (opts.department) {
    params.set("department", opts.department);
  }
  if (opts.debug) {
    params.set("debug", "1");
  }
  const query = params.toString();

  const res = await fetch(`${STRAPI_BASE}${path}${query ? `?${query}` : ""}`, {
    method: "POST",
    headers: {
      ...getAuthHeader(),
    },
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }

  const blob = await res.blob();
  return blob;
}

export async function apiCalcKpiBuhPdf(formData, opts = {}) {
  const params = new URLSearchParams();
  if (opts.department) {
    params.set("department", opts.department);
  }
  if (opts.debug) {
    params.set("debug", "1");
  }
  const query = params.toString();

  const res = await fetch(
    `${STRAPI_BASE}/kpi-calculator/download-buh-pdf${query ? `?${query}` : ""}`,
    {
      method: "POST",
      headers: {
        ...getAuthHeader(),
      },
      body: formData,
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }

  const blob = await res.blob();
  return blob;
}

export async function apiKpiList() {
  const res = await fetch(`${API_BASE}/kpi-list`, {
    headers: {
      ...getAuthHeader(),
    },
  });
  return handleResponse(res); // { items: [...] }
}

export async function apiDeletedLog() {
  const res = await fetch(`${API_BASE}/kpi-deleted-log`, {
    headers: {
      ...getAuthHeader(),
    },
  });
  return handleResponse(res); // { items: [...] }
}

export async function apiEditedLog() {
  const res = await fetch(`${API_BASE}/kpi-edited-log`, {
    headers: {
      ...getAuthHeader(),
    },
  });
  return handleResponse(res);
}

export async function apiRestoredLog() {
  const res = await fetch(`${API_BASE}/kpi-restored-log`, {
    headers: {
      ...getAuthHeader(),
    },
  });
  return handleResponse(res);
}

export async function apiAddEmployee(payload) {
  const res = await fetch(`${API_BASE}/kpi-add`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader(),
    },
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
}

export async function apiEditEmployee(payload) {
  const res = await fetch(`${API_BASE}/kpi-edit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader(),
    },
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
}

export async function apiDeleteEmployee(id, reason) {
  const res = await fetch(`${API_BASE}/kpi-delete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader(),
    },
    body: JSON.stringify({ id, reason }),
  });
  return handleResponse(res);
}

export async function apiRestoreEmployee(payload) {
  const res = await fetch(`${API_BASE}/kpi-restore`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader(),
    },
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
}

export async function apiAccessUsers() {
  const res = await fetch(`${API_BASE}/department-access/users`, {
    headers: {
      ...getAuthHeader(),
    },
  });
  return handleResponse(res);
}

export async function apiUpdateUserAccess(userId, departments) {
  const res = await fetch(`${API_BASE}/department-access/update`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader(),
    },
    body: JSON.stringify({ userId, departments }),
  });
  return handleResponse(res);
}
