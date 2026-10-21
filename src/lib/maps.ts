import { geoAlbersUsa, geoEqualEarth, geoGraticule10, geoMercator, geoOrthographic, geoPath, type GeoPath } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { US_STATES, countryName, numericToAlpha2, placeKey, placeName, prefectureCode } from "./places";

export const MAP_WIDTH = 960;
export const MAP_HEIGHT = 540;

// key 為 undefined 代表無法紀錄的區域(例如沒有 ISO 代碼的爭議領土)
export type Shape = { key?: string; name: string; d: string };

export type Collection = FeatureCollection<Geometry, Record<string, unknown>>;
export type GeoFeature = Feature<Geometry, Record<string, unknown>>;

export type MapLayers = {
  shapes: Shape[];
  sphere?: string; // 海洋外框
  graticule?: string; // 經緯線
  frames?: string[]; // 小地圖外框
};

// 地球儀的視角:rotate 為 [經度, 緯度] 旋轉角,scale 為放大倍率
export type GlobeView = { rotate: [number, number]; scale: number };

export type MapConfig = {
  src: string;
  object: string;
  globe?: boolean; // 可拖曳旋轉的地球儀,每次視角變動都重新投影
  motionSrc?: string; // 轉動中改用的低精度地圖,停下來再換回 src
  toLayers: (collection: Collection, view: GlobeView) => MapLayers;
  regionKey?: (feature: GeoFeature) => string | undefined; // 可細分地圖:行政區對應的地點 key
};

const SPHERE = { type: "Sphere" } as const;

function countryShapes(collection: Collection, path: GeoPath): Shape[] {
  return collection.features.map((f) => {
    const code = numericToAlpha2(f.id);
    return { key: code, name: code ? countryName(code) : String(f.properties.name), d: path(f) ?? "" };
  });
}

export const WORLD_MAP: MapConfig = {
  src: "/geo/world-50m.json",
  object: "countries",
  toLayers(collection) {
    const path = geoPath(geoEqualEarth().fitExtent([[8, 8], [MAP_WIDTH - 8, MAP_HEIGHT - 8]], SPHERE));
    return {
      sphere: path(SPHERE) ?? undefined,
      graticule: path(geoGraticule10()) ?? undefined,
      shapes: countryShapes(collection, path),
    };
  },
};

export const GLOBE_MAP: MapConfig = {
  src: WORLD_MAP.src,
  object: WORLD_MAP.object,
  globe: true,
  // 50m 每幀投影約 38ms、110m 約 5ms
  motionSrc: "/geo/world-110m.json",
  toLayers(collection, { rotate, scale }) {
    const projection = geoOrthographic()
      .rotate(rotate)
      .fitExtent([[10, 10], [MAP_WIDTH - 10, MAP_HEIGHT - 10]], SPHERE);
    projection.scale(projection.scale() * scale);
    const path = geoPath(projection);
    return {
      sphere: path(SPHERE) ?? undefined,
      graticule: path(geoGraticule10()) ?? undefined,
      shapes: countryShapes(collection, path),
    };
  },
};

const OKINAWA_ID = 47;
// 主圖只框本州、四國、九州、北海道,避免小笠原與沖繩把地圖撐得太小
const MAINLAND_BOUNDS = bounds([128.5, 30], [146, 45.6]);
// 沖繩小地圖只框本島與先島諸島,大東群島會被裁掉
const OKINAWA_BOUNDS = bounds([122.9, 24], [128.4, 27]);
const INSET: [[number, number], [number, number]] = [[24, 24], [264, 174]];

function bounds(southWest: [number, number], northEast: [number, number]): GeoFeature {
  return { type: "Feature", properties: {}, geometry: { type: "MultiPoint", coordinates: [southWest, northEast] } };
}

const japanKey = (f: GeoFeature) => placeKey("JP", prefectureCode(f.properties.id as number));

export const JAPAN_MAP: MapConfig = {
  src: "/geo/japan.json",
  object: "japan",
  regionKey: japanKey,
  toLayers(collection) {
    const mainland = geoPath(geoMercator().fitExtent([[0, 12], [MAP_WIDTH, MAP_HEIGHT - 12]], MAINLAND_BOUNDS));
    const [[x0, y0], [x1, y1]] = INSET;
    const inset = geoPath(
      geoMercator()
        .fitExtent([[x0 + 12, y0 + 12], [x1 - 12, y1 - 12]], OKINAWA_BOUNDS)
        .clipExtent(INSET),
    );
    return {
      shapes: collection.features.map((f) => ({
        key: japanKey(f),
        name: String(f.properties.nam_ja),
        d: (f.properties.id === OKINAWA_ID ? inset(f) : mainland(f)) ?? "",
      })),
      frames: [`M${x0},${y0}H${x1}V${y1}H${x0}Z`],
    };
  },
};

export const US_MAP: MapConfig = {
  src: "/geo/us-states.json",
  object: "states",
  regionKey: (f) => (String(f.id) in US_STATES ? placeKey("US", US_STATES[String(f.id)][0]) : undefined),
  toLayers(collection) {
    // geoAlbersUsa 會把阿拉斯加、夏威夷放在左下角;波多黎各等屬地在世界地圖上另有國碼,這裡略過
    const states = collection.features.filter((f) => String(f.id) in US_STATES);
    const path = geoPath(
      geoAlbersUsa().fitExtent([[16, 16], [MAP_WIDTH - 16, MAP_HEIGHT - 16]], { type: "FeatureCollection", features: states }),
    );
    return {
      shapes: states.map((f) => {
        const [code, name] = US_STATES[String(f.id)];
        return { key: placeKey("US", code), name, d: path(f) ?? "" };
      }),
    };
  },
};

// 地圖檔的 regions 物件,每個行政區帶 code 屬性(即 region_code)。
// frame 用來只框本土,避免遠方離島把地圖撐小;框外的部分會被裁掉
function regionMap(country: string, src: string, frame?: GeoFeature): MapConfig {
  const regionKey = (f: GeoFeature) => placeKey(country, String(f.properties.code));
  return {
    src,
    object: "regions",
    regionKey,
    toLayers(collection) {
      const projection = geoMercator().fitExtent([[16, 16], [MAP_WIDTH - 16, MAP_HEIGHT - 16]], frame ?? collection);
      if (frame) projection.clipExtent([[0, 0], [MAP_WIDTH, MAP_HEIGHT]]);
      const path = geoPath(projection);
      return {
        shapes: collection.features.map((f) => {
          const key = regionKey(f);
          return { key, name: placeName(key), d: path(f) ?? "" };
        }),
      };
    },
  };
}

export const DRILLDOWN_MAPS: Record<string, MapConfig> = {
  JP: JAPAN_MAP,
  US: US_MAP,
  TW: regionMap("TW", "/geo/taiwan.json"),
  KR: regionMap("KR", "/geo/korea.json"),
  TH: regionMap("TH", "/geo/thailand.json"),
  // 西沙、南沙群島在框外
  VN: regionMap("VN", "/geo/vietnam.json", bounds([102.1, 8.4], [109.5, 23.4])),
};
