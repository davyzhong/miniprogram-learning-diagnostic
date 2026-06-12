const FALLBACK_NAME = '待确认卡点';

function summarizeBottleneckName(value) {
  let text = String(value || '')
    .replace(/LP-[A-Z0-9-]+/g, '')
    .replace(/[（(][^（）()]*[）)]/g, '')
    .replace(/\s+/g, '')
    .replace(/[，,。；;：:、]+$/g, '')
    .trim();

  if (!text) return FALLBACK_NAME;

  for (const suffix of ['错误', '失败', '混淆', '不足']) {
    if (text.endsWith(suffix) && text.length > 4) {
      const base = text.slice(0, -suffix.length);
      if (base.length >= 4) text = base;
      break;
    }
  }

  return text.length > 10 ? `${text.slice(0, 10)}…` : text;
}

function uniqueBottleneckSummaries(items = []) {
  const names = [];
  const seen = new Set();
  for (const item of items) {
    const name = summarizeBottleneckName(
      typeof item === 'string' ? item : item && (item.displayName || item.lpName || item.name)
    );
    if (seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

module.exports = {
  FALLBACK_NAME,
  summarizeBottleneckName,
  uniqueBottleneckSummaries,
};
