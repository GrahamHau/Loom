export default function Footer() {
  return (
    <footer className="site-footer">
      <div>
        <strong style={{ color: "var(--text-2)", fontWeight: 600 }}>LOOM</strong>{" "}
        v0.1 · 当前为单用户工作台 · 未来面向团队
      </div>
      <div style={{ display: "flex", gap: 18 }}>
        <a href="#top">回到顶部</a>
        <a href="#modules">四根经线</a>
        <a href="#whynow">Why Now</a>
        <a href="#login">登录</a>
      </div>
    </footer>
  );
}
