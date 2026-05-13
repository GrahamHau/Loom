import "./legacy/styles.css";
import "./globals.js";
import "./legacy/bootstrap.js";
import "./App.jsx";

function renderBootError(error) {
  const root = document.getElementById("root");
  if (!root) return;
  root.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f5f6f8;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','SF Pro Text',sans-serif;">
      <div style="width:min(560px,100%);background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:24px;box-shadow:0 12px 30px rgba(15,23,42,.08);">
        <div style="font-size:20px;font-weight:600;color:#111827;margin-bottom:8px;">LOOM 启动失败</div>
        <div style="font-size:13px;line-height:1.7;color:#6b7280;margin-bottom:14px;">前端资源已加载，但应用初始化时出现错误。你可以刷新页面，或者把下面这段错误信息发给我继续处理。</div>
        <pre style="margin:0;padding:14px;border-radius:12px;background:#f8fafc;color:#b42318;font-size:12px;line-height:1.6;white-space:pre-wrap;word-break:break-word;">${String(error?.stack || error?.message || error)}</pre>
      </div>
    </div>
  `;
}

window.addEventListener("error", (event) => {
  console.error("LOOM boot failed", event.error || event.message);
  renderBootError(event.error || event.message);
});
