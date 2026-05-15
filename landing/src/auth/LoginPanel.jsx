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

  const submitting = status === "submitting";
  const succeeded = status === "success";
  const feishuEnabled = providers.feishu && !submitting && !succeeded;

  return (
    <form
      className="login-card"
      onSubmit={onSubmit}
      noValidate
      aria-label="登录 LOOM"
    >
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

      <div className="login-field">
        <label className="login-label" htmlFor="login-username">
          账号
        </label>
        <input
          id="login-username"
          className="login-input"
          type="text"
          name="username"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          aria-invalid={fieldErrors.username ? "true" : "false"}
          aria-describedby={
            fieldErrors.username ? `${fieldId}-username-err` : undefined
          }
          disabled={submitting || succeeded}
          placeholder="请输入你的账号"
        />
        {fieldErrors.username && (
          <div id={`${fieldId}-username-err`} className="login-fielderror">
            {fieldErrors.username}
          </div>
        )}
      </div>

      <div className="login-field">
        <label className="login-label" htmlFor="login-password">
          密码
        </label>
        <input
          id="login-password"
          className="login-input"
          type="password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={fieldErrors.password ? "true" : "false"}
          aria-describedby={
            fieldErrors.password ? `${fieldId}-password-err` : undefined
          }
          disabled={submitting || succeeded}
          placeholder="请输入你的密码"
        />
        {fieldErrors.password && (
          <div id={`${fieldId}-password-err`} className="login-fielderror">
            {fieldErrors.password}
          </div>
        )}
      </div>

      <button
        type="submit"
        className="login-submit"
        disabled={submitting || succeeded}
      >
        {submitting && <span className="login-spinner" aria-hidden="true" />}
        {succeeded ? "已登录 ✓" : submitting ? "登录中…" : "登录 LOOM"}
      </button>

      <div className="login-oauth">
        <div className="login-oauth-divider">
          <span>其他方式</span>
        </div>
        <div className="login-oauth-actions">
          <button
            className="login-oauth-btn"
            type="button"
            title="使用飞书登录"
            aria-label="使用飞书登录"
            disabled={!feishuEnabled}
            onClick={startFeishuLogin}
          >
            <img src="/feishu.png" alt="飞书" />
          </button>
        </div>
      </div>

      <button
        className="login-demo-link"
        type="button"
        disabled={submitting || succeeded}
        onClick={onDemoLogin}
      >
        进入演示模式
      </button>

      <div className="login-inline-tip">演示模式可体验示例工作区。</div>

      {status === "error" && (
        <div role="alert" className="login-error">
          {errorMessage}
        </div>
      )}
      {status === "success" && (
        <div role="status" className="login-success">
          登录成功，正在跳转…
        </div>
      )}

      <div className="login-card-foot">
        LOOM v2.0 · 支持演示、账号密码与飞书登录
      </div>
    </form>
  );
}
