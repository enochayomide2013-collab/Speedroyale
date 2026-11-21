import React, { useMemo } from 'react';
import type { MapDef } from '../shared/gameData';

export interface RadarDot {
  id: string;
  x: number;
  z: number;
  yaw: number;
  isHuman: boolean;
  isLeader: boolean;
  isGhost?: boolean;
  ghostTone?: 'cyan' | 'amber';
  eliminated: boolean;
  team: 'cyan' | 'amber' | null;
}

interface TrackBlueprintProps {
  map: MapDef;
  dots?: RadarDot[];
  size?: number;
  className?: string;
}

const VIEW_SIZE = 100;
const PAD = 12;

export const TrackBlueprint: React.FC<TrackBlueprintProps> = ({
  map,
  dots,
  size = 120,
  className = '',
}) => {
  const layout = useMemo(() => {
    const pts = map.waypoints;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }
    const span = Math.max(1, maxX - minX, maxZ - minZ);
    const scale = (VIEW_SIZE - PAD * 2) / span;
    const offsetX = PAD + (VIEW_SIZE - PAD * 2 - (maxX - minX) * scale) / 2;
    const offsetZ = PAD + (VIEW_SIZE - PAD * 2 - (maxZ - minZ) * scale) / 2;

    const project = (x: number, z: number) => ({
      px: offsetX + (x - minX) * scale,
      pz: offsetZ + (z - minZ) * scale,
    });

    const projected = pts.map((p, i) => ({
      ...project(p.x, p.z),
      surface: p.surface ?? 'normal',
      idx: i,
    }));

    const pathD =
      projected.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.px.toFixed(1)} ${p.pz.toFixed(1)}`).join(' ') + ' Z';

    const segments = projected.map((p, i) => {
      const next = projected[(i + 1) % projected.length];
      return {
        x1: p.px,
        y1: p.pz,
        x2: next.px,
        y2: next.pz,
        surface: p.surface,
      };
    });

    return {
      pathD,
      segments,
      start: projected[0],
      project,
    };
  }, [map]);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
      className={className}
      aria-label={`${map.name} track blueprint`}
    >
      {/* Track Outline Shadow */}
      <path
        d={layout.pathD}
        fill="none"
        stroke="rgba(15,23,42,0.9)"
        strokeWidth={6}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Base Circuit Line */}
      <path
        d={layout.pathD}
        fill="none"
        stroke="rgba(148,163,184,0.42)"
        strokeWidth={3.2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Special Surface Segments */}
      {layout.segments.map((seg, idx) => {
        if (seg.surface === 'normal') return null;
        const color =
          seg.surface === 'boost'
            ? '#F59E0B'
            : seg.surface === 'water'
            ? '#0EA5E9'
            : seg.surface === 'ice'
            ? '#BAE6FD'
            : seg.surface === 'lowgrav'
            ? '#A855F7'
            : '#22D3EE';
        return (
          <line
            key={idx}
            x1={seg.x1}
            y1={seg.y1}
            x2={seg.x2}
            y2={seg.y2}
            stroke={color}
            strokeWidth={3.4}
            strokeLinecap="round"
            strokeOpacity={0.9}
          />
        );
      })}
      {/* Start/Finish Gate Marker */}
      <circle
        cx={layout.start.px}
        cy={layout.start.pz}
        r={3.2}
        fill="#FFFFFF"
        stroke={map.accentColor}
        strokeWidth={1.6}
      />

      {/* Live Racer & Ghost Radar Dots */}
      {dots?.map((d) => {
        if (d.eliminated) return null;
        const { px, pz } = layout.project(d.x, d.z);
        if (d.isGhost) {
          const deg = (-d.yaw * 180) / Math.PI;
          const color = d.ghostTone === 'amber' ? '#FBBF24' : '#38BDF8';
          return (
            <g
              key={d.id}
              transform={`translate(${px.toFixed(1)}, ${pz.toFixed(1)}) rotate(${deg.toFixed(0)})`}
              opacity={0.78}
            >
              <polygon points="0,-4.4 3.1,2.8 0,1.4 -3.1,2.8" fill="none" stroke={color} strokeWidth={1.3} />
            </g>
          );
        }
        if (d.isHuman) {
          const deg = (-d.yaw * 180) / Math.PI;
          return (
            <g key={d.id} transform={`translate(${px.toFixed(1)}, ${pz.toFixed(1)}) rotate(${deg.toFixed(0)})`}>
              <polygon points="0,-5 3.6,3.8 0,2 -3.6,3.8" fill="#22D3EE" stroke="#082F49" strokeWidth={0.9} />
            </g>
          );
        }
        const dotColor = d.team === 'cyan' ? '#38BDF8' : d.team === 'amber' ? '#F59E0B' : d.isLeader ? '#FACC15' : '#CBD5E1';
        return (
          <g key={d.id}>
            {d.isLeader && (
              <circle cx={px} cy={pz} r={3.6} fill="none" stroke="#FACC15" strokeWidth={0.9} strokeOpacity={0.85} />
            )}
            <circle cx={px} cy={pz} r={d.isLeader ? 2.2 : 1.7} fill={dotColor} />
          </g>
        );
      })}
    </svg>
  );
};
