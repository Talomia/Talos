/** Format cost as `$X.XX` or `< $0.01` for tiny amounts. */
export function formatCost(usd: number): string {
  if (usd === 0) {
    return '$0.00';
  }

  if (usd > 0 && usd < 0.01) {
    return '< $0.01';
  }

  return `$${usd.toFixed(2)}`;
}

/** Always show full precision (4 decimal places for sub-cent amounts). */
export function formatCostFull(usd: number): string {
  if (usd === 0) {
    return '$0.00';
  }

  if (usd < 0.01) {
    return `$${usd.toFixed(4)}`;
  }

  return `$${usd.toFixed(2)}`;
}

/** Format large token counts with K/M suffixes. */
export function formatTokenCount(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }

  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}K`;
  }

  return count.toString();
}
