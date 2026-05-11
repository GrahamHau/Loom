import { randomUUID } from "node:crypto";
import { db, migrate } from "../server/db.js";

const SOURCES = [
  { name: "Godox · 英文新品动态", url: "https://news.google.com/rss/search?q=Godox+new+product+LED+light+flash&hl=en-US&gl=US&ceid=US:en", fetch_interval: 60, group: "competitor", brand: "Godox" },
  { name: "Godox · 中文新品动态", url: "https://news.google.com/rss/search?q=神牛+Godox+新品+发布&hl=zh-CN&gl=CN&ceid=CN:zh-Hans", fetch_interval: 60, group: "competitor", brand: "Godox" },
  { name: "Neewer · 新品动态", url: "https://news.google.com/rss/search?q=Neewer+new+LED+light+launch+release&hl=en-US&gl=US&ceid=US:en", fetch_interval: 90, group: "competitor", brand: "Neewer" },
  { name: "SmallRig · Blog RSS", url: "https://www.smallrig.com/blog/feed/", fetch_interval: 120, group: "competitor", brand: "SmallRig" },
  { name: "SmallRig · Google News", url: "https://news.google.com/rss/search?q=SmallRig+new+cage+rig+release&hl=en-US&gl=US&ceid=US:en", fetch_interval: 90, group: "competitor", brand: "SmallRig" },
  { name: "DJI · 英文新品动态", url: "https://news.google.com/rss/search?q=DJI+new+product+launch+camera+drone&hl=en-US&gl=US&ceid=US:en", fetch_interval: 60, group: "competitor", brand: "DJI" },
  { name: "DJI · 中文新品动态", url: "https://news.google.com/rss/search?q=大疆+DJI+新品+发布+2025+2026&hl=zh-CN&gl=CN&ceid=CN:zh-Hans", fetch_interval: 60, group: "competitor", brand: "DJI" },
  { name: "Zhiyun · 新品动态", url: "https://news.google.com/rss/search?q=Zhiyun+gimbal+stabilizer+new+launch&hl=en-US&gl=US&ceid=US:en", fetch_interval: 90, group: "competitor", brand: "Zhiyun" },
  { name: "Zhiyun · 中文动态", url: "https://news.google.com/rss/search?q=智云+Zhiyun+新品+稳定器&hl=zh-CN&gl=CN&ceid=CN:zh-Hans", fetch_interval: 120, group: "competitor", brand: "Zhiyun" },
  { name: "RØDE · 麦克风动态", url: "https://news.google.com/rss/search?q=RODE+microphone+wireless+new+launch&hl=en-US&gl=US&ceid=US:en", fetch_interval: 120, group: "competitor", brand: "RODE" },
  { name: "Aputure · 新品动态", url: "https://news.google.com/rss/search?q=Aputure+light+new+release+launch&hl=en-US&gl=US&ceid=US:en", fetch_interval: 120, group: "competitor", brand: "Aputure" },
  { name: "Aputure · 中文动态", url: "https://news.google.com/rss/search?q=爱图仕+Aputure+新品&hl=zh-CN&gl=CN&ceid=CN:zh-Hans", fetch_interval: 120, group: "competitor", brand: "Aputure" },
  { name: "K&F Concept · 新品动态", url: "https://news.google.com/rss/search?q=%22K%26F+Concept%22+new+filter+tripod+lens&hl=en-US&gl=US&ceid=US:en", fetch_interval: 120, group: "competitor", brand: "KF" },
  { name: "品类 · LED Video Light 英文", url: "https://news.google.com/rss/search?q=LED+video+light+portable+new+launch&hl=en-US&gl=US&ceid=US:en", fetch_interval: 60, group: "category", brand: null },
  { name: "品类 · 补光灯 中文", url: "https://news.google.com/rss/search?q=补光灯+便携灯+新品+发布&hl=zh-CN&gl=CN&ceid=CN:zh-Hans", fetch_interval: 60, group: "category", brand: null },
  { name: "品类 · Bi-Color RGB Light", url: "https://news.google.com/rss/search?q=RGB+bi-color+video+light+new+2025+2026&hl=en-US&gl=US&ceid=US:en", fetch_interval: 90, group: "category", brand: null },
  { name: "品类 · Gimbal Stabilizer", url: "https://news.google.com/rss/search?q=camera+phone+gimbal+stabilizer+new+launch&hl=en-US&gl=US&ceid=US:en", fetch_interval: 90, group: "category", brand: null },
  { name: "品类 · Tripod & Mount", url: "https://news.google.com/rss/search?q=camera+tripod+phone+mount+desk+stand+new&hl=en-US&gl=US&ceid=US:en", fetch_interval: 120, group: "category", brand: null },
  { name: "品类 · Camera Cage & Rig", url: "https://news.google.com/rss/search?q=camera+cage+shoulder+rig+follow+focus+monitor+new&hl=en-US&gl=US&ceid=US:en", fetch_interval: 120, group: "category", brand: null },
  { name: "品类 · Wireless Mic & Lavalier", url: "https://news.google.com/rss/search?q=wireless+microphone+lavalier+clip-on+new+launch&hl=en-US&gl=US&ceid=US:en", fetch_interval: 90, group: "category", brand: null },
  { name: "品类 · 无线麦克风 中文", url: "https://news.google.com/rss/search?q=无线麦克风+领夹+新品+发布&hl=zh-CN&gl=CN&ceid=CN:zh-Hans", fetch_interval: 120, group: "category", brand: null },
  { name: "品类 · Smartphone Photo Accessory", url: "https://news.google.com/rss/search?q=smartphone+photography+accessory+mount+lens+new&hl=en-US&gl=US&ceid=US:en", fetch_interval: 120, group: "category", brand: null },
  { name: "趋势 · Creator Economy 影像", url: "https://news.google.com/rss/search?q=content+creator+camera+gear+trend+2026&hl=en-US&gl=US&ceid=US:en", fetch_interval: 180, group: "category", brand: null },
  { name: "趋势 · 摄影器材 行业趋势", url: "https://news.google.com/rss/search?q=摄影器材+行业+趋势+市场+2025+2026&hl=zh-CN&gl=CN&ceid=CN:zh-Hans", fetch_interval: 180, group: "category", brand: null },
  { name: "Kickstarter · Design（最新）", url: "https://www.kickstarter.com/projects/feed.atom?category=design&sort=newest", fetch_interval: 120, group: "crowdfunding", brand: null },
  { name: "Kickstarter · Technology（最新）", url: "https://www.kickstarter.com/projects/feed.atom?category=technology&sort=newest", fetch_interval: 120, group: "crowdfunding", brand: null },
  { name: "Kickstarter · Product Design（最新）", url: "https://www.kickstarter.com/projects/feed.atom?category=product+design&sort=newest", fetch_interval: 180, group: "crowdfunding", brand: null },
  { name: "Indiegogo · Camera & Photo", url: "https://news.google.com/rss/search?q=Indiegogo+camera+photography+accessory+new&hl=en-US&gl=US&ceid=US:en", fetch_interval: 180, group: "crowdfunding", brand: null },
  { name: "PetaPixel", url: "https://petapixel.com/feed/", fetch_interval: 60, group: "media", brand: null },
  { name: "DPReview", url: "https://www.dpreview.com/feeds/news", fetch_interval: 60, group: "media", brand: null },
  { name: "Imaging Resource", url: "https://www.imaging-resource.com/feed/", fetch_interval: 90, group: "media", brand: null },
  { name: "Newsshooter", url: "https://www.newsshooter.com/feed/", fetch_interval: 120, group: "media", brand: null },
  { name: "YM Cinema", url: "https://ymcinema.com/feed/", fetch_interval: 120, group: "media", brand: null },
  { name: "No Film School", url: "https://nofilmschool.com/feed", fetch_interval: 120, group: "media", brand: null },
  { name: "Fuji Rumors", url: "https://www.fujirumors.com/feed/", fetch_interval: 120, group: "media", brand: null },
  { name: "SonyAlphaRumors", url: "https://www.sonyalpharumors.com/feed/", fetch_interval: 120, group: "media", brand: null },
  { name: "爱范儿", url: "https://www.ifanr.com/feed", fetch_interval: 60, group: "media", brand: null },
  { name: "36Kr · 硬件", url: "https://36kr.com/feed", fetch_interval: 60, group: "media", brand: null },
  { name: "影视工业网", url: "https://www.moviemeter.cn/feed", fetch_interval: 120, group: "media", brand: null },
];

migrate();

db.exec("DELETE FROM news_sources");

const insert = db.prepare(`
  INSERT OR IGNORE INTO news_sources
    (id, user_id, name, url, type, language, authority, group_name, source_group, brand, fetch_interval, is_active, last_item_count)
  VALUES
    (@id, 'default', @name, @url, 'rss', '', 'watchlist', @group, @group, @brand, @fetch_interval, 1, 0)
`);

const insertMany = db.transaction((sources) => {
  let count = 0;
  for (const source of sources) {
    const result = insert.run({
      id: randomUUID(),
      ...source,
      brand: source.brand || "",
    });
    if (result.changes > 0) count += 1;
  }
  return count;
});

const inserted = insertMany(SOURCES);
console.log(`✓ 数据源 seed 完成：新增 ${inserted} 个，总计 ${SOURCES.length} 个已定义`);
console.log("\n数据源分布：");
const groups = {};
for (const source of SOURCES) {
  groups[source.group] = (groups[source.group] || 0) + 1;
}
for (const [group, count] of Object.entries(groups)) {
  console.log(`  ${group.padEnd(14)} ${count} 个`);
}
