async function adminFetch(path, options = {}) {
  const response = await fetch(`/api/admin${path}`, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || "请求失败");
    error.status = response.status;
    error.code = data.error;
    throw error;
  }
  return data;
}

function query(params = {}) {
  return new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, value]) => value !== "" && value != null))
  ).toString();
}

export const adminApi = {
  users: {
    list: (params = {}) => adminFetch(`/users?${query(params)}`),
    get: (id) => adminFetch(`/users/${id}`),
    update: (id, body) => adminFetch(`/users/${id}`, { method: "PATCH", body }),
    forceSignout: (id) => adminFetch(`/users/${id}/force-signout`, { method: "POST" }),
  },
};
