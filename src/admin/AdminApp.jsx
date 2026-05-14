import { useCallback, useEffect, useState } from "react";
import { adminApi } from "./api.js";

const ROLE_LABEL = { owner: "主理人", admin: "管理员", member: "成员" };
const STATUS_LABEL = { active: "正常", suspended: "已停用", deleted: "已删除" };
const AUTH_LABEL = { password: "密码", feishu: "飞书" };

function Badge({ children, tone = "neutral" }) {
  return <span className={`admin-badge ${tone}`}>{children}</span>;
}

function fmtDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

export default function AdminApp() {
  const [me, setMe] = useState(null);
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [filters, setFilters] = useState({ q: "", status: "", role: "", auth_provider: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.users.list(filters);
      setUsers(data.items || []);
      setError("");
    } catch (err) {
      setError(err.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetch("/api/me", { credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) throw new Error("请先登录 Loom");
        const data = await response.json();
        const user = data.user || data;
        if (!user.is_admin) throw new Error("当前账号没有管理员权限");
        setMe(user);
      })
      .catch((err) => setError(err.message || "无权限访问管理后台"));
  }, []);

  useEffect(() => {
    if (me) loadUsers();
  }, [me, loadUsers]);

  async function refreshSelected(userId) {
    try {
      setSelected(await adminApi.users.get(userId));
    } catch {
      setSelected(null);
    }
  }

  async function updateUser(user, patch) {
    setNotice("");
    try {
      const updated = await adminApi.users.update(user.id, patch);
      setNotice("操作已保存");
      await loadUsers();
      setSelected(updated);
    } catch (err) {
      setNotice(err.message || "操作失败");
    }
  }

  async function forceSignout(user) {
    setNotice("");
    try {
      const result = await adminApi.users.forceSignout(user.id);
      setNotice(`已撤销 ${result.revoked_tokens || 0} 个 token，清除 ${result.purged_sessions || 0} 个会话`);
      await loadUsers();
      await refreshSelected(user.id);
    } catch (err) {
      setNotice(err.message || "操作失败");
    }
  }

  if (error && !me) {
    return (
      <main className="admin-empty">
        <h1>Loom Admin</h1>
        <p>{error}</p>
        <a href="/app">返回 Loom</a>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <a className="admin-brand" href="/app">Loom Admin</a>
        <button className="admin-nav active" type="button">用户管理</button>
        {me && <div className="admin-user">{me.name} · {ROLE_LABEL[me.role_code] || "管理员"}</div>}
      </aside>

      <section className="admin-main">
        <header className="admin-header">
          <div>
            <h1>用户管理</h1>
            <p>{users.length} 个账号</p>
          </div>
          <button className="admin-button primary" type="button" onClick={loadUsers}>刷新</button>
        </header>

        <div className="admin-filters">
          <input value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} placeholder="搜索姓名或邮箱" />
          <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
            <option value="">所有状态</option>
            <option value="active">正常</option>
            <option value="suspended">已停用</option>
            <option value="deleted">已删除</option>
          </select>
          <select value={filters.role} onChange={(event) => setFilters({ ...filters, role: event.target.value })}>
            <option value="">所有角色</option>
            <option value="owner">主理人</option>
            <option value="admin">管理员</option>
            <option value="member">成员</option>
          </select>
          <select value={filters.auth_provider} onChange={(event) => setFilters({ ...filters, auth_provider: event.target.value })}>
            <option value="">所有登录方式</option>
            <option value="password">密码</option>
            <option value="feishu">飞书</option>
          </select>
        </div>

        {notice && <div className="admin-notice">{notice}</div>}
        {error && <div className="admin-notice error">{error}</div>}

        <div className="admin-layout">
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>用户</th>
                  <th>角色</th>
                  <th>状态</th>
                  <th>登录</th>
                  <th>最近登录</th>
                  <th>工作区</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan="6">加载中...</td></tr>}
                {!loading && users.map((user) => (
                  <tr key={user.id} className={selected?.id === user.id ? "selected" : ""} onClick={() => setSelected(user)}>
                    <td>
                      <strong>{user.name}</strong>
                      <span>{user.email || "-"}</span>
                    </td>
                    <td><Badge tone={user.role_code}>{ROLE_LABEL[user.role_code] || user.role_code}</Badge></td>
                    <td><Badge tone={user.status}>{STATUS_LABEL[user.status] || user.status}</Badge></td>
                    <td>{AUTH_LABEL[user.auth_provider] || user.auth_provider}</td>
                    <td>{fmtDate(user.last_login_at)}</td>
                    <td>{user.is_legacy ? "-" : `${user.workspace?.products || 0} 竞品 / ${user.workspace?.demands || 0} 需求 / ${user.workspace?.news || 0} News`}</td>
                  </tr>
                ))}
                {!loading && users.length === 0 && <tr><td colSpan="6">暂无用户</td></tr>}
              </tbody>
            </table>
          </div>

          {selected && (
            <aside className="admin-detail">
              <div className="admin-detail-head">
                <h2>{selected.name}</h2>
                <button type="button" onClick={() => setSelected(null)}>×</button>
              </div>
              <dl>
                <dt>邮箱</dt><dd>{selected.email || "-"}</dd>
                <dt>飞书 Open ID</dt><dd>{selected.feishu_open_id || "-"}</dd>
                <dt>创建时间</dt><dd>{fmtDate(selected.created_at)}</dd>
                <dt>最近 token</dt><dd>{fmtDate(selected.last_token_at)}</dd>
              </dl>

              {!selected.is_legacy && selected.id !== me?.id && (
                <>
                  <h3>角色</h3>
                  <div className="admin-actions">
                    {["owner", "admin", "member"].map((role) => (
                      <button
                        key={role}
                        type="button"
                        disabled={selected.role_code === role || (role === "owner" && !me?.is_owner)}
                        onClick={() => updateUser(selected, { role_code: role })}
                      >
                        {ROLE_LABEL[role]}
                      </button>
                    ))}
                  </div>

                  <h3>状态</h3>
                  <div className="admin-actions">
                    <button type="button" disabled={selected.status === "active"} onClick={() => updateUser(selected, { status: "active" })}>恢复</button>
                    <button type="button" disabled={selected.status === "suspended"} onClick={() => updateUser(selected, { status: "suspended" })}>停用</button>
                    <button type="button" disabled={selected.status === "deleted"} onClick={() => updateUser(selected, { status: "deleted" })}>软删除</button>
                  </div>

                  <h3>登录</h3>
                  <button className="admin-button" type="button" onClick={() => forceSignout(selected)}>强制退出</button>
                </>
              )}
            </aside>
          )}
        </div>
      </section>
    </main>
  );
}
