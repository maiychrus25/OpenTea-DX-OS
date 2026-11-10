// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client';

import React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { toVietnameseCommodity, toEnglishCommodity } from '@/lib/translations';
import styles from './CommodityTabs.module.css';

interface CommodityTabsProps {
  availableCommodities: string[];
  basePath: string;
}

export function CommodityTabs({ availableCommodities, basePath }: CommodityTabsProps) {
  const searchParams = useSearchParams();
  const currentCommodityVi = searchParams.get('commodity') || 'Chè';
  const currentCommodityEn = toEnglishCommodity(currentCommodityVi);

  // Default to Tea if empty
  const commodities = availableCommodities.length > 0 ? availableCommodities : ['Tea'];

  return (
    <div className={styles.tabsContainer}>
      <ul className={styles.tabList}>
        {commodities.map(commodityEn => {
          const commodityVi = toVietnameseCommodity(commodityEn);
          const isActive = commodityEn === currentCommodityEn;
          
          return (
            <li key={commodityEn} className={styles.tabItem}>
              <Link 
                href={`${basePath}?commodity=${encodeURIComponent(commodityVi)}`}
                className={`${styles.tabLink} ${isActive ? styles.active : ''}`}
              >
                {commodityVi}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
