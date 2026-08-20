import { ConjunctionEvent } from '../types';

/**
 * Escapes a field for CSV format compliant with RFC 4180
 */
function escapeCsvValue(val: string | number | boolean | null | undefined): string {
  if (val === null || val === undefined) {
    return '';
  }
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generates and downloads a detailed CSV file containing conjunction threat telemetry
 * formatted for offline risk and trajectory analysis.
 */
export function exportConjunctionsToCSV(
  conjunctions: ConjunctionEvent[],
  customFilename?: string
): { success: boolean; count: number; filename: string } {
  if (!conjunctions || conjunctions.length === 0) {
    return { success: false, count: 0, filename: '' };
  }

  const headers = [
    'Conjunction_ID',
    'Risk_Level',
    'Risk_Score',
    'Primary_Object_Name',
    'Primary_Object_NORAD_ID',
    'Primary_Object_Type',
    'Secondary_Object_Name',
    'Secondary_Object_NORAD_ID',
    'Secondary_Object_Type',
    'TCA_UTC_Timestamp',
    'Time_To_TCA_Hours',
    'Time_To_TCA_Minutes',
    'Miss_Distance_km',
    'Miss_Distance_meters',
    'Relative_Velocity_km_s',
    'Relative_Speed_km_h',
    'Relative_Speed_Mach',
    'Distance_Score_Component',
    'Velocity_Score_Component',
    'Time_Score_Component',
    'Primary_ECI_X_km',
    'Primary_ECI_Y_km',
    'Primary_ECI_Z_km',
    'Secondary_ECI_X_km',
    'Secondary_ECI_Y_km',
    'Secondary_ECI_Z_km',
    'Advisory_DeltaV_ms',
    'Is_Simulated_Hazard'
  ];

  const rows = conjunctions.map((c) => {
    const minDistance = c.minDistanceKm ?? 0;
    const timeToEvent = c.breakdown?.timeToEventHours ?? c.timeToEventHours ?? 0;
    const relVel = c.relativeVelocityKmS ?? 0;
    const relSpeedKmh = relVel * 3600;
    const relSpeedMach = relSpeedKmh / 1234.8;
    const riskScore = c.riskScore ?? 0;

    return [
      escapeCsvValue(c.id),
      escapeCsvValue(c.riskLevel),
      escapeCsvValue(riskScore.toFixed(2)),
      escapeCsvValue(c.objectA?.name || 'Unknown Primary'),
      escapeCsvValue(c.objectA?.noradId || 'N/A'),
      escapeCsvValue(c.objectA?.classification || 'UNKNOWN'),
      escapeCsvValue(c.objectB?.name || 'Unknown Secondary'),
      escapeCsvValue(c.objectB?.noradId || 'N/A'),
      escapeCsvValue(c.objectB?.classification || 'UNKNOWN'),
      escapeCsvValue(c.tcaIso || 'N/A'),
      escapeCsvValue(timeToEvent.toFixed(3)),
      escapeCsvValue((timeToEvent * 60).toFixed(1)),
      escapeCsvValue(minDistance.toFixed(4)),
      escapeCsvValue((minDistance * 1000).toFixed(1)),
      escapeCsvValue(relVel.toFixed(3)),
      escapeCsvValue(relSpeedKmh.toFixed(1)),
      escapeCsvValue(relSpeedMach.toFixed(2)),
      escapeCsvValue(c.breakdown?.distanceScore?.toFixed(2) ?? 'N/A'),
      escapeCsvValue(c.breakdown?.velocityScore?.toFixed(2) ?? 'N/A'),
      escapeCsvValue(c.breakdown?.timeScore?.toFixed(2) ?? 'N/A'),
      escapeCsvValue(c.positionAAtTca?.x?.toFixed(4) ?? 'N/A'),
      escapeCsvValue(c.positionAAtTca?.y?.toFixed(4) ?? 'N/A'),
      escapeCsvValue(c.positionAAtTca?.z?.toFixed(4) ?? 'N/A'),
      escapeCsvValue(c.positionBAtTca?.x?.toFixed(4) ?? 'N/A'),
      escapeCsvValue(c.positionBAtTca?.y?.toFixed(4) ?? 'N/A'),
      escapeCsvValue(c.positionBAtTca?.z?.toFixed(4) ?? 'N/A'),
      escapeCsvValue('4.8'),
      escapeCsvValue(c.isSimulatedHazard ? 'TRUE' : 'FALSE')
    ].join(',');
  });

  const csvContent = [headers.join(','), ...rows].join('\r\n');

  const now = new Date();
  const timestampStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = customFilename || `conjunction_risk_assessment_${timestampStr}.csv`;

  // Create Blob and initiate download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return { success: true, count: conjunctions.length, filename };
}
