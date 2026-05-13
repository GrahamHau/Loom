# Loom — Launch Landing Page

独立的产品 launch 页。讲清楚 Loom 是干什么的、为什么这件事现在重要，
并把登录交互直接做进页面尾部。

> 这个目录是**独立子项目**。不依赖 Loom 主仓库的 `package.json` / `src/` / `server/`，
> 也不会自己接 `/api/auth/login`。集成由 Codex 在后续完成。

## 本地启动

```bash
cd landing
npm install
cp .env.example .env       # 调整 VITE_LOOM_APP_URL（默认指向 http://localhost:5173）
npm run dev                # 监听 http://localhost:5174
```

主 Loom 应用占用 5173，这里用 5174，可以同时跑。

## 构建

```bash
npm run build              # 输出到 landing/dist/
npm run preview            # 预览构建产物
```

## 给 Codex 的集成说明

完成集成只需要做这几件事：

1. **托管静态资源**：把 `landing/dist/` 挂到 Loom 的 Express 上，例如
   ```js
   // server/index.js
   app.use("/welcome", express.static(path.resolve("landing/dist")));
   ```
   或单独部署在 Vercel / Netlify / 对象存储。

2. **替换登录注入点**：landing 的登录表单完整、状态机完整，**但实际 API
   调用是占位**。打开 `src/auth/auth-hook.js`，把 `loginRequest()` 函数体
   替换为对 Loom 现有 `/api/auth/login` 的调用：
   ```js
   export async function loginRequest({ username, password }) {
     const res = await fetch("/api/auth/login", {
       method: "POST",
       credentials: "include",
       headers: { "Content-Type": "application/json" },
       body: JSON.stringify({ username, password }),
     });
     if (!res.ok) {
       const data = await res.json().catch(() => ({}));
       throw new Error(data.message || "登录失败");
     }
     // 登录成功后跳到主 app
     window.location.href = "/";
   }
   ```
   接线点已经在文件头部用 `TODO(codex):` 标出，搜得到。

3. **指向真实 Loom URL**：把 `.env` 里的 `VITE_LOOM_APP_URL` 改成生产域名，
   或直接走 same-origin 让登录后 `window.location.href = "/"` 跳进主 app。

## 设计 token

`src/tokens.css` 从主 app 的 `src/legacy/styles.css` 抽取了 `:root` 设计 token
（OKLCH 色板 + 圆角 + 阴影 + 字体栈）。日后主 app 调色后，这里手动同步即可。

字体：Cinzel（品牌字 + 大标题）+ Manrope（正文），与主 app 完全一致。

## 范围

✅ 7 个 section 的完整内容 + 经纬交织的视觉 motif + 模块卡的微交互
✅ 登录表单完整前端（UI + 校验 + idle/submitting/error/success 状态）
✅ 响应式（375px 起手）
❌ 不实际调 `/api/auth/login`（Codex 接线）
❌ 不动主 app 任何代码
❌ 不部署、不改 nginx、不改 Express server
