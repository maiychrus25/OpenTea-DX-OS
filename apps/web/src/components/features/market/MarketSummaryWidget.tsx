// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client';

import React from 'react';
import useSWR from 'swr';
import { DollarSign, TrendingUp, Package, BarChart3, Sprout } from 'lucide-react';
import { MetricCard } from '../../ui/MetricCard/MetricCard';
import { SourceBox } from '../../ui/SourceBox/SourceBox';
import styles from './MarketSummaryWidget.module.css';

const fetcher = (url: string) => fetch(url).then(r => r.json());

/**
 * Format a value + unit pair into a human-friendly Vietnamese string.
 * USD values are converted to VND using the live exchange rate.
 */
function formatMetricValue(
  rawValue: number | string,
  unit: string,
  usdToVnd: number | string,
): { displayValue: string; displayUnit: string } {
  if (typeof rawValue !== 'number') return { displayValue: String(rawValue), displayUnit: unit };

  const rate = typeof usdToVnd === 'number' ? usdToVnd : 26000;

  if (unit === 'million_USD') {
    // Convert million USD → VND
    const vndTotal = rawValue * 1_000_000 * rate; // total VND
    if (vndTotal >= 1_000_000_000_000) {
      return {
        displayValue: (vndTotal / 1_000_000_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 }),
        displayUnit: 'nghìn tỷ đồng',
      };
    }
    return {
      displayValue: (vndTotal / 1_000_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 0 }),
      displayUnit: 'tỷ đồng',
    };
  }

  if (unit === 'tonnes') {
    if (rawValue >= 1_000_000) {
      return {
        displayValue: (rawValue / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 2 }),
        displayUnit: 'triệu tấn',
      };
    }
    return {
      displayValue: rawValue.toLocaleString('vi-VN'),
      displayUnit: 'tấn',
    };
  }

  if (unit === 'kg/ha') {
    return {
      displayValue: rawValue.toLocaleString('vi-VN', { maximumFractionDigits: 1 }),
      displayUnit: 'kg/ha',
    };
  }

  return {
    displayValue: rawValue.toLocaleString('vi-VN'),
    displayUnit: unit,
  };
}

export function MarketSummaryWidget({ commodity = 'Gạo' }: { commodity?: string }) {
  const { data: fxData } = useSWR('/api/market-data/fx?pair=USD/VND', fetcher);
  const { data: marketData } = useSWR(`/api/market-data?commodity=${encodeURIComponent(commodity)}`, fetcher);

  const fxValue = fxData?.data?.[0]?.rates?.VND || 'N/A'; 
  const marketRow = marketData?.data?.[0];
  const metricValue = marketRow?.value ?? 'N/A';
  const unit = marketRow?.unit || '';
  const metric = marketRow?.metric || '';

  const { displayValue, displayUnit } = formatMetricValue(metricValue, unit, fxValue);

  // Map metric name -> Vietnamese label
  function getMetricLabel(metricKey: string, commodityName: string): string {
    if (metricKey.startsWith('export_value_to_world'))  return `Giá trị XK ${commodityName}`;
    if (metricKey.startsWith('export_volume_to_world')) return `Khối lượng XK ${commodityName}`;
    if (metricKey === 'cereal_production')              return `Sản lượng ${commodityName}`;
    if (metricKey === 'cereal_yield')                   return `Năng suất ${commodityName}`;
    if (metricKey === 'yield_kg_per_ha')                return `Năng suất kg/ha`;
    return `Chỉ số ${commodityName}`;
  }

  // Generate a plain-language signal for cooperative farmers
  function getMarketSignal(metricKey: string, value: number | string, unitKey: string): { icon: React.ReactNode; text: string } | null {
    if (typeof value !== 'number') return null;
    if (metricKey.startsWith('export_value_to_world') || metricKey.startsWith('export_volume_to_world')) {
      if (unitKey === 'million_USD' && value > 1000)
        return { icon: <TrendingUp size={16} className="inline mr-1.5 text-emerald-600 align-text-bottom" />, text: 'Kim ngạch xuất khẩu lớn — nhu cầu thế giới đang cao, có thể hỗ trợ giá nội địa.' };
      if (unitKey === 'tonnes' && value > 5_000_000)
        return { icon: <Package size={16} className="inline mr-1.5 text-blue-600 align-text-bottom" />, text: 'Khối lượng xuất khẩu lớn — thị trường quốc tế đang tiêu thụ mạnh.' };
      return { icon: <BarChart3 size={16} className="inline mr-1.5 text-emerald-600 align-text-bottom" />, text: 'Dữ liệu xuất khẩu phản ánh xu hướng cầu thế giới đối với mặt hàng này.' };
    }
    if (metricKey === 'cereal_production')
      return { icon: <Sprout size={16} className="inline mr-1.5 text-emerald-600 align-text-bottom" />, text: 'Sản lượng toàn quốc lớn — nguồn cung dồi dào, HTX cần theo dõi giá thu mua địa phương.' };
    if (metricKey === 'cereal_yield' || metricKey === 'yield_kg_per_ha')
      return { icon: <Sprout size={16} className="inline mr-1.5 text-emerald-600 align-text-bottom" />, text: 'Chỉ số năng suất bình quân cả nước — so sánh với năng suất thực tế của HTX để đánh giá hiệu quả.' };
    return null;
  }

  const marketSignal = getMarketSignal(metric, metricValue, unit);
  
  return (
    <aside className={styles.widget}>
      <h3 className={styles.title}>Thị trường hôm nay</h3>
      <div className={styles.grid}>
        <MetricCard
          icon={<DollarSign size={20} />}
          label="Tỷ giá USD/VND"
          value={typeof fxValue === 'number' ? fxValue.toLocaleString('vi-VN') : fxValue}
          detail="Frankfurter API"
          tone="neutral"
        />
        <MetricCard
          icon={<TrendingUp size={20} />}
          label={getMetricLabel(metric, commodity)}
          value={displayValue}
          detail={displayUnit}
          tone="green"
        />
      </div>
      {marketSignal && (
        <p className={styles.signal}>
          {marketSignal.icon}
          {marketSignal.text}
        </p>
      )}
      <div className={styles.sources}>
        <SourceBox count={2} sources={['Frankfurter', 'USDA']} />
      </div>
    </aside>
  );
}
