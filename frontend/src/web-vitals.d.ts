// src/web-vitals.d.ts
declare module 'web-vitals' {
  export type Metric = {
    name: string;
    value: number;
    delta: number;
    id: string;
    entries: PerformanceEntry[];
    attribution?: Record<string, any>;
  };

  export function onCLS(callback: (metric: Metric) => void): void;
  export function onFID(callback: (metric: Metric) => void): void;
  export function onFCP(callback: (metric: Metric) => void): void;
  export function onLCP(callback: (metric: Metric) => void): void;
  export function onTTFB(callback: (metric: Metric) => void): void;
}
