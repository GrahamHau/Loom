// Deterministic fallback for broad RSS sources that mix macro/finance/energy
// news into the imaging accessories stream. If obvious off-domain terms are
// present and no imaging/consumer-electronics signal exists, hide the item.
const OFF_DOMAIN_PATTERN = /煤化工|煤炭|原油|油价|石油|天然气|有色金属|锡价|铜价|铝价|钢价|外汇|汇率|日元|欧元|美元兑|人民币汇率|公募|私募|基金发行|股市|A股|港股|美股|证券|期货|债券|楼市|房地产|存款利率|降息|加息|央行|银行存款|民营银行|信贷|GDP|CPI|PPI|通胀|宏观经济|财政|OLED发光材料|面板价格|存储器涨价/;
const DOMAIN_SIGNAL_PATTERN = /相机|镜头|无人机|云台|补光灯|灯光|三脚架|脚架|手机夹|支架|麦克风|收音|稳定器|手柄|拍摄|影像|摄影|vlog|gopro|dji|大疆|insta360|影石|smallrig|斯莫格|ulanzi|运动相机|拍照|直播|创作者|画质|防抖|快拆|磁吸|相机配件|camera|lens|gimbal|tripod|drone/i;
const NEGATED_DOMAIN_SIGNAL_PATTERN = /[^。；;,.，、]{0,24}(?:相机|镜头|无人机|云台|补光灯|灯光|三脚架|脚架|手机夹|支架|麦克风|收音|稳定器|手柄|拍摄|影像|摄影|泛3C|相机配件|camera|lens|gimbal|tripod|drone)[^。；;,.，、]{0,24}(?:无关|不相关|不涉及|没有关系)/gi;

export function isOffDomainNoise(title = "", content = "") {
  const text = `${title}\n${content}`;
  if (!OFF_DOMAIN_PATTERN.test(text)) return false;
  const positiveSignalText = text.replace(NEGATED_DOMAIN_SIGNAL_PATTERN, " ");
  return !DOMAIN_SIGNAL_PATTERN.test(positiveSignalText);
}
