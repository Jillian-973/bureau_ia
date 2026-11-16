import { useState } from 'react';
import { formatHour } from '../../shared/simulation/paris-time';

interface HudProps {
  /** Hour currently displayed by the scene. */
  hour: number;
  /** True when the hour comes from the slider instead of the real clock. */
  isSimulated: boolean;
  onSimulateHour: (hour: number | null) => void;
}

/** Compact control window, in the style of a JRPG dialog box. */
export function Hud({ hour, isSimulated, onSimulateHour }: HudProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <aside className="hud window">
      <button
        type="button"
        className="hud__summary"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span>{isSimulated ? 'Heure simulée' : 'Heure de Paris'}</span>
        <strong>{formatHour(hour)}</strong>
        <span className="hud__chevron" aria-hidden="true">
          {isOpen ? '▲' : '▼'}
        </span>
      </button>

      {isOpen && (
        <div className="hud__body">
          <label className="hud__field">
            <span>Simuler l'heure</span>
            <input
              type="range"
              min={0}
              max={24}
              step={0.25}
              value={hour}
              onChange={(event) => onSimulateHour(Number(event.target.value))}
            />
          </label>
          <button
            type="button"
            className="hud__button"
            disabled={!isSimulated}
            onClick={() => onSimulateHour(null)}
          >
            Revenir à l'heure réelle
          </button>
          <p className="hud__hint">Cliquez sur le sol pour déplacer l'avatar.</p>
        </div>
      )}
    </aside>
  );
}
