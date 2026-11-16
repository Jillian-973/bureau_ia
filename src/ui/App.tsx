import { useState } from 'react';
import { Hud } from './panels/Hud';
import { OfficeScene } from './scene/OfficeScene';
import { QUALITY_SETTINGS } from './scene/quality';
import { readHourFromUrl, useParisHour } from './use-paris-hour';
import { useQuality } from './use-quality';

export function App() {
  const parisHour = useParisHour();
  const [simulatedHour, setSimulatedHour] = useState<number | null>(readHourFromUrl);
  const hour = simulatedHour ?? parisHour;
  const quality = useQuality();

  return (
    <main className="app">
      <OfficeScene
        hour={hour}
        quality={quality.level}
        onLowPerformance={quality.reportLowPerformance}
      />
      {/* Without post-processing, the vignette is a simple overlay that costs nothing. */}
      {QUALITY_SETTINGS[quality.level].effects === 'none' && (
        <div className="vignette" aria-hidden="true" />
      )}
      <Hud
        hour={hour}
        isSimulated={simulatedHour !== null}
        onSimulateHour={setSimulatedHour}
        qualityMode={quality.mode}
        qualityLevel={quality.level}
        onQualityChange={quality.setMode}
      />
    </main>
  );
}
