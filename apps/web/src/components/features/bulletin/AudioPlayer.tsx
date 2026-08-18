// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Volume2, Square, Loader2 } from 'lucide-react';
import { Button } from '../../ui/Button/Button';
import styles from './AudioPlayer.module.css';

interface AudioPlayerProps {
  bulletinId: string;
}

export default function AudioPlayer({ bulletinId }: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  const togglePlay = () => {
    if (!audioRef.current) {
      setIsLoading(true);
      const audio = new Audio(`/api/tts?bulletinId=${bulletinId}`);
      
      audio.onended = () => {
        setIsPlaying(false);
      };
      
      audio.onerror = () => {
        setIsLoading(false);
        setIsPlaying(false);
        alert('Lỗi khi tải bản tin (có thể dịch vụ TTS đang bận).');
      };
      
      audioRef.current = audio;
      
      audio.play().then(() => {
        setIsLoading(false);
        setIsPlaying(true);
      }).catch((e) => {
        setIsLoading(false);
        setIsPlaying(false);
        console.error('Audio play failed', e);
      });
      return;
    }

    if (isPlaying) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0; // act like stop
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch((e) => {
        console.error('Audio play failed', e);
      });
    }
  };

  return (
    <div className={styles.audioPlayer}>
      <Button 
        variant="secondary" 
        onClick={togglePlay} 
        disabled={isLoading}
      >
        {isLoading ? (
          <span className={styles.buttonContent}>
            <Loader2 className={`${styles.icon} ${styles.spin}`} /> Đang tải...
          </span>
        ) : isPlaying ? (
          <span className={styles.buttonContent}>
            <Square className={styles.icon} /> Dừng bản tin
          </span>
        ) : (
          <span className={styles.buttonContent}>
            <Volume2 className={styles.icon} /> Nghe bản tin
          </span>
        )}
      </Button>
    </div>
  );
}
