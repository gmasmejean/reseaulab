import { useSession } from '../context';
import { ZOOM_STEPS } from '../session';

/** Zoom of the plan: − / + / real size / fit, in a corner of the stage. */
export function ZoomControls() {
  const session = useSession();
  const zoom = session.zoom;
  const percent = `${String(Math.round(zoom * 100))} %`;
  return (
    <div className="zoom-controls" role="group" aria-label="Zoom du plan">
      <button
        type="button"
        aria-label="Réduire le plan"
        title="Réduire (Ctrl + molette)"
        disabled={zoom <= ZOOM_STEPS[0]}
        onClick={() => {
          session.zoomStep(-1);
        }}
      >
        −
      </button>
      <button
        type="button"
        className="zoom-value"
        aria-label={`Zoom : ${percent}. Revenir à la taille réelle`}
        title="Taille réelle (100 %)"
        onClick={() => {
          session.setZoom(1);
        }}
      >
        {percent}
      </button>
      <button
        type="button"
        aria-label="Agrandir le plan"
        title="Agrandir (Ctrl + molette)"
        disabled={zoom >= (ZOOM_STEPS.at(-1) ?? 2)}
        onClick={() => {
          session.zoomStep(1);
        }}
      >
        +
      </button>
      <button
        type="button"
        aria-pressed={session.autoFit}
        title="Afficher tout le plan, et le garder ajusté à la fenêtre"
        onClick={() => {
          session.fitPlan();
        }}
      >
        Ajuster
      </button>
    </div>
  );
}
