import { Canvas, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import type { DeckCounts } from '@monopoly/shared';
import type { CardPresentationSignal } from '../../presentation/store/types';
import {
  ActivePhysicalCard,
  type PhysicalCardInteraction,
} from '../../scene/cards/PhysicalCardDecks';
import {
  CARD_FOCUS_VIEWPORT_HEIGHT_RATIO,
  CARD_FOCUS_VIEWPORT_WIDTH_RATIO,
  PHYSICAL_CARD_DEPTH,
  PHYSICAL_CARD_WIDTH,
} from '../../scene/cards/physicalCardLayout';

function FocusRendererDiagnostics({ stage }: { stage: CardPresentationSignal['stage'] }) {
  const gl = useThree(state => state.gl);
  const viewportWidth = useThree(state => state.viewport.width);
  const viewportHeight = useThree(state => state.viewport.height);
  useEffect(() => {
    const localDiagnostics = window.location.hostname === '127.0.0.1'
      || window.location.hostname === 'localhost'
      || new URLSearchParams(window.location.search).get('phase4-uat') === '1';
    if (!localDiagnostics) return undefined;
    let measurementFrame = 0;
    const publish = () => {
      const focusScale = Math.min(
        viewportWidth * CARD_FOCUS_VIEWPORT_WIDTH_RATIO / PHYSICAL_CARD_WIDTH,
        viewportHeight * CARD_FOCUS_VIEWPORT_HEIGHT_RATIO / PHYSICAL_CARD_DEPTH,
      );
      const diagnostics = {
        stage,
        drawCalls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        cardWidthRatio: viewportWidth > 0 ? focusScale * PHYSICAL_CARD_WIDTH / viewportWidth : 0,
        cardHeightRatio: viewportHeight > 0 ? focusScale * PHYSICAL_CARD_DEPTH / viewportHeight : 0,
      };
      window.__OWN_THE_BLOCK_CARD_FOCUS_DIAGNOSTICS__ = diagnostics;
      window.dispatchEvent(new CustomEvent('own-the-block-card-focus', { detail: diagnostics }));
    };
    measurementFrame = window.requestAnimationFrame(() => {
      measurementFrame = window.requestAnimationFrame(publish);
    });
    return () => {
      window.cancelAnimationFrame(measurementFrame);
      delete window.__OWN_THE_BLOCK_CARD_FOCUS_DIAGNOSTICS__;
    };
  }, [gl, stage, viewportHeight, viewportWidth]);
  return null;
}

export default function CardFocusLayer({
  signal,
  deckCounts,
  interaction,
  onBackdropClick,
}: {
  signal: CardPresentationSignal;
  deckCounts: DeckCounts;
  interaction: PhysicalCardInteraction;
  onBackdropClick?: () => void;
}) {
  const canRenderCanvas = typeof window !== 'undefined' && typeof ResizeObserver !== 'undefined';
  return (
    <div
      className="card-focus-overlay__canvas"
      data-testid="card-focus-canvas"
      aria-hidden="true"
    >
      {canRenderCanvas ? <Canvas
        orthographic
        camera={{ position: [0, 0, 10], near: 0.1, far: 100, zoom: 1 }}
        dpr={[1, 1.5]}
        frameloop="demand"
        shadows={false}
        gl={{
          alpha: true,
          antialias: true,
          powerPreference: 'high-performance',
          toneMappingExposure: 1,
        }}
        onPointerMissed={onBackdropClick}
      >
        <FocusRendererDiagnostics stage={signal.stage} />
        <ambientLight intensity={1.6} color="#fffaf0" />
        <directionalLight position={[2, 4, 5]} intensity={2.2} color="#fff8e8" />
        <ActivePhysicalCard
          signal={signal}
          deckCounts={deckCounts}
          interaction={interaction}
          focus
        />
      </Canvas> : <div
        className="card-focus-layer__test-surface"
        onPointerDown={onBackdropClick}
        aria-hidden="true"
      />}
    </div>
  );
}
