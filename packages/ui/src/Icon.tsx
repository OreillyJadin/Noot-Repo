// Ic — icon set ported verbatim from app/kit.jsx (ICONS + Ic), rendered with
// react-native-svg. Specs use "|" to separate shapes; "circle:cx,cy,r" and
// "rect:x,y,w,h,r" are parsed; everything else is a stroked path.
import React from 'react';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { useTheme } from './ThemeProvider';

export const ICONS = {
  back: 'M15 4l-7 8 7 8',
  chevron: 'M8 4l8 8-8 8',
  chevdown: 'M5 8l7 7 7-7',
  plus: 'M12 5v14M5 12h14',
  check: 'M4 12l5 5L20 6',
  search: 'M11 4a7 7 0 105.3 11.7M20 20l-4.7-4.3',
  camera: 'M4 8h3l2-2h6l2 2h3v11H4z|circle:12,13,3.4',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  mail: 'M3 6h18v12H3z|M3 7l9 6 9-6',
  clock: 'M12 7v5l3 2|circle:12,12,9',
  star: 'M12 3l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.6 6.8 19l1-5.8L3.5 9.2l5.9-.8z',
  lock: 'M6 10V8a6 6 0 1112 0v2|rect:5,10,14,11,2',
  dollar: 'M12 3v18M16 7c0-2-2-3-4-3s-4 1-4 3 2 3 4 3 4 1 4 3-2 3-4 3-4-1-4-3',
  cal: 'M3 6h18v15H3z|M3 10h18M8 3v4M16 3v4',
  repeat: 'M17 2l4 4-4 4M21 6H8a5 5 0 00-5 5v1M7 22l-4-4 4-4M3 18h13a5 5 0 005-5v-1',
  list: 'M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01',
  x: 'M6 6l12 12M18 6L6 18',
  minus: 'M5 12h14',
  edit: 'M4 20h4L19 9l-4-4L4 16z',
  grid: 'rect:4,4,7,7,1.5|rect:13,4,7,7,1.5|rect:4,13,7,7,1.5|rect:13,13,7,7,1.5',
  user: 'M5 20c1.5-4 4-6 7-6s5.5 2 7 6|circle:12,8,4',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  shield: 'M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z|M8.5 12l2.5 2.5L16 9',
  doc: 'M6 3h8l4 4v14H6z|M14 3v4h4',
  sliders: 'M4 7h10M18 7h2M4 17h2M10 17h10|circle:16,7,2|circle:8,17,2',
  bookmark: 'M6 3h12v18l-6-4-6 4z',
  msg: 'M4 5h16v11H9l-5 4z',
  pin: 'M12 21s7-6 7-11a7 7 0 10-14 0c0 5 7 11 7 11z|circle:12,10,2.5',
  cap: 'M2 8.5l10-4.5 10 4.5-10 4.5z|M6 10.5V16c0 1.2 2.7 2.2 6 2.2s6-1 6-2.2v-5.5M20 9v5',
  card: 'rect:3,5,18,14,3|M3 9h18',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  filter: 'M3 5h18l-7 8v6l-4-2v-4z',
  sort: 'M7 5v14M7 19l-3-3M7 5l3 3M17 19V5M17 5l-3 3M17 19l3-3',
  video: 'rect:3,7,12,10,2.5|M15 11l5-3v8l-5-3z',
  chat: 'M4 5h16v11H9l-5 4z|M8 9h8M8 12h5',
  alert: 'M12 4l9 16H3z|M12 10v4|M12 16.6v.4',
  wallet: 'rect:3,6,18,13,3|M16 12h3v3h-3a1.5 1.5 0 0 1 0-3z|M3 8h13',
  link: 'M9 12h6|M10 8H7a4 4 0 0 0 0 8h3|M14 8h3a4 4 0 0 1 0 8h-3',
  gear: 'M12 9a3 3 0 100 6 3 3 0 000-6z|M19 12a7 7 0 00-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 00-2-1.2l-.4-2.6H8.9l-.4 2.6a7 7 0 00-2 1.2l-2.4-1-2 3.4 2 1.6a7 7 0 000 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 002 1.2l.4 2.6h4.2l.4-2.6a7 7 0 002-1.2l2.4 1 2-3.4-2-1.6A7 7 0 0019 12z',
  bell: 'M18 9a6 6 0 10-12 0c0 7-2 8-2 8h16s-2-1-2-8z|M10.5 21a2 2 0 003 0',
  help: 'M9.2 9a3 3 0 015.6 1.5c0 2-3 2.2-3 4|M12 17.5v.4|circle:12,12,9',
  logout: 'M14 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2h6a2 2 0 002-2v-2|M9 12h11|M17 8l4 4-4 4',
  gift: 'rect:3,8,18,5,1|M3 13h18v8H3z|M12 8v13|M12 8S10.5 3 8 4.5 9 8 12 8zm0 0s1.5-5 4-3.5S15 8 12 8z',
  chevR: 'M9 6l6 6-6 6',
  flame: 'M12 3s5 4 5 9a5 5 0 01-10 0c0-2 1-3 1-3s.5 2 2 2c0-3 2-5 2-8z',
  handshake:
    'm11 17 2 2a1 1 0 1 0 3-3|m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.8 5.8 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4|m21 3 1 11h-2|M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3|M3 4h8',
  clip: 'M21 11l-8.5 8.5a5 5 0 01-7-7L13 4a3.3 3.3 0 014.7 4.7l-8 8a1.6 1.6 0 01-2.3-2.3l7.5-7.5',
  send: 'M22 2L11 13M22 2l-7 20-4-9-9-4z',
  image: 'rect:3,4,18,16,2|circle:8.5,9.5,1.6|M21 15l-5-4L6 20',
  target: 'circle:12,12,8|circle:12,12,4.2|circle:12,12,0.6',
  trophy: 'M7 4h10v4a5 5 0 0 1-10 0z|M7 6H4v1a3 3 0 0 0 3 3|M17 6h3v1a3 3 0 0 1-3 3|M9 15h6l1 5H8z',
} as const;

export type IconName = keyof typeof ICONS;

export interface IcProps {
  name: IconName;
  size?: number;
  /** Stroke color. Defaults to the current theme text color. */
  color?: string;
  strokeWidth?: number;
  fill?: string;
}

export function Ic({ name, size = 20, color, strokeWidth = 1.8, fill = 'none' }: IcProps) {
  const t = useTheme();
  const stroke = color ?? t.text;
  const spec = ICONS[name] ?? '';
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {spec.split('|').map((p, i) => {
        if (p.startsWith('circle:')) {
          const [cx, cy, r] = p.slice(7).split(',').map(Number);
          return <Circle key={i} cx={cx} cy={cy} r={r} stroke={stroke} strokeWidth={strokeWidth} fill={fill} />;
        }
        if (p.startsWith('rect:')) {
          const [x, y, w, h, r] = p.slice(5).split(',').map(Number);
          return <Rect key={i} x={x} y={y} width={w} height={h} rx={r || 0} stroke={stroke} strokeWidth={strokeWidth} fill={fill} />;
        }
        return <Path key={i} d={p} stroke={stroke} strokeWidth={strokeWidth} fill={fill} strokeLinecap="round" strokeLinejoin="round" />;
      })}
    </Svg>
  );
}
