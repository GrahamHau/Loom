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
    name: "主机品牌",
    tone: "outline",
    tags: [
      "影石",
      "GoPro",
      "Apple",
      "Sony",
      "Canon",
      "Nikon",
      "Fujifilm",
      "Panasonic",
      "LUMIX",
    ],
  },
  { key: "product_categories", name: "产品品类", tone: "default", tags: ["灯光", "稳定器", "三脚架", "镜头", "麦克风", "相机配件", "运动相机", "无人机"] },
  { key: "scenarios", name: "使用场景", tone: "accent", tags: ["Vlog/自拍", "直播/带货", "短视频创作", "户外旅拍", "室内棚拍", "桌面俯拍", "运动/极限拍摄", "会议/活动记录", "产品摄影", "延时/慢动作", "街拍/纪实", "教育/网课"] },
  { key: "painpoints", name: "用户痛点", tone: "danger", tags: ["携带不便/太重", "续航不足", "操作复杂/学习成本高", "画质不够", "防抖不足", "散热过热", "噪音大", "兼容性差", "配件缺失/需另购", "安装固定麻烦", "调光/调色不精准", "无线连接不稳定", "收纳困难", "价格过高/性价比低", "做工质感差"] },
  { key: "innovation_types", name: "创新类型", tone: "success", tags: ["技术创新", "使用方式创新", "形态创新", "场景拓展", "生态整合", "性价比创新"] },
  { key: "custom_tags", name: "自定义标签", tone: "outline", tags: ["便携", "高显色", "模块化", "磁吸", "手机摄影"] },
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
  if (key === "brands") {
    const competitorBrands = normalized.find((group) => group.key === "competitor_brands")?.tags || [];
    const cameraBrands = normalized.find((group) => group.key === "camera_brands")?.tags || [];
    return JSON.stringify([...competitorBrands, ...cameraBrands]);
  }
  const match = normalized.find((group) => group.key === key);
  return JSON.stringify(match?.tags || []);
}
