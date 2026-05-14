# Loom — Launch Landing Page

独立的产品 launch 页。讲清楚 Loom 是干什么的、为什么这件事现在重要，
并把登录交互直接做进页面尾部。

> 这个目录是**独立子项目**。开发时独立跑在 5174；生产环境下会被 Loom
> 主服务托管为首页 `/` 和插件引导页 `/extension`。

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

## 当前生产路由结构

当前推荐结构：

- `/`：产品首页（landing）
- `/extension`：插件安装引导页
- `/app`：真实 LOOM Web 工作台
- `/api/*`：API

## 与主服务的集成约定

1. 首页和插件页由 `landing/dist/` 承载
2. 主工作台由仓库根目录的 `dist/` 承载，并挂到 `/app`
3. landing 内嵌登录直接调用同域 `/api/auth/login`
4. 登录成功后跳转到 `/app`

## 设计 token

`src/tokens.css` 从主 app 的 `src/legacy/styles.css` 抽取了 `:root` 设计 token
（OKLCH 色板 + 圆角 + 阴影 + 字体栈）。日后主 app 调色后，这里手动同步即可。

字体：Cinzel（品牌字 + 大标题）+ Manrope（正文），与主 app 完全一致。

## 范围

✅ 7 个 section 的完整内容 + 经纬交织的视觉 motif + 模块卡的微交互
✅ 登录表单完整前端（UI + 校验 + 成功后跳转 `/app`）
✅ 响应式（375px 起手）
✅ `/extension` 插件安装引导页
❌ 不包含 Chrome 商店发布流程
