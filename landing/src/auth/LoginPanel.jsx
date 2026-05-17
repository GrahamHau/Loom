import { useEffect, useId, useState } from "react";
import {
  getAuthProviders,
  loginRequest,
  startFeishuLogin,
  visitorLoginRequest,
} from "./auth-hook.js";

/**
 * Embedded login panel for the landing page final CTA section.
 *
 * Owns full client-side state:
 *   - field values
 *   - per-field validation (empty / too short)
 *   - status state machine: idle → submitting → error | success
 *
 * Does NOT own the actual auth call — that's in `auth-hook.js`,
 * the Codex injection point. This separation means design and
 * backend can iterate independently.
 */
export default function LoginPanel() {
  const fieldId = useId();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [status, setStatus] = useState("idle"); // idle | submitting | error | success
  const [errorMessage, setErrorMessage] = useState("");
  const [providers, setProviders] = useState({ password: true, feishu: false });

  useEffect(() => {
    let cancelled = false;
    getAuthProviders()
      .then((nextProviders) => {
        if (!cancelled) setProviders({
          password: nextProviders?.password !== false,
          feishu: Boolean(nextProviders?.feishu),
        });
      })
      .catch(() => {
        if (!cancelled) setProviders({ password: true, feishu: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const validate = () => {
    const next = {};
    if (!username.trim()) next.username = "请输入用户名";
    else if (username.trim().length < 2) next.username = "用户名太短";
    if (!password) next.password = "请输入密码";
    else if (password.length < 4) next.password = "密码至少 4 位";
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (status === "submitting") return;
    if (!validate()) return;

    setStatus("submitting");
    setErrorMessage("");

    try {
      await loginRequest({ username: username.trim(), password });
      // If loginRequest navigates away (production path) we won't reach here.
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setErrorMessage(err?.message || "登录失败，请稍后再试");
    }
  };

  const onDemoLogin = async () => {
    if (status === "submitting") return;
    setStatus("submitting");
    setErrorMessage("");
    try {
      await visitorLoginRequest();
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setErrorMessage(err?.message || "演示模式暂时不可用，请稍后再试");
    }
  };

  const [showPw, setShowPw] = useState(false);
  const submitting = status === "submitting";
  const succeeded  = status === "success";
  const feishuEnabled = providers.feishu && !submitting && !succeeded;
  const passwordEnabled = providers.password !== false;

  return (
    <div className="login-card" aria-label="登录 LOOM">
      <div className="login-brand">
        <div>
          <div className="login-brand-name">LOOM</div>
          <div className="login-brand-sub">Link · Observe · Organize · Make</div>
        </div>
      </div>

      <div className="login-card-head">
        <h3 className="login-card-title">登录工作台</h3>
        <p className="login-card-sub">
          用你已经沉下来的判断，继续养一个更懂业务的 LOOM。
        </p>
      </div>

      <div className="login-actions">

        {/* ① 飞书登录 — 主要入口，始终常驻 */}
        <button className="login-feishu-btn" type="button"
          onClick={startFeishuLogin} disabled={submitting || succeeded}>
          <img src="/feishu.png" alt="" />
          使用飞书登录
        </button>

        {/* ② 演示模式 — 次要入口 */}
        <button className="login-demo-btn" type="button"
          onClick={onDemoLogin} disabled={submitting || succeeded}>
          {submitting ? "进入中…" : "进入演示模式"}
        </button>

        {/* ③ 账号密码 — 折叠式隐性入口 */}
        {passwordEnabled && !showPw && (
          <button className="login-pw-toggle" type="button"
            onClick={() => setShowPw(true)}>
            使用账号密码登录
          </button>
        )}
        {passwordEnabled && showPw && (
          <form className="login-pw-form" onSubmit={onSubmit} noValidate>
            <div className="login-field">
              <label className="login-label" htmlFor="login-username">账号</label>
              <input id="login-username" className="login-input" type="text"
                name="username" autoComplete="username" value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={submitting || succeeded} placeholder="请输入你的账号" />
              {fieldErrors.username && (
                <div id={`${fieldId}-username-err`} className="login-fielderror">
                  {fieldErrors.username}
                </div>
              )}
            </div>
            <div className="login-field">
              <label className="login-label" htmlFor="login-password">密码</label>
              <input id="login-password" className="login-input" type="password"
                name="password" autoComplete="current-password" value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting || succeeded} placeholder="请输入你的密码" />
              {fieldErrors.password && (
                <div id={`${fieldId}-password-err`} className="login-fielderror">
                  {fieldErrors.password}
                </div>
              )}
            </div>
            <button type="submit" className="login-submit"
              disabled={submitting || succeeded}>
              {submitting && <span className="login-spinner" aria-hidden="true" />}
              {succeeded ? "已登录 ✓" : submitting ? "登录中…" : "登录"}
            </button>
          </form>
        )}
      </div>

      {status === "error" && (
        <div role="alert" className="login-error">{errorMessage}</div>
      )}
      {status === "success" && (
        <div role="status" className="login-success">登录成功，正在跳转…</div>
      )}

      <div className="login-card-foot">
        LOOM v2.0 · 支持演示、账号密码与飞书登录
      </div>
    </div>
  );
}
