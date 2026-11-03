import { describe, it, expect } from "vitest";
import {
  SHADER_PRESETS,
  DEFAULT_SHADER_PRESET,
  getShaderPresetById,
  getNextShaderPreset,
} from "./lib/shaders";

describe("Visual Shaders and CRT Presets Suite", () => {
  it("provides valid presets including CRT EasyMode, Trinitron, and ScaleHQ", () => {
    expect(SHADER_PRESETS.length).toBeGreaterThanOrEqual(5);

    const ids = SHADER_PRESETS.map((p) => p.id);
    expect(ids).toContain("crt-easymode.glslp");
    expect(ids).toContain("crt-aperture.glslp");
    expect(ids).toContain("2xScaleHQ.glslp");
    expect(ids).toContain("disabled");
  });

  it("resolves default shader preset correctly", () => {
    expect(DEFAULT_SHADER_PRESET).toBe("crt-easymode.glslp");
    const defaultPreset = getShaderPresetById(DEFAULT_SHADER_PRESET);
    expect(defaultPreset.name).toBe("CRT EasyMode");
  });

  it("cycles to next shader preset sequentially and loops", () => {
    const first = SHADER_PRESETS[0];
    const second = getNextShaderPreset(first.id);
    expect(second.id).toBe(SHADER_PRESETS[1].id);

    const last = SHADER_PRESETS[SHADER_PRESETS.length - 1];
    const looped = getNextShaderPreset(last.id);
    expect(looped.id).toBe(SHADER_PRESETS[0].id);
  });

  it("handles unknown shader preset fallback gracefully", () => {
    const unknown = getShaderPresetById("non-existent-shader.glslp");
    expect(unknown.id).toBe(SHADER_PRESETS[0].id);

    const nextUnknown = getNextShaderPreset("non-existent-shader.glslp");
    expect(nextUnknown.id).toBe(SHADER_PRESETS[0].id);
  });
});
