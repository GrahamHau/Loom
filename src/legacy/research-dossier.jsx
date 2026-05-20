/* global React, Icon */
const React = globalThis.React;
const Icon = globalThis.Icon;
const { useMemo, useEffect, useState, useRef } = React;

/* ============================================================
   Apple-style research dossier (modal)
   ------------------------------------------------------------
   AI's job in the real system: cluster painpoint phrasings,
   classify common vs unique selling points, generate the one-
   line hero insight. Everything else is pure aggregation.
   ============================================================ */

/* ---------- Parsing helpers ---------- */

function parsePrice(raw) {
  if (!raw) return { has: false };
  const s = String(raw);
  const nums = (s.match(/\d+(?:\.\d+)?/g) || []).map(Number).filter((n) => n > 0 && n < 100000);
  if (!nums.length) return { has: false };
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const cny = s.includes("$") ? { min: min * 7, max: max * 7 } : { min, max };
  return { has: true, min: cny.min, max: cny.max, avg: (cny.min + cny.max) / 2, label: s };
}

function parseSales(raw) {
  if (!raw) return 0;
  const s = String(raw).toLowerCase().replace(/,/g, "");
  const m = s.match(/([\d.]+)\s*(k|w|万)?/);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const mult = m[2] === "k" ? 1000 : (m[2] === "w" || m[2] === "万") ? 10000 : 1;
  return Math.round(n * mult);
}

function fmtCNY(n) {
  if (n >= 1000) return `¥${(n / 1000).toFixed(1)}k`;
  return `¥${Math.round(n)}`;
}

function fmtSales(n) {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

/* ---------- Stats aggregation ---------- */

function computeStats(products, demands) {
  const enriched = products.map((p) => {
    const main = (p.platforms && p.platforms[0]) || {};
    const price = parsePrice(main.price);
    const sales = parseSales(main.sales);
    const rating = parseFloat(main.rating) || 0;
    const platform = main.platform || p.source || "未知";
    return { ...p, _price: price, _sales: sales, _rating: rating, _platform: platform };
  });

  const withPrice = enriched.filter((p) => p._price.has);
  const prices = withPrice.map((p) => p._price.avg);
  const priceStats = prices.length
    ? {
        min: Math.min(...prices),
        max: Math.max(...prices),
        median: prices.slice().sort((a, b) => a - b)[Math.floor(prices.length / 2)],
        mean: prices.reduce((a, b) => a + b, 0) / prices.length,
      }
    : { min: 0, max: 0, median: 0, mean: 0 };

  // Price bands
  const bandEdges = priceStats.max > 0
    ? [0, priceStats.max * 0.2, priceStats.max * 0.4, priceStats.max * 0.6, priceStats.max * 0.8, priceStats.max * 1.05]
    : [0, 100, 200, 300, 500, 800];
  const bands = bandEdges.slice(0, -1).map((lo, i) => {
    const hi = bandEdges[i + 1];
    const count = prices.filter((p) => p >= lo && p < hi).length;
    return { lo, hi, count, pct: prices.length ? count / prices.length : 0 };
  });
  const dominantBand = bands.reduce((a, b) => (b.count > a.count ? b : a), bands[0] || { lo: 0, hi: 0, count: 0 });

  // Pain / scenario freq
  const painFreq = {};
  const scenarioFreq = {};
  // Pain × Scenario matrix
  const matrix = {};
  demands.forEach((d) => {
    const ps = (Array.isArray(d.painpoints) ? d.painpoints : []).map((s) => String(s || "").split(/[\/·,，]/)[0].trim()).filter(Boolean);
    const ss = (Array.isArray(d.scenarios) ? d.scenarios : []).map((s) => String(s || "").split(/[\/·,，]/)[0].trim()).filter(Boolean);
    ps.forEach((p) => { painFreq[p] = (painFreq[p] || 0) + 1; });
    ss.forEach((s) => { scenarioFreq[s] = (scenarioFreq[s] || 0) + 1; });
    ps.forEach((p) => {
      ss.forEach((s) => {
        const key = `${p}|${s}`;
        matrix[key] = (matrix[key] || 0) + 1;
      });
    });
  });
  const topPains = Object.entries(painFreq).sort((a, b) => b[1] - a[1]);
  const topScenarios = Object.entries(scenarioFreq).sort((a, b) => b[1] - a[1]);

  // Selling points
  const tagFreq = {};
  enriched.forEach((p) => {
    (Array.isArray(p.tags) ? p.tags : []).forEach((t) => {
      const word = String(t || "").trim();
      if (word) tagFreq[word] = (tagFreq[word] || 0) + 1;
    });
  });
  const sortedTags = Object.entries(tagFreq).sort((a, b) => b[1] - a[1]);
  const totalProducts = enriched.length || 1;
  const commonTags = sortedTags.filter(([, c]) => c / totalProducts >= 0.3);
  const uniqueTags = sortedTags.filter(([, c]) => c === 1);

  // Dominant category
  const catFreq = {};
  enriched.forEach((p) => {
    const c = p.category || "未分类";
    catFreq[c] = (catFreq[c] || 0) + 1;
  });
  const dominantCategory = Object.entries(catFreq).sort((a, b) => b[1] - a[1])[0]?.[0] || "未分类";

  // Opportunities (top pains uncovered by common tags)
  const opportunities = topPains.slice(0, 5).map(([pain, count]) => {
    const covered = commonTags.some(([t]) => t.includes(pain) || pain.includes(t));
    return { pain, count, covered };
  });
  const openOpportunities = opportunities.filter((o) => !o.covered);

  // Platform distribution (from both products and demands)
  const platformFreq = {};
  enriched.forEach((p) => {
    const k = p._platform;
    if (!platformFreq[k]) platformFreq[k] = { products: 0, demands: 0 };
    platformFreq[k].products += 1;
  });
  demands.forEach((d) => {
    const k = d.source || "未知";
    if (!platformFreq[k]) platformFreq[k] = { products: 0, demands: 0 };
    platformFreq[k].demands += 1;
  });
  const platformList = Object.entries(platformFreq).sort((a, b) => (b[1].products + b[1].demands) - (a[1].products + a[1].demands));

  // Innovation distribution (from demands)
  const innovationFreq = {};
  demands.forEach((d) => {
    const v = String(d.innovation || "").trim();
    if (v) innovationFreq[v] = (innovationFreq[v] || 0) + 1;
  });
  const innovationList = Object.entries(innovationFreq).sort((a, b) => b[1] - a[1]);

  return {
    productsTotal: enriched.length,
    demandsTotal: demands.length,
    enriched,
    priceStats,
    bands,
    dominantBand,
    topPains,
    topScenarios,
    matrix,
    commonTags,
    uniqueTags,
    dominantCategory,
    opportunities,
    openOpportunities,
    platformList,
    innovationList,
  };
}

function buildHeroInsight(stats) {
  const parts = [];
  if (stats.dominantBand && stats.dominantBand.count > 0) {
    parts.push(`${fmtCNY(stats.dominantBand.lo)}–${fmtCNY(stats.dominantBand.hi)} 是主战场`);
  }
  if (stats.openOpportunities.length > 0) {
    const top = stats.openOpportunities[0];
    parts.push(`"${top.pain}" 是公认痛点但无主流竞品覆盖`);
  } else if (stats.topPains.length > 0) {
    parts.push(`"${stats.topPains[0][0]}" 是最高频痛点`);
  }
  if (!parts.length) parts.push("数据样本太少，建议补充关联竞品 / 用户声音后再生成档案");
  return parts.join("，") + "。";
}

/* ---------- Visual primitives ---------- */

function ScatterMap({ enriched, dominantBand, mode = "rating" }) {
  // mode: "rating" (Y = rating) or "sales" (Y = sales)
  const W = 760;
  const H = 380;
  const PAD = { l: 60, r: 24, t: 24, b: 48 };
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;

  const points = enriched.filter((p) => p._price.has && (mode === "rating" ? p._rating > 0 : true));
  if (!points.length) {
    return (
      <div className="dossier-empty">
        <Icon name="boxes" size={20} />
        <div>关联的竞品里没有可用的{mode === "rating" ? "价格 + 评分" : "价格 + 销量"}数据</div>
      </div>
    );
  }

  const xMax = Math.max(...points.map((p) => p._price.avg), 100) * 1.1;
  const salesMax = Math.max(...points.map((p) => p._sales), 1);

  const yMin = mode === "rating" ? 3.5 : 0;
  const yMax = mode === "rating" ? 5.0 : salesMax * 1.1;
  const yOf = (p) => mode === "rating" ? p._rating : p._sales;

  const x = (v) => PAD.l + (v / xMax) * innerW;
  const y = (v) => PAD.t + (1 - (v - yMin) / (yMax - yMin)) * innerH;
  const r = (s) => 5 + Math.sqrt(s / salesMax) * 14;

  const xTicks = [0, xMax * 0.25, xMax * 0.5, xMax * 0.75, xMax].map((v) => Math.round(v));
  const yTicks = mode === "rating"
    ? [3.5, 4.0, 4.5, 5.0]
    : [0, yMax * 0.25, yMax * 0.5, yMax * 0.75, yMax].map((v) => Math.round(v));

  // Quadrant lines (only in sales mode — price median × sales median)
  const priceMedian = points.slice().map((p) => p._price.avg).sort((a, b) => a - b)[Math.floor(points.length / 2)];
  const salesMedian = points.slice().map((p) => p._sales).sort((a, b) => a - b)[Math.floor(points.length / 2)];

  return (
    <svg className="dossier-svg" viewBox={`0 0 ${W} ${H}`} role="img">
      {/* grid */}
      {yTicks.map((t) => (
        <line key={`yg-${t}`} x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="dossier-grid" />
      ))}
      {xTicks.map((t) => (
        <line key={`xg-${t}`} x1={x(t)} x2={x(t)} y1={PAD.t} y2={H - PAD.b} className="dossier-grid" />
      ))}
      {/* mode-specific overlays */}
      {mode === "rating" && dominantBand && dominantBand.count > 0 && (
        <rect
          x={x(dominantBand.lo)}
          y={PAD.t}
          width={x(dominantBand.hi) - x(dominantBand.lo)}
          height={innerH}
          className="dossier-band-highlight"
        />
      )}
      {mode === "sales" && (
        <g>
          <line x1={x(priceMedian)} x2={x(priceMedian)} y1={PAD.t} y2={H - PAD.b} className="dossier-quadrant-line" />
          <line x1={PAD.l} x2={W - PAD.r} y1={y(salesMedian)} y2={y(salesMedian)} className="dossier-quadrant-line" />
          <text x={x(xMax * 0.05)} y={PAD.t + 16} className="dossier-quadrant-label">性价比之王</text>
          <text x={x(xMax * 0.95)} y={PAD.t + 16} className="dossier-quadrant-label" textAnchor="end">畅销高溢价</text>
          <text x={x(xMax * 0.05)} y={H - PAD.b - 8} className="dossier-quadrant-label dossier-quadrant-faded">长尾</text>
          <text x={x(xMax * 0.95)} y={H - PAD.b - 8} className="dossier-quadrant-label dossier-quadrant-faded" textAnchor="end">高价低销</text>
        </g>
      )}
      {/* axis labels */}
      {yTicks.map((t, i) => (
        <text key={`yt-${i}`} x={PAD.l - 10} y={y(t) + 4} className="dossier-axis-text" textAnchor="end">
          {mode === "rating" ? `${t.toFixed(1)}★` : fmtSales(t)}
        </text>
      ))}
      {xTicks.map((t) => (
        <text key={`xt-${t}`} x={x(t)} y={H - PAD.b + 18} className="dossier-axis-text" textAnchor="middle">
          {fmtCNY(t)}
        </text>
      ))}
      {/* dots */}
      {points.map((p) => {
        const yv = yOf(p);
        return (
          <g key={p.id} className="dossier-dot-group">
            <circle cx={x(p._price.avg)} cy={y(yv)} r={r(p._sales)} className="dossier-dot" />
            <title>{p.name} · {p._price.label} · {p._rating}★ · {fmtSales(p._sales)}/月</title>
          </g>
        );
      })}
    </svg>
  );
}

function PriceCurve({ bands, dominantBand }) {
  // Renamed conceptually to "price bars" — clean histogram with rounded tops,
  // gradient fill, percent labels. Handles sparse data (1-3 products) without
  // the ugly artifacts of a smooth curve fit through near-zeros.
  if (!bands || !bands.length || bands.every((b) => b.count === 0)) {
    return (
      <div className="dossier-empty">
        <Icon name="bar-chart" size={20} />
        <div>没有可用的定价数据</div>
      </div>
    );
  }
  const W = 760;
  const H = 260;
  const PAD = { l: 24, r: 24, t: 56, b: 44 };
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const maxPct = Math.max(...bands.map((b) => b.pct), 0.05);
  const slotW = innerW / bands.length;
  const barW = Math.min(slotW * 0.62, 110);

  return (
    <svg className="dossier-svg" viewBox={`0 0 ${W} ${H}`} role="img">
      <defs>
        <linearGradient id="priceBarGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.92" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id="priceBarGradMuted" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.08" />
        </linearGradient>
      </defs>
      {/* baseline */}
      <line
        x1={PAD.l}
        x2={W - PAD.r}
        y1={PAD.t + innerH}
        y2={PAD.t + innerH}
        className="dossier-grid"
      />
      {bands.map((b, i) => {
        const cx = PAD.l + (i + 0.5) * slotW;
        const isDominant = dominantBand && b.lo === dominantBand.lo && b.count > 0;
        // Minimum visible height for zero bars (visual rhythm)
        const minH = 6;
        const barH = b.count > 0 ? Math.max((b.pct / maxPct) * innerH, 18) : minH;
        const y = PAD.t + innerH - barH;
        const isZero = b.count === 0;
        return (
          <g key={i} className="dossier-price-bar-group">
            <rect
              x={cx - barW / 2}
              y={y}
              width={barW}
              height={barH}
              rx={Math.min(barW / 2, 14)}
              ry={Math.min(barW / 2, 14)}
              fill={isZero ? "var(--surface-3)" : (isDominant ? "url(#priceBarGrad)" : "url(#priceBarGradMuted)")}
              className={`dossier-price-bar ${isDominant ? "is-dominant" : ""} ${isZero ? "is-zero" : ""}`}
            />
            {!isZero && (
              <text
                x={cx}
                y={y - 10}
                textAnchor="middle"
                className={`dossier-price-bar-label ${isDominant ? "is-dominant" : ""}`}
              >
                {Math.round(b.pct * 100)}%
              </text>
            )}
            <text
              x={cx}
              y={H - 14}
              textAnchor="middle"
              className="dossier-axis-text"
            >
              {fmtCNY(b.lo)}-{fmtCNY(b.hi)}
            </text>
            {!isZero && (
              <text
                x={cx}
                y={H - 2}
                textAnchor="middle"
                className="dossier-axis-text-sub"
              >
                {b.count} 款
              </text>
            )}
          </g>
        );
      })}
      {/* dominant callout */}
      {dominantBand && dominantBand.count > 0 && (() => {
        const idx = bands.findIndex((b) => b.lo === dominantBand.lo);
        if (idx < 0) return null;
        const cx = PAD.l + (idx + 0.5) * slotW;
        return (
          <g>
            <text x={cx} y={26} textAnchor="middle" className="dossier-callout-text">
              主流价格带
            </text>
          </g>
        );
      })()}
    </svg>
  );
}

function PainBars({ topPains }) {
  if (!topPains.length) return <div className="dossier-empty"><Icon name="lightbulb" size={20} /><div>暂无用户声音数据</div></div>;
  const shown = topPains.slice(0, 8);
  const maxCount = Math.max(...shown.map(([, c]) => c));
  return (
    <div className="dossier-pain-list">
      {shown.map(([word, count]) => (
        <div key={word} className="dossier-pain-row">
          <div className="dossier-pain-label">{word}</div>
          <div className="dossier-pain-bar-wrap">
            <div className="dossier-pain-bar" style={{ width: `${(count / maxCount) * 100}%` }} />
          </div>
          <div className="dossier-pain-count">{count} 条</div>
        </div>
      ))}
    </div>
  );
}

function ScenarioPainHeatmap({ topPains, topScenarios, matrix }) {
  const pains = topPains.slice(0, 6).map(([p]) => p);
  const scenarios = topScenarios.slice(0, 5).map(([s]) => s);
  if (!pains.length || !scenarios.length) {
    return <div className="dossier-empty"><Icon name="lightbulb" size={20} /><div>样本不足，至少需要 5 条同时带场景 + 痛点的用户声音</div></div>;
  }
  const cells = pains.map((p) => scenarios.map((s) => matrix[`${p}|${s}`] || 0));
  const allValues = cells.flat();
  const max = Math.max(...allValues, 1);

  return (
    <div className="dossier-heatmap-wrap">
      <div className="dossier-heatmap" style={{ gridTemplateColumns: `120px repeat(${scenarios.length}, 1fr)` }}>
        <div />
        {scenarios.map((s) => (
          <div key={s} className="dossier-heatmap-col-label">{s}</div>
        ))}
        {pains.map((p, pi) => (
          <React.Fragment key={p}>
            <div className="dossier-heatmap-row-label">{p}</div>
            {scenarios.map((s, si) => {
              const v = cells[pi][si];
              const intensity = v / max;
              return (
                <div
                  key={s}
                  className="dossier-heatmap-cell"
                  style={{
                    background: v
                      ? `color-mix(in srgb, var(--accent) ${Math.round(intensity * 60 + 8)}%, var(--surface))`
                      : "var(--surface)",
                    color: intensity > 0.5 ? "#fff" : "var(--text-3)",
                  }}
                  title={`${p} × ${s}: ${v} 条`}
                >
                  {v > 0 ? v : ""}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
      <div className="dossier-heatmap-legend">
        <span>低</span>
        <div className="dossier-heatmap-legend-bar" />
        <span>高</span>
      </div>
    </div>
  );
}

function PlatformBars({ platformList }) {
  if (!platformList.length) return null;
  const PLATFORM_LABEL = {
    creator_signal: "小红书 · 创作者",
    xhs: "小红书",
    amazon: "Amazon",
    youtube: "YouTube",
    kickstarter: "Kickstarter",
    taobao: "淘宝",
    tmall: "天猫",
    jd: "京东",
    instagram: "Instagram",
    manual: "人工录入",
    未知: "未知来源",
  };
  const max = Math.max(...platformList.map(([, v]) => v.products + v.demands), 1);
  return (
    <div className="dossier-platform-list">
      {platformList.map(([key, v]) => (
        <div key={key} className="dossier-platform-row">
          <div className="dossier-platform-name">{PLATFORM_LABEL[key] || key}</div>
          <div className="dossier-platform-bar-wrap">
            {v.products > 0 && (
              <div
                className="dossier-platform-bar dossier-platform-bar-products"
                style={{ width: `${(v.products / max) * 100}%` }}
                title={`${v.products} 个竞品`}
              />
            )}
            {v.demands > 0 && (
              <div
                className="dossier-platform-bar dossier-platform-bar-demands"
                style={{ width: `${(v.demands / max) * 100}%` }}
                title={`${v.demands} 条用户声音`}
              />
            )}
          </div>
          <div className="dossier-platform-meta">
            {v.products > 0 && <span className="dossier-platform-tag dossier-platform-tag-products">{v.products} 竞品</span>}
            {v.demands > 0 && <span className="dossier-platform-tag dossier-platform-tag-demands">{v.demands} 声音</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function InnovationDonut({ innovationList }) {
  if (!innovationList.length) {
    return <div className="dossier-empty"><Icon name="sparkles" size={20} /><div>暂无创新类型数据（需要 PM 在采集时打标）</div></div>;
  }
  const total = innovationList.reduce((s, [, c]) => s + c, 0) || 1;
  // SVG donut
  const W = 220;
  const cx = W / 2;
  const cy = W / 2;
  const R = 80;
  const r = 50;
  const COLORS = ["#0071e3", "#34c759", "#ff9500", "#af52de", "#ff3b30", "#5ac8fa"];

  let cursor = -Math.PI / 2;
  const arcs = innovationList.map(([name, count], i) => {
    const angle = (count / total) * Math.PI * 2;
    const a0 = cursor;
    const a1 = cursor + angle;
    cursor = a1;
    const large = angle > Math.PI ? 1 : 0;
    const x0 = cx + Math.cos(a0) * R, y0 = cy + Math.sin(a0) * R;
    const x1 = cx + Math.cos(a1) * R, y1 = cy + Math.sin(a1) * R;
    const x2 = cx + Math.cos(a1) * r, y2 = cy + Math.sin(a1) * r;
    const x3 = cx + Math.cos(a0) * r, y3 = cy + Math.sin(a0) * r;
    return {
      d: `M ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1} L ${x2} ${y2} A ${r} ${r} 0 ${large} 0 ${x3} ${y3} Z`,
      color: COLORS[i % COLORS.length],
      name,
      count,
      pct: count / total,
    };
  });

  return (
    <div className="dossier-donut-wrap">
      <svg width={W} height={W} viewBox={`0 0 ${W} ${W}`} className="dossier-donut">
        {arcs.map((a, i) => (
          <path key={i} d={a.d} fill={a.color} className="dossier-donut-arc">
            <title>{a.name}: {a.count} 条 ({Math.round(a.pct * 100)}%)</title>
          </path>
        ))}
        <text x={cx} y={cy - 4} textAnchor="middle" className="dossier-donut-center-num">{total}</text>
        <text x={cx} y={cy + 14} textAnchor="middle" className="dossier-donut-center-label">条用户声音</text>
      </svg>
      <div className="dossier-donut-legend">
        {arcs.map((a) => (
          <div key={a.name} className="dossier-donut-legend-row">
            <span className="dossier-donut-legend-dot" style={{ background: a.color }} />
            <span className="dossier-donut-legend-name">{a.name}</span>
            <span className="dossier-donut-legend-pct">{Math.round(a.pct * 100)}%</span>
            <span className="dossier-donut-legend-count">{a.count} 条</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function OpportunityGrid({ topPains, commonTags, openOpportunities }) {
  return (
    <div className="dossier-opp-grid">
      <div className="dossier-opp-quadrant dossier-opp-q-top-left">
        <div className="dossier-opp-q-label">高频痛点 · 高竞品覆盖</div>
        <div className="dossier-opp-q-sub">红海，竞争激烈</div>
        <div className="dossier-opp-q-items">
          {topPains.slice(0, 8).filter(([pain]) =>
            commonTags.some(([t]) => t.includes(pain) || pain.includes(t))
          ).slice(0, 3).map(([p, c]) => (
            <span key={p} className="dossier-opp-chip">{p} <em>{c}</em></span>
          ))}
        </div>
      </div>
      <div className="dossier-opp-quadrant dossier-opp-q-top-right dossier-opp-q-highlight">
        <div className="dossier-opp-q-label">高频痛点 · 低竞品覆盖 ⚡</div>
        <div className="dossier-opp-q-sub">机会区——值得立项</div>
        <div className="dossier-opp-q-items">
          {openOpportunities.slice(0, 4).map((o) => (
            <span key={o.pain} className="dossier-opp-chip dossier-opp-chip-hot">{o.pain} <em>{o.count}</em></span>
          ))}
          {!openOpportunities.length && (
            <span className="dossier-opp-empty">没有发现明显的空白点</span>
          )}
        </div>
      </div>
      <div className="dossier-opp-quadrant dossier-opp-q-bot-left">
        <div className="dossier-opp-q-label">低频痛点 · 已覆盖</div>
        <div className="dossier-opp-q-sub">维持即可</div>
        <div className="dossier-opp-q-items">
          {commonTags.slice(0, 3).map(([t, c]) => (
            <span key={t} className="dossier-opp-chip">{t} <em>{c}</em></span>
          ))}
        </div>
      </div>
      <div className="dossier-opp-quadrant dossier-opp-q-bot-right">
        <div className="dossier-opp-q-label">低频痛点 · 低覆盖</div>
        <div className="dossier-opp-q-sub">长尾，先观察</div>
        <div className="dossier-opp-q-items">
          {topPains.slice(8, 11).map(([p, c]) => (
            <span key={p} className="dossier-opp-chip dossier-opp-chip-faded">{p} <em>{c}</em></span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- Export to standalone HTML ---------- */

function exportDossierHTML(dossierEl, research) {
  if (!dossierEl) return;
  // Snapshot the inner content
  const content = dossierEl.outerHTML;
  // Inline all relevant CSS variables + dossier styles
  const styleSheets = Array.from(document.styleSheets);
  let cssText = "";
  for (const sheet of styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        const t = rule.cssText || "";
        if (
          t.startsWith(":root") ||
          t.startsWith("[data-theme") ||
          t.includes(".dossier") ||
          t.includes("@keyframes dossierBarGrow") ||
          t.startsWith("body") ||
          t.startsWith("html") ||
          t.startsWith("*")
        ) {
          cssText += t + "\n";
        }
      }
    } catch (e) {
      // cross-origin sheet, skip
    }
  }
  const html = `<!doctype html>
<html lang="zh-CN" data-theme="halo" data-mode="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${(research?.title || "调研档案").replace(/</g, "&lt;")} · Loom 调研档案</title>
<style>
${cssText}
body { padding: 32px; background: var(--bg); }
.dossier-modal-backdrop, .dossier-modal-footer, .dossier-modal-close { display: none !important; }
.dossier-modal { position: static !important; max-height: none !important; transform: none !important; box-shadow: none !important; border: none !important; }
.dossier-modal-body { overflow: visible !important; max-height: none !important; padding: 0 !important; }
</style>
</head>
<body>
${content}
<footer style="margin-top: 48px; padding-top: 24px; border-top: 1px solid var(--border); font-size: 11px; color: var(--text-4); text-align: center;">
导出自 Loom · ${new Date().toLocaleString("zh-CN")}
</footer>
</body>
</html>`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safe = (research?.title || "research-dossier").replace(/[\\/:*?"<>|]/g, "_");
  a.href = url;
  a.download = `${safe}.html`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

/* ---------- Main modal ---------- */

function ResearchDossier({ research, products, demands, onClose }) {
  const stats = useMemo(() => computeStats(products || [], demands || []), [products, demands]);
  const insight = useMemo(() => buildHeroInsight(stats), [stats]);
  const bodyRef = useRef(null);

  // Reveal animation
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 50);
    return () => clearTimeout(t);
  }, []);

  // ESC to close
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKey);
    // lock body scroll
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const handleExport = () => exportDossierHTML(bodyRef.current?.querySelector(".dossier"), research);

  return (
    <div className="dossier-modal-backdrop" onClick={onClose}>
      <div
        className="dossier-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="调研档案"
      >
        <button type="button" className="dossier-modal-close" onClick={onClose} aria-label="关闭">
          <Icon name="x" size={14} />
        </button>

        <div className="dossier-modal-body" ref={bodyRef}>
          <div className={`dossier ${revealed ? "dossier-revealed" : ""}`}>

            {/* HERO */}
            <section className="dossier-hero">
              <div className="dossier-hero-eyebrow">调研档案 · {research?.date || "—"}</div>
              <h1 className="dossier-hero-title">{research?.title || `${stats.dominantCategory} 品类全景`}</h1>
              <div className="dossier-hero-stats">
                <div className="dossier-hero-stat">
                  <div className="dossier-hero-stat-num">{stats.productsTotal}</div>
                  <div className="dossier-hero-stat-label">关联竞品</div>
                </div>
                <div className="dossier-hero-stat">
                  <div className="dossier-hero-stat-num">{stats.demandsTotal}</div>
                  <div className="dossier-hero-stat-label">用户声音</div>
                </div>
                <div className="dossier-hero-stat">
                  <div className="dossier-hero-stat-num">{stats.priceStats.median ? fmtCNY(stats.priceStats.median) : "—"}</div>
                  <div className="dossier-hero-stat-label">价格中位数</div>
                </div>
                <div className="dossier-hero-stat">
                  <div className="dossier-hero-stat-num">{stats.openOpportunities.length}</div>
                  <div className="dossier-hero-stat-label">空白机会点</div>
                </div>
              </div>
              <div className="dossier-hero-insight">
                <Icon name="sparkles" size={14} />
                <span>{insight}</span>
              </div>
            </section>

            {/* 01 竞品全景 (price × rating) */}
            <section className="dossier-section">
              <div className="dossier-section-head">
                <div className="dossier-section-eyebrow">01 — 竞品全景</div>
                <h2 className="dossier-section-title">价格 × 评分 × 销量 三维地图</h2>
                <p className="dossier-section-sub">每一个点是一款竞品，横轴价格、纵轴评分、面积是月销量。蓝色阴影区是主流定价区间。</p>
              </div>
              <div className="dossier-section-body">
                <ScatterMap enriched={stats.enriched} dominantBand={stats.dominantBand} mode="rating" />
              </div>
            </section>

            {/* 02 价格带分布 */}
            <section className="dossier-section">
              <div className="dossier-section-head">
                <div className="dossier-section-eyebrow">02 — 价格带分布</div>
                <h2 className="dossier-section-title">
                  {stats.dominantBand && stats.dominantBand.count > 0
                    ? `主流价格带 ${fmtCNY(stats.dominantBand.lo)}–${fmtCNY(stats.dominantBand.hi)}`
                    : "价格分布"}
                </h2>
                <p className="dossier-section-sub">
                  基于 {stats.enriched.filter((p) => p._price.has).length} 款有定价数据的竞品，按价格区间分布。
                </p>
              </div>
              <div className="dossier-section-body">
                <PriceCurve bands={stats.bands} dominantBand={stats.dominantBand} />
              </div>
            </section>

            {/* 03 价格 × 销量 性价比 */}
            <section className="dossier-section">
              <div className="dossier-section-head">
                <div className="dossier-section-eyebrow">03 — 性价比四象限</div>
                <h2 className="dossier-section-title">价格 × 月销量</h2>
                <p className="dossier-section-sub">谁卖得最猛？哪个价位段最好卖？左上是「性价比之王」，右上是「畅销高溢价」。</p>
              </div>
              <div className="dossier-section-body">
                <ScatterMap enriched={stats.enriched} mode="sales" />
              </div>
            </section>

            {/* 04 平台信号分布 */}
            <section className="dossier-section">
              <div className="dossier-section-head">
                <div className="dossier-section-eyebrow">04 — 平台信号</div>
                <h2 className="dossier-section-title">数据从哪里来</h2>
                <p className="dossier-section-sub">蓝色 = 竞品来源；浅色 = 用户声音来源。主导平台 = 这个品类的真实声音应该去那里挖。</p>
              </div>
              <div className="dossier-section-body">
                <PlatformBars platformList={stats.platformList} />
              </div>
            </section>

            {/* 05 卖点矩阵 */}
            <section className="dossier-section">
              <div className="dossier-section-head">
                <div className="dossier-section-eyebrow">05 — 卖点矩阵</div>
                <h2 className="dossier-section-title">通用卖点 vs 差异卖点</h2>
                <p className="dossier-section-sub">通用卖点（≥30% 竞品都在主打）= 入场门槛；差异卖点（仅 1 家主打）= 可能的破局点。</p>
              </div>
              <div className="dossier-section-body">
                <div className="dossier-selling-grid">
                  <div className="dossier-selling-col">
                    <div className="dossier-selling-col-label">通用卖点</div>
                    <div className="dossier-selling-chips">
                      {stats.commonTags.length > 0 ? stats.commonTags.map(([t, c]) => (
                        <span key={t} className="dossier-selling-chip dossier-selling-chip-common">{t} <em>{c}/{stats.productsTotal}</em></span>
                      )) : <span className="dossier-empty-inline">暂无足够竞品数据</span>}
                    </div>
                  </div>
                  <div className="dossier-selling-col">
                    <div className="dossier-selling-col-label">差异卖点</div>
                    <div className="dossier-selling-chips">
                      {stats.uniqueTags.length > 0 ? stats.uniqueTags.slice(0, 12).map(([t]) => (
                        <span key={t} className="dossier-selling-chip dossier-selling-chip-unique">{t} <em>仅 1 家</em></span>
                      )) : <span className="dossier-empty-inline">所有卖点至少 2 家竞品都在用</span>}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* 06 痛点热力 */}
            <section className="dossier-section">
              <div className="dossier-section-head">
                <div className="dossier-section-eyebrow">06 — 痛点热力</div>
                <h2 className="dossier-section-title">用户最常抱怨什么</h2>
                <p className="dossier-section-sub">从 {stats.demandsTotal} 条用户声音中聚合，按提及次数排序。</p>
              </div>
              <div className="dossier-section-body">
                <PainBars topPains={stats.topPains} />
              </div>
            </section>

            {/* 07 场景 × 痛点热力图 */}
            <section className="dossier-section">
              <div className="dossier-section-head">
                <div className="dossier-section-eyebrow">07 — 场景 × 痛点</div>
                <h2 className="dossier-section-title">哪个场景下哪个痛点最严重</h2>
                <p className="dossier-section-sub">交叉热力图：颜色越深，该场景下该痛点被提到的次数越多。这是 PRD 「目标场景 + 必须解决」的关键输入。</p>
              </div>
              <div className="dossier-section-body">
                <ScenarioPainHeatmap topPains={stats.topPains} topScenarios={stats.topScenarios} matrix={stats.matrix} />
              </div>
            </section>

            {/* 08 创新类型分布 */}
            <section className="dossier-section">
              <div className="dossier-section-head">
                <div className="dossier-section-eyebrow">08 — 创新类型</div>
                <h2 className="dossier-section-title">用户想要的是哪种创新</h2>
                <p className="dossier-section-sub">用户声音按 PM 打的创新类型聚合。占比最小的那种 = 还没被卷的差异化方向。</p>
              </div>
              <div className="dossier-section-body">
                <InnovationDonut innovationList={stats.innovationList} />
              </div>
            </section>

            {/* 09 机会四象限 */}
            <section className="dossier-section">
              <div className="dossier-section-head">
                <div className="dossier-section-eyebrow">09 — 机会四象限</div>
                <h2 className="dossier-section-title">痛点频率 × 竞品覆盖</h2>
                <p className="dossier-section-sub">右上是值得立项的空白区——高频痛点但主流竞品没在主打。</p>
              </div>
              <div className="dossier-section-body">
                <OpportunityGrid topPains={stats.topPains} commonTags={stats.commonTags} openOpportunities={stats.openOpportunities} />
              </div>
            </section>

            {/* footer */}
            <section className="dossier-footer">
              <div className="dossier-footer-meta">
                数据范围：{stats.productsTotal} 款竞品 · {stats.demandsTotal} 条用户声音 ·
                基于调研项目「{research?.title || "未命名"}」绑定关系实时生成
              </div>
              <div className="dossier-footer-disclaimer">
                AI 仅参与：痛点关键词归并、通用/差异卖点判定、Hero 一句话洞察生成。所有数字均为规则聚合，不做主观判断。
              </div>
            </section>
          </div>
        </div>

        <div className="dossier-modal-footer">
          <div className="dossier-modal-footer-meta">
            <Icon name="sparkles" size={12} />
            <span>9 个分析维度 · 基于 {stats.productsTotal} 竞品 + {stats.demandsTotal} 用户声音实时生成</span>
          </div>
          <div className="dossier-modal-footer-actions">
            <button type="button" className="dossier-hero-back" onClick={onClose}>关闭</button>
            <button type="button" className="dossier-hero-export" onClick={handleExport}>
              <Icon name="download" size={12} /> 导出 HTML
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

globalThis.ResearchDossier = ResearchDossier;
