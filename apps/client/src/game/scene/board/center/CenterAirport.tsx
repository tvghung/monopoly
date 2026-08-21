import { boardVisualTokens } from '../boardVisualTokens';
import {
  CENTER_AIRPORT_FIELD_HEIGHT,
  CENTER_AIRPORT_SURFACE_Y,
} from '../architecture/boardArtSpec';
import RoundedBoxMesh from '../geometry/RoundedBoxMesh';
import AirportRunwayDashes from './AirportRunwayDashes';
import AirportRunwayLoop from './AirportRunwayLoop';
import CenterFieldDecor from './CenterFieldDecor';
import { AIRPORT_FIELD_SIZE } from './airportRunwayGeometry';

export const CENTER_DECORATION_MESH_COUNT = 4;
export const CENTER_DECORATION_THEME = 'airport';

export default function CenterAirport() {
  return (
    <group name="CenterAirport" position={[0, CENTER_AIRPORT_SURFACE_Y, 0]}>
      <RoundedBoxMesh
        name="AirportField"
        width={AIRPORT_FIELD_SIZE}
        height={CENTER_AIRPORT_FIELD_HEIGHT}
        depth={AIRPORT_FIELD_SIZE}
        radius={0.18}
        color={boardVisualTokens.airportField}
        materialProfile="centerWell"
        position={[0, CENTER_AIRPORT_FIELD_HEIGHT / 2, 0]}
      />
      <CenterFieldDecor />
      <AirportRunwayLoop />
      <AirportRunwayDashes />
    </group>
  );
}
