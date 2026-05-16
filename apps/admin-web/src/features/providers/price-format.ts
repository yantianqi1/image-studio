export function formatPriceCents(value: number) {
  if (value === 0) {
    return "免费";
  }
  return `¥${(value / 100).toFixed(2)} / ${(value / 10).toFixed(1)} 额度`;
}

export function formatPriceRange(values: readonly number[]) {
  if (values.length === 0) {
    return "未配置";
  }
  const sorted = [...values].sort((left, right) => left - right);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  if (min === max) {
    return formatPriceCents(min);
  }
  return `${formatPriceCents(min)} - ${formatPriceCents(max)}`;
}
