export interface ShaderPreset {
  id: string;
  name: string;
  description: string;
}

export const SHADER_PRESETS: ShaderPreset[] = [
  {
    id: "crt-easymode.glslp",
    name: "CRT EasyMode",
    description: "Authentic flat CRT scanlines & shadow mask (Recommended)",
  },
  {
    id: "crt-aperture.glslp",
    name: "CRT Trinitron",
    description: "Sony Trinitron-style aperture grille phosphor strips",
  },
  {
    id: "crt-geom.glslp",
    name: "CRT Curved",
    description: "Curved retro arcade glass curvature and beam glow",
  },
  {
    id: "crt-mattias.glslp",
    name: "CRT Vintage",
    description: "Warm retro television bloom with rounded bezel corners",
  },
  {
    id: "2xScaleHQ.glslp",
    name: "ScaleHQ 2x",
    description: "Intelligent edge-directed vector smoothing (NEDI/xBR style)",
  },
  {
    id: "4xScaleHQ.glslp",
    name: "ScaleHQ 4x",
    description: "High-definition edge interpolation for smooth sprites",
  },
  {
    id: "disabled",
    name: "Raw Pixels",
    description: "Unfiltered 1:1 pixel grid without post-processing",
  },
];

export const DEFAULT_SHADER_PRESET = "crt-easymode.glslp";

export function getShaderPresetById(id: string): ShaderPreset {
  return (
    SHADER_PRESETS.find((p) => p.id === id) ||
    SHADER_PRESETS[0]
  );
}

export function getNextShaderPreset(currentId: string): ShaderPreset {
  const currentIndex = SHADER_PRESETS.findIndex((p) => p.id === currentId);
  if (currentIndex === -1) return SHADER_PRESETS[0];
  const nextIndex = (currentIndex + 1) % SHADER_PRESETS.length;
  return SHADER_PRESETS[nextIndex];
}
