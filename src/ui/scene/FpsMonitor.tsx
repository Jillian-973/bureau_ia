import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { fpsStore } from '../fps-store';
import { MIN_ACCEPTABLE_FPS } from './quality';
import type { QualityLevel } from './quality';

/** How often the displayed frame rate is refreshed, in seconds. */
const SAMPLE_PERIOD = 0.5;
/** Time ignored after start-up or a quality change (shader compilation, loading). */
const WARM_UP = 3;
/** Duration over which the frame rate is averaged before judging it. */
const JUDGE_PERIOD = 4;
/** A longer gap between two frames means the tab was hidden, not that rendering is slow. */
const STALL_THRESHOLD = 1;

interface FpsMonitorProps {
  /** Current level: measurements restart whenever it changes. */
  level: QualityLevel;
  /** Called when the average frame rate stays under the acceptable minimum. */
  onLowPerformance: () => void;
}

/** Measures the frame rate, publishes it and reports sustained slowness. */
export function FpsMonitor({ level, onLowPerformance }: FpsMonitorProps) {
  const stats = useRef({ frames: 0, time: 0, warmUp: WARM_UP, judgedFrames: 0, judgedTime: 0 });

  useEffect(() => {
    stats.current = { frames: 0, time: 0, warmUp: WARM_UP, judgedFrames: 0, judgedTime: 0 };
  }, [level]);

  useFrame((_, delta) => {
    if (delta > STALL_THRESHOLD) return;
    const current = stats.current;
    current.frames += 1;
    current.time += delta;
    if (current.time < SAMPLE_PERIOD) return;

    fpsStore.set(Math.round(current.frames / current.time));
    if (current.warmUp > 0) {
      current.warmUp -= current.time;
    } else {
      current.judgedFrames += current.frames;
      current.judgedTime += current.time;
      if (current.judgedTime >= JUDGE_PERIOD) {
        if (current.judgedFrames / current.judgedTime < MIN_ACCEPTABLE_FPS - 1) onLowPerformance();
        current.judgedFrames = 0;
        current.judgedTime = 0;
      }
    }
    current.frames = 0;
    current.time = 0;
  });

  return null;
}
