import { Maximize, ZoomIn, ZoomOut } from 'lucide-react';
import IconButton from '../../../design-system/components/IconButton/IconButton';
import { boardViewStore, useBoardViewControls } from '../../scene/camera/boardView';
import { useTranslation } from '../../../i18n/I18n';

/** One zoom button press: 1.5x in or out, about the center of the board view. */
const ZOOM_STEP = 1.5;

/**
 * Zoom in, zoom out and "back to the whole board" for the 3D board camera: the keyboard and mouse way to what a pinch, a drag and
 * the wheel do. Presentation only (it writes `boardViewStore`, never game state). It is drawn only while a 3D board is mounted, and
 * the reset key only while the view differs from the overview, so a player who never zooms sees a single extra pair of keys.
 */
export default function CameraControls() {
  const { t } = useTranslation();
  const { active, changed, atMaxZoom, atMinZoom } = useBoardViewControls();
  if (!active) return null;
  return (
    <div className="camera-controls" role="group" aria-label={t('camera.group')}>
      <IconButton
        label={t('camera.zoomIn')}
        icon={<ZoomIn />}
        disabled={atMaxZoom}
        onClick={() => boardViewStore.zoomBy(ZOOM_STEP)}
      />
      <IconButton
        label={t('camera.zoomOut')}
        icon={<ZoomOut />}
        disabled={atMinZoom}
        onClick={() => boardViewStore.zoomBy(1 / ZOOM_STEP)}
      />
      {changed ? <IconButton label={t('camera.reset')} icon={<Maximize />} onClick={() => boardViewStore.reset()} /> : null}
    </div>
  );
}
