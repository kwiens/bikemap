'use client';

import { useField } from '@payloadcms/ui';
import type { TrailGeometry } from '@/payload/osm/geometry';
import { GeometryMapEditor } from './GeometryMapEditor';

export function TrailMapEditor({
  path,
  readOnly,
}: {
  path: string;
  readOnly?: boolean;
}) {
  const {
    errorMessage: geomError,
    setValue: setGeom,
    showError: showGeomError,
    value: geomValue,
  } = useField<TrailGeometry | string | null>({ path });
  const { setValue: setOsmIds, value: osmIdsValue } = useField<
    number[] | string
  >({ path: 'osmIds' });
  const { setValue: setGeometrySource, value: geometrySource } =
    useField<string>({ path: 'geometrySource' });
  const { setValue: setRebuild } = useField<boolean>({
    path: 'rebuildGeometry',
  });
  const { setValue: setBounds } = useField({ path: 'bounds' });
  const { setValue: setDistance } = useField({ path: 'distance' });
  const { setValue: setElevationGain } = useField({ path: 'elevationGain' });
  const { setValue: setElevationLoss } = useField({ path: 'elevationLoss' });
  const { setValue: setElevationMax } = useField({ path: 'elevationMax' });
  const { setValue: setElevationMin } = useField({ path: 'elevationMin' });
  const { setValue: setElevationProfile } = useField({
    path: 'elevationProfile',
  });
  const { setValue: setOsmReport } = useField({ path: 'osmReport' });
  const { value: displayName } = useField<string>({ path: 'displayName' });
  const { setValue: setTrailName, value: trailName } = useField<string>({
    path: 'trailName',
  });

  return (
    <GeometryMapEditor
      readOnly={readOnly}
      label="Trail line"
      geometry={{
        value: geomValue,
        setValue: setGeom,
        errorMessage: showGeomError ? geomError : undefined,
      }}
      name={{ value: trailName, setValue: setTrailName }}
      osm={{
        ids: osmIdsValue,
        source: geometrySource,
        setIds: setOsmIds,
        setSource: setGeometrySource,
        setRebuild,
        setReport: setOsmReport,
        displayName,
        onPreview(body) {
          setBounds(body.measurements.bounds);
          setDistance(body.measurements.distance);
          setElevationGain(body.measurements.elevationGain);
          setElevationLoss(body.measurements.elevationLoss);
          setElevationMax(body.measurements.elevationMax);
          setElevationMin(body.measurements.elevationMin);
          setElevationProfile(body.profile);
        },
      }}
    />
  );
}
