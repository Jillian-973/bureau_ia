import { useState } from 'react';
import { formatHour } from '../../shared/simulation/paris-time';
import { useFps } from '../fps-store';
import { QUALITY_LABELS } from '../scene/quality';
import type { QualityLevel, QualityMode } from '../scene/quality';

const QUALITY_CHOICES: readonly QualityMode[] = ['auto', 'high', 'medium', 'low'];

interface HudProps {
  /** Hour currently displayed by the scene. */
  hour: number;
  /** True when the hour comes from the slider instead of the real clock. */
  isSimulated: boolean;
  onSimulateHour: (hour: number | null) => void;
  qualityMode: QualityMode;
  /** Level actually applied (differs from the mode when it is automatic). */
  qualityLevel: QualityLevel;
  onQualityChange: (mode: QualityMode) => void;
}

function FpsLabel() {
  const fps = useFps();
  return <span className="hud__fps">{fps > 0 ? `${fps} i/s` : '– i/s'}</span>;
}

/** Compact control window, in the style of a JRPG dialog box. */
export function Hud({
  hour,
  isSimulated,
  onSimulateHour,
  qualityMode,
  qualityLevel,
  onQualityChange,
}: HudProps) {
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
        <FpsLabel />
        <span className="hud__chevron" aria-hidden="true">
          {isOpen ? '▲' : '▼'}
        </span>
      </button>

      {isOpen && (
        <div className="hud__body">
          <fieldset className="hud__field">
            <legend>
              Qualité graphique
              {qualityMode === 'auto' && ` (${QUALITY_LABELS[qualityLevel].toLowerCase()})`}
            </legend>
            <div className="hud__choices">
              {QUALITY_CHOICES.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  className="hud__choice"
                  aria-pressed={qualityMode === choice}
                  onClick={() => onQualityChange(choice)}
                >
                  {QUALITY_LABELS[choice]}
                </button>
              ))}
            </div>
          </fieldset>

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
          <p className="hud__hint">
            Cliquez sur le sol pour déplacer l'avatar. Glissez pour déplacer la vue, molette pour
            zoomer.
          </p>
        </div>
      )}
    </aside>
  );
}
