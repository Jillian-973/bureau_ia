import {
  Bloom,
  BrightnessContrast,
  EffectComposer,
  HueSaturation,
  TiltShift,
  ToneMapping,
  Vignette,
} from '@react-three/postprocessing';
import { KernelSize, ToneMappingMode } from 'postprocessing';

/** 'full' is the complete HD-2D look; 'light' trades some finesse for speed. */
export type EffectsLevel = 'full' | 'light';

/**
 * Brightness above which a surface glows. Lit surfaces stay below it;
 * emissive ones (lamps, screens, windows) are authored above it.
 */
const BLOOM_THRESHOLD = 1.25;

interface EffectsProps {
  level: EffectsLevel;
}

/**
 * HD-2D post-processing: glow of the light sources (bloom), miniature-style
 * depth blur (tilt-shift), colour grading and vignette.
 */
export function Effects({ level }: EffectsProps) {
  const full = level === 'full';
  return (
    <EffectComposer multisampling={full ? 4 : 0}>
      {/* Tilt-shift comes first: it replaces pixels, so the bloom must be added after it. */}
      <TiltShift
        focusArea={0.6}
        feather={0.5}
        kernelSize={full ? KernelSize.SMALL : KernelSize.VERY_SMALL}
        resolutionScale={full ? 1 : 0.5}
      />
      {/* Only light sources (emissive surfaces above the threshold) glow. */}
      <Bloom
        mipmapBlur
        intensity={full ? 0.4 : 0.33}
        luminanceThreshold={BLOOM_THRESHOLD}
        luminanceSmoothing={0.25}
        radius={0.35}
        levels={full ? 6 : 4}
      />
      {/* The composer disables the renderer tone mapping, so it is applied here. */}
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      <HueSaturation saturation={0.12} />
      <BrightnessContrast contrast={0.06} />
      <Vignette offset={0.3} darkness={0.6} />
    </EffectComposer>
  );
}
