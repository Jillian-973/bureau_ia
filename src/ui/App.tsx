import { useState } from 'react';
import { Hud } from './panels/Hud';
import { OfficeScene } from './scene/OfficeScene';
import { readHourFromUrl, useParisHour } from './use-paris-hour';

export function App() {
  const parisHour = useParisHour();
  const [simulatedHour, setSimulatedHour] = useState<number | null>(readHourFromUrl);
  const hour = simulatedHour ?? parisHour;

  return (
    <main className="app">
      <OfficeScene hour={hour} />
      <Hud hour={hour} isSimulated={simulatedHour !== null} onSimulateHour={setSimulatedHour} />
    </main>
  );
}
