import { mutate } from "../server/repository.js";

const sources = [
  {
    id: "rss-google-accessory-launches",
    name: "配件竞品新品 - Google News",
    url: "https://news.google.com/rss/search?q=(SmallRig%20OR%20NEEWER%20OR%20Tilta%20OR%20%22K%26F%20CONCEPT%22%20OR%20Godox%20OR%20Nanlite%20OR%20Zhiyun)%20(new%20OR%20launch%20OR%20announces%20OR%20unveils%20OR%20release)&hl=en-US&gl=US&ceid=US:en",
    interval: 60,
    active: true,
    group: "competitor-accessories",
  },
  {
    id: "rss-google-camera-launches",
    name: "主机品牌新品 - Google News",
    url: "https://news.google.com/rss/search?q=(DJI%20OR%20Insta360%20OR%20GoPro%20OR%20Apple%20OR%20Sony%20OR%20Canon%20OR%20Nikon%20OR%20Fujifilm%20OR%20Panasonic%20OR%20LUMIX)%20(camera%20OR%20drone%20OR%20gimbal)%20(new%20OR%20launch%20OR%20announces%20OR%20unveils%20OR%20release)&hl=en-US&gl=US&ceid=US:en",
    interval: 60,
    active: true,
    group: "host-brands",
  },
  {
    id: "rss-neewer-news",
    name: "NEEWER News",
    url: "https://neewer.com/blogs/news.atom",
    interval: 240,
    active: true,
    group: "competitor-accessories",
  },
  {
    id: "rss-tilta-feed",
    name: "Tilta Feed",
    url: "https://tilta.com/feed/",
    interval: 240,
    active: false,
    group: "competitor-accessories",
    last_error: "Disabled: VPS receives 403; covered by Google News source",
  },
  {
    id: "rss-apple-newsroom",
    name: "Apple Newsroom",
    url: "https://www.apple.com/newsroom/rss-feed.rss",
    interval: 240,
    active: true,
    group: "host-brands",
  },
  {
    id: "rss-sony-alpha-rumors",
    name: "Sony Alpha Rumors",
    url: "https://www.sonyalpharumors.com/feed/",
    interval: 240,
    active: true,
    group: "host-brands",
  },
  {
    id: "rss-canon-watch",
    name: "Canon Watch",
    url: "https://www.canonwatch.com/feed/",
    interval: 240,
    active: true,
    group: "host-brands",
  },
  {
    id: "rss-nikon-rumors",
    name: "Nikon Rumors",
    url: "https://nikonrumors.com/feed/",
    interval: 240,
    active: true,
    group: "host-brands",
  },
  {
    id: "rss-fuji-rumors",
    name: "Fuji Rumors",
    url: "https://www.fujirumors.com/feed/",
    interval: 240,
    active: true,
    group: "host-brands",
  },
  {
    id: "rss-43-rumors",
    name: "43 Rumors / LUMIX",
    url: "https://www.43rumors.com/feed/",
    interval: 240,
    active: true,
    group: "host-brands",
  },
];

const brokenUrls = new Set([
  "https://www.dji.com/cn/newsroom/rss.xml",
  "https://aputure.com/blog/feed/",
  "https://tilta.com/feed/",
  "https://www.canonrumors.com/feed/",
]);

const result = mutate((state) => {
  state.rssSources ||= [];
  let added = 0;
  let updated = 0;
  let disabled = 0;

  for (const source of state.rssSources) {
    if (brokenUrls.has(source.url)) {
      source.active = false;
      source.last_error ||= "Disabled: feed URL returns 404";
      disabled += 1;
    }
  }

  for (const source of sources) {
    const existing = state.rssSources.find((item) => item.id === source.id || item.url === source.url);
    if (existing) {
      Object.assign(existing, source, {
        id: existing.id || source.id,
        updated_at: new Date().toISOString(),
      });
      updated += 1;
    } else {
      state.rssSources.unshift({
        ...source,
        type: "rss",
        last_fetched_at: null,
        last_error: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      added += 1;
    }
  }

  return {
    added,
    updated,
    disabled,
    total: state.rssSources.length,
    active: state.rssSources.filter((source) => source.active !== false).length,
  };
});

console.log(JSON.stringify(result, null, 2));
