// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client';

import React from 'react';
import useSWR from 'swr';
import { DollarSign, TrendingUp } from 'lucide-react';
import { MetricCard } from '../../ui/MetricCard/MetricCard';
import { SourceBox } from '../../ui/SourceBox/SourceBox';
import styles from './MarketSummaryWidget.module.css';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export function MarketSummaryWidget() {
  const { data: fxData } = useSWR('/api/market-data/fx?pair=USD/VND', fetcher);
  const { data: marketData } = useSWR('/api/market-data?commodity=Gạo', fetcher);

  const fxValue = fxData?.data?.[0]?.rates?.VND || 'N/A'; 
  const ricePrice = marketData?.data?.[0]?.value || 'N/A';
  const unit = marketData?.data?.[0]?.unit || 'USD/MT';
  
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
          label="Giá xuất khẩu Gạo"
          value={typeof ricePrice === 'number' ? ricePrice.toLocaleString('vi-VN') : ricePrice}
          detail={unit}
          tone="green"
        />
      </div>
      <div className={styles.sources}>
        <SourceBox count={2} sources={['Frankfurter', 'USDA']} />
      </div>
    </aside>
  );
}
