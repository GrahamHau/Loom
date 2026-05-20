export const DEFAULT_TAG_GROUPS = [
  {
    key: "competitor_brands",
    name: "竞品品牌",
    tone: "outline",
    tags: [
      "Ulanzi",
      "DJI",
      "Insta360",
      "SmallRig",
      "NEEWER",
      "Tilta",
      "K&F CONCEPT",
      "Godox",
      "Nanlite",
      "Zhiyun",
      "智云",
      "Aputure",
      "Rode",
      "RODE",
    ],
  },
  {
    key: "camera_brands",
    name: "主机",
    tone: "outline",
    tags: [
      "Osmo Pocket 3",
      "Osmo Action 5 Pro",
      "Osmo Action 4",
      "Osmo Mobile 7P",
      "Osmo Mobile 7",
      "DJI Mini 4 Pro",
      "DJI Air 3S",
      "DJI Flip",
      "DJI Neo",
      "Insta360 Ace Pro 2",
      "Insta360 Ace Pro",
      "Insta360 X5",
      "Insta360 GO 3",
      "Insta360 GO 3S",
      "Insta360 X4",
      "Insta360 Flow 2 Pro",
      "Insta360 Flow 2",
      "Insta360 Flow Pro",
    ],
  },
  {
    key: "product_categories",
    name: "产品品类",
    tone: "default",
    tags: [
      "A音视频类",
      "B箱包带类",
      "C配件类",
      "E供电类",
      "L灯光类",
      "T脚架类",
      "S支架类",
      "I智能工作室",
      "X其他类",
    ],
  },
  { key: "scenarios", name: "使用场景", tone: "accent", tags: [] },
  { key: "painpoints", name: "用户痛点", tone: "danger", tags: [] },
  { key: "innovation_types", name: "创新类型", tone: "success", tags: [] },
];

export function normalizeTagGroups(groups) {
  const input = Array.isArray(groups) ? groups : [];
  const legacyBrands = input.find((item) => item?.key === "brands" || item?.name === "品牌字段");
  const legacyBrandTags = Array.isArray(legacyBrands?.tags) ? legacyBrands.tags.filter(Boolean).map(String) : [];
  const defaultCompetitorBrands = DEFAULT_TAG_GROUPS.find((group) => group.key === "competitor_brands")?.tags || [];
  const defaultCameraBrands = DEFAULT_TAG_GROUPS.find((group) => group.key === "camera_brands")?.tags || [];
  return DEFAULT_TAG_GROUPS.map((group) => {
    const match = input.find((item) => item?.key === group.key || item?.name === group.name);
    let tags = Array.isArray(match?.tags) ? match.tags.filter(Boolean).map(String) : group.tags;
    if (!match && legacyBrandTags.length) {
      if (group.key === "competitor_brands") {
        tags = legacyBrandTags.filter((tag) => defaultCompetitorBrands.includes(tag));
      }
      if (group.key === "camera_brands") {
        tags = legacyBrandTags.filter((tag) => defaultCameraBrands.includes(tag));
      }
    }
    return {
      key: group.key,
      name: group.name,
      tone: match?.tone || group.tone,
      tags,
    };
  });
}

export function tagListText(groups, key) {
  const normalized = normalizeTagGroups(groups);
  const match = normalized.find((group) => group.key === key);
  return JSON.stringify(match?.tags || []);
}
