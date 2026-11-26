// SPDX-License-Identifier: MIT
// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useState } from 'react'
import { Stats } from './parts'
import styles from './kit.module.css'

export interface CardFigure {
  label: string
  value: string | number
  icon: React.ReactNode
  /** Show only the cards carrying this tag. */
  tag?: string
  /** Order the cards by this rank, largest first. */
  sort?: string
}

export interface Card {
  key: string
  tags?: string[]
  rank?: Record<string, number>
  node: React.ReactNode
}

/** Headline figures that filter or order the card grid under them. */
export function FilteredCards({ figures, cards, className, children }: { figures: CardFigure[]; cards: Card[]; className: string; children?: React.ReactNode }) {
  const [chosen, setChosen] = useState(figures[0]?.label)
  const figure = figures.find((f) => f.label === chosen)
  const shown = cards.filter((card) => !figure?.tag || card.tags?.includes(figure.tag))
  if (figure?.sort) shown.sort((a, b) => (b.rank?.[figure.sort!] ?? 0) - (a.rank?.[figure.sort!] ?? 0))

  return (
    <>
      <Stats items={figures.map(({ label, value, icon }) => ({ label, value, icon, active: label === chosen, onSelect: () => setChosen(label) }))} />
      {children}
      {shown.length === 0 && cards.length > 0 ? (
        <p className={styles.none}>Không có mục nào trong “{chosen}”.</p>
      ) : (
        <div className={className}>
          {shown.map((card) => <React.Fragment key={card.key}>{card.node}</React.Fragment>)}
        </div>
      )}
    </>
  )
}
