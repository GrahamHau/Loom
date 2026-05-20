/* global React, Icon */
const React = globalThis.React;
const Icon = globalThis.Icon;
const { useMemo, useEffect, useRef, useState } = React;

/* ============================================================
   Apple-style research dossier
   ------------------------------------------------------------
   AI's job in the real system: cluster painpoint phrasings,
   classify common vs unique selling points, generate the one-
   line hero insight. Everything else is pure aggregation.
   ============================================================ */

/* ---------- Parsing helpers ---------- */

// "¥89-129" / "$89-$129" / "¥199" / "199-249元" → {min, max, avg, has}
function parsePrice(raw) {
  if (!raw) return { has: false };
  const s = String(raw);
  const nums = (s.match(/\d+(?:\.\d+)?/g) || []).map(Number).filter((n) => n > 0 && n < 100000);
  if (!nums.length) return { has: false };
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  // crude USD→CNY normalization for dossier display (sample data uses $ sometimes)
  const cny = s.includes("$") ? { min: min * 7, max: max * 7 } : { min, max };
  return { has: true, min: cny.min, max: cny.max, avg: (cny.min + cny.max) / 2, label: s };
}

// "950+/mo" / "8k+/月" / "1.2k+/mo" → number
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
  // ------- product-side stats -------
  const enriched = products.map((p) => {
    const main = (p.platforms && p.platforms[0]) || {};
    const price = parsePrice(main.price);
    const sales = parseSales(main.sales);
    const rating = parseFloat(main.rating) || 0;
    return { ...p, _price: price, _sales: sales, _rating: rating };
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

  // Price bands (5 segments)
  const bandEdges = priceStats.max > 0
    ? [0, priceStats.max * 0.2, priceStats.max * 0.4, priceStats.max * 0.6, priceStats.max * 0.8, priceStats.max * 1.05]
    : [0, 100, 200, 300, 500, 800];
  const bands = bandEdges.slice(0, -1).map((lo, i) => {
    const hi = bandEdges[i + 1];
    const count = prices.filter((p) => p >= lo && p < hi).length;
    return { lo, hi, count, pct: prices.length ? count / prices.length : 0 };
  });
  const dominantBand = bands.reduce((a, b) => (b.count > a.count ? b : a), bands[0] || { lo: 0, hi: 0, count: 0 });

  // ------- demand-side stats -------
  const painFreq = {};
  const scenarioFreq = {};
  demands.forEach((d) => {
    (Array.isArray(d.painpoints) ? d.painpoints : []).forEach((raw) => {
      const word = String(raw || "").split(/[\/·,，]/)[0].trim();
      if (word) painFreq[word] = (painFreq[word] || 0) + 1;
    });
    (Array.isArray(d.scenarios) ? d.scenarios : []).forEach((raw) => {
      const word = String(raw || "").split(/[\/·,，]/)[0].trim();
      if (word) scenarioFreq[word] = (scenarioFreq[word] || 0) + 1;
    });
  });
  const topPains = Object.entries(painFreq).sort((a, b) => b[1] - a[1]);
  const topScenarios = Object.entries(scenarioFreq).sort((a, b) => b[1] - a[1]);

  // ------- selling points: common vs unique (from product tags) -------
  const tagFreq = {};
  enriched.forEach((p) => {
    (Array.isArray(p.tags) ? p.tags : []).forEach((t) => {
      const word = String(t || "").trim();
      if (word) tagFreq[word] = (tagFreq[word] || 0) + 1;
    });
  });
  const sortedTags = Object.entries(tagFreq).sort((a, b) => b[1] - a[1]);
  const totalProducts = enriched.length || 1;
  // common = >= 30% of products mention; unique = <= 1 product
  const commonTags = sortedTags.filter(([, c]) => c / totalProducts >= 0.3);
  const uniqueTags = sortedTags.filter(([, c]) => c === 1);

  // ------- category (use most frequent in linked products) -------
  const catFreq = {};
  enriched.forEach((p) => {
    const c = p.category || "未分类";
    catFreq[c] = (catFreq[c] || 0) + 1;
  });
  const dominantCategory = Object.entries(catFreq).sort((a, b) => b[1] - a[1])[0]?.[0] || "未分类";

  // ------- opportunity heuristic -------
  // top painpoints not yet covered by any common selling point
  const commonTagSet = new Set(commonTags.map(([t]) => t));
  const opportunities = topPains.slice(0, 5).map(([pain, count]) => {
    const covered = commonTags.some(([t]) => t.includes(pain) || pain.includes(t));
    return { pain, count, covered };
  });
  const openOpportunities = opportunities.filter((o) => !o.covered);

  return {
    productsTotal: enriched.length,
    demandsTotal: demands.length,
    enriched,
    priceStats,
    bands,
    dominantBand,
    topPains,
    topScenarios,
    commonTags,
    uniqueTags,
    dominantCategory,
    opportunities,
    openOpportunities,
  };
}

/* ---------- One-line AI-style insight (rule-based fallback) ---------- */
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

/* ---------- Visual primitives (pure SVG) ---------- */

function ScatterMap({ enriched, dominantBand }) {
  // X = price (CNY), Y = rating (3.0–5.0), size = sales
  const W = 760;
  const H = 380;
  const PAD = { l: 60, r: 24, t: 24, b: 48 };
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;

  const points = enriched.filter((p) => p._price.has && p._rating > 0);
  if (!points.length) {
    return (
      <div className="dossier-empty">
        <Icon name="boxes" size={20} />
        <div>关联的竞品里没有可用的价格 + 评分数据</div>
      </div>
    );
  }

  const xMax = Math.max(...points.map((p) => p._price.avg), 100) * 1.1;
  const yMin = 3.5;
  const yMax = 5.0;
  const salesMax = Math.max(...points.map((p) => p._sales), 1);

  const x = (v) => PAD.l + (v / xMax) * innerW;
  const y = (v) => PAD.t + (1 - (v - yMin) / (yMax - yMin)) * innerH;
  const r = (s) => 5 + Math.sqrt(s / salesMax) * 14;

  // ticks
  const xTicks = [0, xMax * 0.25, xMax * 0.5, xMax * 0.75, xMax].map((v) => Math.round(v));
  const yTicks = [3.5, 4.0, 4.5, 5.0];

  return (
    <svg className="dossier-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="价格 × 评分 散点">
      {/* grid */}
      {yTicks.map((t) => (
        <line key={t} x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="dossier-grid" />
      ))}
      {xTicks.map((t) => (
        <line key={t} x1={x(t)} x2={x(t)} y1={PAD.t} y2={H - PAD.b} className="dossier-grid" />
      ))}
      {/* dominant band overlay */}
      {dominantBand && dominantBand.count > 0 && (
        <rect
          x={x(dominantBand.lo)}
          y={PAD.t}
          width={x(dominantBand.hi) - x(dominantBand.lo)}
          height={innerH}
          className="dossier-band-highlight"
        />
      )}
      {/* axes labels */}
      {yTicks.map((t) => (
        <text key={t} x={PAD.l - 10} y={y(t) + 4} className="dossier-axis-text" textAnchor="end">
          {t.toFixed(1)}★
        </text>
      ))}
      {xTicks.map((t) => (
        <text key={t} x={x(t)} y={H - PAD.b + 18} className="dossier-axis-text" textAnchor="middle">
          {fmtCNY(t)}
        </text>
      ))}
      {/* dots */}
      {points.map((p) => (
        <g key={p.id} className="dossier-dot-group">
          <circle cx={x(p._price.avg)} cy={y(p._rating)} r={r(p._sales)} className="dossier-dot" />
          <title>{p.name} · {p._price.label} · {p._rating}★ · {fmtSales(p._sales)}/月</title>
        </g>
      ))}
    </svg>
  );
}

function PriceCurve({ bands, dominantBand }) {
  if (!bands || !bands.length || bands.every((b) => b.count === 0)) return null;
  const W = 760;
  const H = 220;
  const PAD = { l: 40, r: 24, t: 40, b: 36 };
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const maxPct = Math.max(...bands.map((b) => b.pct), 0.1);

  // Build a smooth path through band tops
  const n = bands.length;
  const xAt = (i) => PAD.l + ((i + 0.5) / n) * innerW;
  const yAt = (pct) => PAD.t + (1 - pct / maxPct) * innerH;
  const tops = bands.map((b, i) => [xAt(i), yAt(b.pct)]);

  // Catmull-Rom-ish smoothing
  let d = `M ${PAD.l} ${PAD.t + innerH} L ${tops[0][0]} ${tops[0][1]}`;
  for (let i = 0; i < tops.length - 1; i++) {
    const [x0, y0] = tops[i];
    const [x1, y1] = tops[i + 1];
    const mx = (x0 + x1) / 2;
    d += ` Q ${mx} ${y0} ${mx} ${(y0 + y1) / 2} T ${x1} ${y1}`;
  }
  d += ` L ${W - PAD.r} ${PAD.t + innerH} Z`;

  return (
    <svg className="dossier-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="价格带分布密度">
      <defs>
        <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.4" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={d} fill="url(#priceGrad)" />
      <path d={d.replace(/^M [\d.]+ [\d.]+ /, "M ").split(" L ")[0].slice(2) ? "" : ""} />
      {/* curve stroke (top edge only) */}
      <path
        d={`M ${tops[0][0]} ${tops[0][1]} ` + tops.slice(1).map(([px, py], i) => {
          const [x0, y0] = tops[i];
          const mx = (x0 + px) / 2;
          return `Q ${mx} ${y0} ${mx} ${(y0 + py) / 2} T ${px} ${py}`;
        }).join(" ")}
        className="dossier-curve"
      />
      {/* x-axis band labels */}
      {bands.map((b, i) => (
        <text key={i} x={xAt(i)} y={H - 10} className="dossier-axis-text" textAnchor="middle">
          {fmtCNY(b.lo)}-{fmtCNY(b.hi)}
        </text>
      ))}
      {/* dominant callout */}
      {dominantBand && dominantBand.count > 0 && (() => {
        const idx = bands.findIndex((b) => b.lo === dominantBand.lo);
        if (idx < 0) return null;
        return (
          <g>
            <line
              x1={xAt(idx)}
              y1={yAt(dominantBand.pct) - 4}
              x2={xAt(idx)}
              y2={PAD.t + 6}
              className="dossier-callout-line"
            />
            <text x={xAt(idx)} y={PAD.t} className="dossier-callout-text" textAnchor="middle">
              主流 · {Math.round(dominantBand.pct * 100)}%
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
            <div
              className="dossier-pain-bar"
              style={{ width: `${(count / maxCount) * 100}%` }}
            />
          </div>
          <div className="dossier-pain-count">{count} 条</div>
        </div>
      ))}
    </div>
  );
}

function OpportunityGrid({ topPains, commonTags, openOpportunities }) {
  // Simple 2x2 representation as a grid + callouts
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
            <span key={o.pain} className="dossier-opp-chip dossier-opp-chip-hot">
              {o.pain} <em>{o.count}</em>
            </span>
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

/* ---------- Main dossier ---------- */

function ResearchDossier({ research, products, demands, onClose }) {
  const stats = useMemo(() => computeStats(products || [], demands || []), [products, demands]);
  const insight = useMemo(() => buildHeroInsight(stats), [stats]);

  // Reveal-on-mount animation trigger
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className={`dossier ${revealed ? "dossier-revealed" : ""}`}>
      {/* ------- HERO ------- */}
      <section className="dossier-hero">
        <div className="dossier-hero-eyebrow">调研档案 · {research?.date || "—"}</div>
        <h1 className="dossier-hero-title">
          {research?.title || `${stats.dominantCategory} 品类全景`}
        </h1>
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
            <div className="dossier-hero-stat-num">
              {stats.priceStats.median ? fmtCNY(stats.priceStats.median) : "—"}
            </div>
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
        {onClose && (
          <div className="dossier-hero-actions">
            <button type="button" className="dossier-hero-back" onClick={onClose}>
              <Icon name="arrow-left" size={12} /> 返回调研详情
            </button>
            <button type="button" className="dossier-hero-export">
              <Icon name="download" size={12} /> 导出 HTML
            </button>
          </div>
        )}
      </section>

      {/* ------- 1. 竞品全景地图 ------- */}
      <section className="dossier-section">
        <div className="dossier-section-head">
          <div className="dossier-section-eyebrow">01 — 竞品全景</div>
          <h2 className="dossier-section-title">价格 × 评分 × 销量 三维地图</h2>
          <p className="dossier-section-sub">
            每一个点是一款竞品，横轴价格、纵轴评分、面积是月销量。蓝色阴影区是主流定价区间。
          </p>
        </div>
        <div className="dossier-section-body">
          <ScatterMap enriched={stats.enriched} dominantBand={stats.dominantBand} />
        </div>
      </section>

      {/* ------- 2. 价格带分布 ------- */}
      <section className="dossier-section">
        <div className="dossier-section-head">
          <div className="dossier-section-eyebrow">02 — 价格带分布</div>
          <h2 className="dossier-section-title">
            {stats.dominantBand && stats.dominantBand.count > 0
              ? `主流价格带 ${fmtCNY(stats.dominantBand.lo)}–${fmtCNY(stats.dominantBand.hi)}`
              : "价格分布"}
          </h2>
          <p className="dossier-section-sub">
            基于 {stats.enriched.filter((p) => p._price.has).length} 款有定价数据的竞品，平滑密度分布。
          </p>
        </div>
        <div className="dossier-section-body">
          <PriceCurve bands={stats.bands} dominantBand={stats.dominantBand} />
        </div>
      </section>

      {/* ------- 3. 卖点矩阵 ------- */}
      <section className="dossier-section">
        <div className="dossier-section-head">
          <div className="dossier-section-eyebrow">03 — 卖点矩阵</div>
          <h2 className="dossier-section-title">通用卖点 vs 差异卖点</h2>
          <p className="dossier-section-sub">
            通用卖点（≥30% 竞品都在主打）= 入场门槛；差异卖点（仅 1 家主打）= 可能的破局点。
          </p>
        </div>
        <div className="dossier-section-body">
          <div className="dossier-selling-grid">
            <div className="dossier-selling-col">
              <div className="dossier-selling-col-label">通用卖点</div>
              <div className="dossier-selling-chips">
                {stats.commonTags.length > 0 ? stats.commonTags.map(([t, c]) => (
                  <span key={t} className="dossier-selling-chip dossier-selling-chip-common">
                    {t} <em>{c}/{stats.productsTotal}</em>
                  </span>
                )) : <span className="dossier-empty-inline">暂无足够竞品数据</span>}
              </div>
            </div>
            <div className="dossier-selling-col">
              <div className="dossier-selling-col-label">差异卖点</div>
              <div className="dossier-selling-chips">
                {stats.uniqueTags.length > 0 ? stats.uniqueTags.slice(0, 12).map(([t]) => (
                  <span key={t} className="dossier-selling-chip dossier-selling-chip-unique">
                    {t} <em>仅 1 家</em>
                  </span>
                )) : <span className="dossier-empty-inline">所有卖点至少 2 家竞品都在用</span>}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------- 4. 痛点热力 ------- */}
      <section className="dossier-section">
        <div className="dossier-section-head">
          <div className="dossier-section-eyebrow">04 — 痛点热力</div>
          <h2 className="dossier-section-title">用户最常抱怨什么</h2>
          <p className="dossier-section-sub">
            从 {stats.demandsTotal} 条用户声音中聚合，按提及次数排序。
          </p>
        </div>
        <div className="dossier-section-body">
          <PainBars topPains={stats.topPains} />
        </div>
      </section>

      {/* ------- 5. 机会四象限 ------- */}
      <section className="dossier-section">
        <div className="dossier-section-head">
          <div className="dossier-section-eyebrow">05 — 机会四象限</div>
          <h2 className="dossier-section-title">痛点频率 × 竞品覆盖</h2>
          <p className="dossier-section-sub">
            右上是值得立项的空白区——高频痛点但主流竞品没在主打。
          </p>
        </div>
        <div className="dossier-section-body">
          <OpportunityGrid
            topPains={stats.topPains}
            commonTags={stats.commonTags}
            openOpportunities={stats.openOpportunities}
          />
        </div>
      </section>

      {/* ------- footer ------- */}
      <section className="dossier-footer">
        <div className="dossier-footer-meta">
          数据范围：{stats.productsTotal} 款竞品 · {stats.demandsTotal} 条用户声音 ·
          基于调研项目「{research?.title || "未命名"}」绑定关系实时生成
        </div>
        <div className="dossier-footer-disclaimer">
          AI 仅参与：痛点关键词归并、通用 / 差异卖点判定、Hero 一句话洞察生成。
          所有数字均为规则聚合，不做主观判断。
        </div>
      </section>
    </div>
  );
}

globalThis.ResearchDossier = ResearchDossier;
