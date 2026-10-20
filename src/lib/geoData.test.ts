// 檢查 public/geo 的地圖檔與程式裡的名稱表、統計分母一致。之後新增國家最容易在這裡出錯
import { readFileSync } from "node:fs";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import type { FeatureCollection, Geometry } from "geojson";
import { describe, expect, it } from "vitest";
import { DRILLDOWN_MAPS, WORLD_MAP, type MapConfig } from "./maps";
import { DRILLDOWNS, countryName } from "./places";

function shapesOf(config: MapConfig) {
  const topology = JSON.parse(readFileSync(`public${config.src}`, "utf8")) as Topology;
  const collection = feature(topology, topology.objects[config.object]) as unknown as FeatureCollection<
    Geometry,
    Record<string, unknown>
  >;
  return config.toLayers(collection, { rotate: [0, 0], scale: 1 }).shapes;
}

describe("可細分國家的地圖檔", () => {
  it("每個可細分國家都有地圖,反之亦然", () => {
    expect(Object.keys(DRILLDOWN_MAPS).sort()).toEqual(Object.keys(DRILLDOWNS).sort());
  });

  for (const [country, config] of Object.entries(DRILLDOWN_MAPS)) {
    describe(country, () => {
      const shapes = shapesOf(config);

      it("每個行政區都有 key、中文名稱與形狀", () => {
        for (const shape of shapes) {
          expect(shape.key, shape.name).toMatch(new RegExp(`^${country}-[A-Z0-9]+$`));
          expect(shape.name, shape.key).not.toBe(shape.key); // 找不到名稱時 placeName 會回傳 key
          expect(shape.d, shape.key).not.toBe("");
        }
      });

      it("沒有重複的行政區", () => {
        const keys = shapes.map((s) => s.key);
        expect(new Set(keys).size).toBe(keys.length);
      });

      it("行政區數量等於統計分母", () => {
        // 華盛頓特區可紀錄,但不計入 50 州(與 FootprintsView 的統計一致)
        const counted = shapes.filter((s) => s.key !== "US-DC");
        expect(counted.length).toBe(DRILLDOWNS[country].total);
      });
    });
  }
});

describe("世界地圖", () => {
  const shapes = shapesOf(WORLD_MAP);

  it("可細分的國家都在世界地圖上點得到", () => {
    const keys = new Set(shapes.map((s) => s.key));
    for (const country of Object.keys(DRILLDOWNS)) expect(keys, country).toContain(country);
  });

  it("有國碼的國家都有中文名稱", () => {
    for (const { key } of shapes) if (key) expect(countryName(key), key).not.toBe(key);
  });
});
