"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { select } from "d3-selection";
import { zoom, zoomIdentity, type ZoomTransform } from "d3-zoom";
import { feature } from "topojson-client";
import type { FeatureCollection, Geometry } from "geojson";
import type { GeometryCollection, Topology } from "topojson-specification";
import { MAP_HEIGHT as HEIGHT, MAP_WIDTH as WIDTH, type GlobeView, type MapConfig } from "@/lib/maps";

type Collection = FeatureCollection<Geometry, Record<string, unknown>>;

const topologyCache = new Map<string, Promise<Topology>>();

function loadTopology(src: string): Promise<Topology> {
  if (!topologyCache.has(src)) {
    topologyCache.set(
      src,
      fetch(src).then((r) => r.json()),
    );
  }
  return topologyCache.get(src)!;
}

// 地球儀初始視角:亞洲在正中央
const INITIAL_GLOBE: GlobeView = { rotate: [-121, -20], scale: 1 };
const SPIN_DEGREES_PER_SECOND = 6;

export function GeoMap({
  config,
  colorFor,
  describe,
  highlighted,
  onSelect,
}: {
  config: MapConfig;
  colorFor: (key: string) => string | undefined;
  describe: (key: string) => string;
  highlighted: ReadonlySet<string>;
  onSelect: (key: string) => void;
}) {
  const [collection, setCollection] = useState<Collection | null>(null);
  const [hover, setHover] = useState<{ name: string; detail?: string; x: number; y: number } | null>(null);
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);
  const [globe, setGlobe] = useState<GlobeView>(INITIAL_GLOBE);
  const [spinning, setSpinning] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [wheeling, setWheeling] = useState(false);
  const [motionCollection, setMotionCollection] = useState<Collection | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  // 拖曳超過幾個像素就不算點擊
  const dragDistance = useRef(0);

  const { src, motionSrc, object, toLayers, globe: isGlobe } = config;

  useEffect(() => {
    let cancelled = false;
    const load = (url: string, set: (c: Collection) => void) =>
      loadTopology(url).then((topology) => {
        if (!cancelled) {
          set(feature(topology, topology.objects[object] as GeometryCollection<Record<string, unknown>>) as Collection);
        }
      });
    load(src, setCollection);
    if (motionSrc) load(motionSrc, setMotionCollection);
    return () => {
      cancelled = true;
    };
  }, [src, motionSrc, object]);

  const moving = spinning || dragging || wheeling;
  const source = (moving && motionCollection) || collection || motionCollection;
  const layers = useMemo(() => source && toLayers(source, globe), [source, toLayers, globe]);

  // 平面地圖:d3-zoom 處理縮放與拖曳
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || isGlobe) return;
    const behavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 16])
      .translateExtent([
        [0, 0],
        [WIDTH, HEIGHT],
      ])
      .on("zoom", (event) => setTransform(event.transform));
    const selection = select(svg);
    selection.call(behavior).call(behavior.transform, zoomIdentity);
    return () => {
      selection.on(".zoom", null);
    };
  }, [src, isGlobe]);

  // 地球儀:沒操作時慢慢自轉
  useEffect(() => {
    if (!isGlobe || !spinning) return;
    let frame: number;
    let last = performance.now();
    const tick = (now: number) => {
      const delta = ((now - last) / 1000) * SPIN_DEGREES_PER_SECOND;
      last = now;
      setGlobe((g) => ({ ...g, rotate: [g.rotate[0] + delta, g.rotate[1]] }));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isGlobe, spinning]);

  // 地球儀:滾輪縮放(要用非 passive 的監聽才能擋住頁面捲動)
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !isGlobe) return;
    let timer: ReturnType<typeof setTimeout>;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setSpinning(false);
      setWheeling(true);
      clearTimeout(timer);
      timer = setTimeout(() => setWheeling(false), 250);
      setGlobe((g) => ({ ...g, scale: Math.min(8, Math.max(1, g.scale * Math.exp(-e.deltaY * 0.002))) }));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      svg.removeEventListener("wheel", onWheel);
      clearTimeout(timer);
    };
  }, [isGlobe]);

  // 地球儀:拖曳旋轉。不用 pointer capture,否則 click 會落在 svg 而不是國家上
  function startGlobeDrag(e: React.PointerEvent) {
    if (!isGlobe) return;
    setHover(null);
    dragDistance.current = 0;
    const start = { x: e.clientX, y: e.clientY, rotate: globe.rotate };
    // 每個螢幕像素對應的角度,放大時轉得慢一點
    const box = svgRef.current!.getBoundingClientRect();
    const degreesPerPixel = 180 / (box.height * globe.scale);
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      dragDistance.current = Math.max(dragDistance.current, Math.abs(dx) + Math.abs(dy));
      // 真的拖動才換地圖精度;按下就換的話,滑鼠下的國家元素會被替換,點擊就失效
      if (dragDistance.current > 4) {
        setSpinning(false);
        setDragging(true);
      }
      setGlobe((g) => ({
        ...g,
        rotate: [
          start.rotate[0] + dx * degreesPerPixel,
          Math.max(-90, Math.min(90, start.rotate[1] - dy * degreesPerPixel)),
        ],
      }));
    };
    const onUp = () => {
      setDragging(false);
      // 單純點擊:等 click 事件處理完再停止自轉
      setTimeout(() => setSpinning(false), 0);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  const shapes = layers?.shapes;
  const lit = useMemo(() => (shapes ?? []).filter((s) => s.key && s.d && colorFor(s.key)), [shapes, colorFor]);
  const marked = useMemo(() => (shapes ?? []).filter((s) => s.key && s.d && highlighted.has(s.key)), [shapes, highlighted]);

  return (
    <div className="relative" onMouseLeave={() => setHover(null)}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full cursor-grab touch-none select-none active:cursor-grabbing"
        role="img"
        onPointerDown={startGlobeDrag}
      >
        <defs>
          <radialGradient id="ocean" cx="50%" cy="45%" r="65%">
            <stop offset="0%" stopColor="#16264a" />
            <stop offset="100%" stopColor="#0a1226" />
          </radialGradient>
          {/* 地球儀的立體感:左上受光、右下陰影 */}
          <radialGradient id="globe-ocean" cx="38%" cy="32%" r="75%">
            <stop offset="0%" stopColor="#1d3364" />
            <stop offset="60%" stopColor="#0e1a38" />
            <stop offset="100%" stopColor="#060b19" />
          </radialGradient>
          <radialGradient id="globe-shade" cx="38%" cy="32%" r="72%">
            <stop offset="55%" stopColor="#000" stopOpacity={0} />
            <stop offset="100%" stopColor="#000" stopOpacity={0.55} />
          </radialGradient>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
          <filter id="atmosphere" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="10" />
          </filter>
        </defs>
        <g transform={transform.toString()}>
          {isGlobe && layers?.sphere && (
            <path d={layers.sphere} fill="none" stroke="#4f7bd6" strokeWidth={6} strokeOpacity={0.45} filter="url(#atmosphere)" />
          )}
          {layers?.sphere && (
            <path
              d={layers.sphere}
              fill={isGlobe ? "url(#globe-ocean)" : "url(#ocean)"}
              stroke="#2a3b66"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          )}
          {layers?.graticule && (
            <path d={layers.graticule} fill="none" stroke="#ffffff" strokeOpacity={0.05} vectorEffect="non-scaling-stroke" />
          )}
          {/* 去過的地方先畫一層模糊光暈 */}
          <g filter="url(#glow)" opacity={0.85}>
            {lit.map((s, i) => (
              <path key={i} d={s.d} fill={colorFor(s.key!)} />
            ))}
          </g>
          {shapes?.map((s, i) => {
            if (!s.d) return null; // 地球儀背面
            const color = s.key ? colorFor(s.key) : undefined;
            return (
              <path
                key={i}
                d={s.d}
                fill={color ?? "#24304d"}
                stroke={color ? "#00000055" : "#3a4870"}
                strokeWidth={0.5}
                vectorEffect="non-scaling-stroke"
                className={s.key ? "cursor-pointer transition-[filter] hover:brightness-125" : undefined}
                onMouseMove={(e) => {
                  if (e.buttons) return; // 拖曳中不顯示
                  const box = svgRef.current!.getBoundingClientRect();
                  setHover({
                    name: s.name,
                    detail: s.key ? describe(s.key) : undefined,
                    x: e.clientX - box.left,
                    y: e.clientY - box.top,
                  });
                }}
                onClick={() => {
                  if (isGlobe && dragDistance.current > 4) return;
                  if (s.key) onSelect(s.key);
                }}
              />
            );
          })}
          {/* 選取中的地點描白邊 */}
          {marked.map((s, i) => (
            <path key={i} d={s.d} fill="none" stroke="#ffffff" strokeWidth={1.5} vectorEffect="non-scaling-stroke" pointerEvents="none" />
          ))}
          {isGlobe && layers?.sphere && <path d={layers.sphere} fill="url(#globe-shade)" pointerEvents="none" />}
          {layers?.frames?.map((d, i) => (
            <path key={i} d={d} fill="none" stroke="#3a4870" vectorEffect="non-scaling-stroke" pointerEvents="none" />
          ))}
        </g>
      </svg>
      {!layers && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">地圖載入中…</div>
      )}
      {hover && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-panel/95 px-2.5 py-1.5 text-xs shadow-lg"
          style={{ left: hover.x, top: hover.y - 12 }}
        >
          <div className="font-medium text-foreground">{hover.name}</div>
          {hover.detail && <div className="text-muted">{hover.detail}</div>}
        </div>
      )}
    </div>
  );
}
