import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { TelemetryProvider, useTelemetry } from './context/TelemetryContext';
import HomePage from './pages/HomePage';
import EarthPage from './pages/EarthPage';
import AlertPage from './pages/AlertPage';
import { SettingsModal } from './components/SettingsModal';
import { ArchitectureModal } from './components/ArchitectureModal';
import { SatelliteDossierModal } from './components/SatelliteDossierModal';
import { CheckCircle2, AlertTriangle, Radio } from 'lucide-react';

/**
 * AppModalsAndToasts — handles global modals and toast notifications
 * across all routes.
 */
function AppModalsAndToasts() {
  const {
    toastMessage,
    status,
    isSettingsOpen,
    isArchOpen,
    isDossierOpen,
    selectedObject,
    conjunctions,
    setIsSettingsOpen,
    setIsArchOpen,
    setIsDossierOpen,
    setSelectedObject,
    setActiveTab,
    handleSaveConfig
  } = useTelemetry();

  return (
    <>
      {/* Toast Notification */}
      {toastMessage && (
        <div
          id="system-toast"
          className={`fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-xl shadow-2xl border text-xs font-semibold flex items-center gap-2 backdrop-blur-md transition-all ${
            toastMessage.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-200 shadow-[0_0_20px_rgba(16,185,129,0.2)]'
              : toastMessage.type === 'warn'
              ? 'bg-red-950/80 border-red-500/50 text-red-200 shadow-[0_0_20px_rgba(239,68,68,0.2)]'
              : 'bg-slate-900/80 border-blue-500/50 text-blue-200 shadow-[0_0_20px_rgba(59,130,246,0.2)]'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : toastMessage.type === 'warn' ? (
            <AlertTriangle className="w-4 h-4 text-red-400" />
          ) : (
            <Radio className="w-4 h-4 text-blue-400" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={status?.config || {
          datasetSize: 35,
          predictionHours: 24,
          timeStepSeconds: 60,
          distanceThresholdKm: 15,
          riskWeights: { distance: 0.6, velocity: 0.25, time: 0.15 },
          riskThresholds: { critical: 80, high: 60, medium: 30 }
        }}
        onSaveConfig={handleSaveConfig}
      />

      {/* System Architecture Modal */}
      <ArchitectureModal
        isOpen={isArchOpen}
        onClose={() => setIsArchOpen(false)}
      />

      {/* Satellite Dossier Modal */}
      <SatelliteDossierModal
        isOpen={isDossierOpen}
        object={selectedObject}
        conjunctions={conjunctions}
        onClose={() => setIsDossierOpen(false)}
        onTrackIn3D={(obj) => {
          setSelectedObject(obj);
          setActiveTab('3D');
          setIsDossierOpen(false);
        }}
        onSwitchTo2D={(obj) => {
          setSelectedObject(obj);
          setActiveTab('2D');
          setIsDossierOpen(false);
        }}
      />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <TelemetryProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/earth" element={<EarthPage />} />
          <Route path="/alert" element={<AlertPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <AppModalsAndToasts />
      </TelemetryProvider>
    </BrowserRouter>
  );
}
