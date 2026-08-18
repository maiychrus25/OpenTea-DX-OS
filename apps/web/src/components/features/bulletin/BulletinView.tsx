// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Bulletin } from '../../../domain/repositories/IBulletinRepository';
import { SourceBox } from '../../ui/SourceBox';
import { AiNote } from '../../ui/AiNote';
import styles from './BulletinView.module.css';

interface BulletinViewProps {
  bulletin: Bulletin;
}

export function BulletinView({ bulletin }: BulletinViewProps) {
  let sourcesList: string[] = [];
  try {
    const sources = typeof bulletin.sources_json === 'string' 
      ? JSON.parse(bulletin.sources_json) 
      : bulletin.sources_json;
      
    if (Array.isArray(sources)) {
      sourcesList = sources.map((s) => `${s.source || s.url || 'Nguồn'}`);
    }
  } catch (e) {
    console.error('Failed to parse sources', e);
  }

  return (
    <article className={styles.container}>
      <header className={styles.header}>
        <h2 className={styles.title}>Bản tin thị trường: {bulletin.commodity}</h2>
        <time className={styles.date}>
          {new Date(bulletin.created_at).toLocaleDateString('vi-VN')}
        </time>
      </header>

      <AiNote message={`Bản tin được tổng hợp tự động bởi AI (${bulletin.model_used}).`} />

      <div className={styles.content}>
        <ReactMarkdown>{bulletin.bulletin_vi}</ReactMarkdown>
      </div>

      <footer className={styles.footer}>
        <SourceBox count={sourcesList.length} sources={sourcesList.length > 0 ? sourcesList : ['Dữ liệu hệ thống']} />
      </footer>
    </article>
  );
}
