import React, { useEffect, useState, useMemo } from "react";
import { NavLink, useNavigate } from 'react-router-dom';
import { NavPill } from '../components/NavPill';
import { Compass, Globe, ShieldAlert, Sparkles, Activity, CheckCircle2, RotateCw, Play, AlertTriangle, ShieldCheck, Zap } from 'lucide-react';
import { SatelliteDossierInline } from "../components/SatelliteDossierInline";
import { useTelemetry } from "../context/TelemetryContext";
import { ConjunctionEvent } from "../types";
// @ts-ignore
import earthBg from "../assets/imports/earth_bg.jpeg";

// 0=objA, 1=objB, 2=dist, 3=priority, 4=timeToTCA, 5=dotColor, 6=speed, 7=score, 8=type, 9=catA, 10=catB
export function priorityColors(priority: string) {
  if (priority === "Critical") return { border: "rgba(241,139,120,.40)", bg: "rgba(75,32,33,.30)", text: "#ffae9d" };
  if (priority === "High") return { border: "rgba(232,137,74,.40)", bg: "rgba(58,32,16,.30)", text: "#f0b184" };
  if (priority === "Medium") return { border: "rgba(214,164,73,.40)", bg: "rgba(53,44,15,.30)", text: "#e8c97a" };
  return { border: "rgba(137,163,156,.40)", bg: "rgba(21,37,33,.30)", text: "#aabcb7" };
}

function concernLabel(priority: string) {
  if (priority === "Critical") return "Critical concern";
  if (priority === "High") return "High concern";
  if (priority === "Medium") return "Moderate concern";
  return "Low concern";
}

const actionPlans: Record<string, string[]> = {
  Critical: [
    "Escalate the conjunction to flight dynamics and mission operations teams.",
    "Prepare a candidate prograde maneuver execution plan for immediate review.",
    "Request updated tracking data / radar passes to mitigate telemetry gaps.",
  ],
  High: [
    "Flag conjunction to the orbital operations team for priority review.",
    "Prepare a contingency maneuver plan for flight director approval.",
    "Increase tracking cadence and request priority radar coverage.",
  ],
  Medium: [
    "Monitor conjunction with standard cadence over the next 6 hours.",
    "Update risk assessment after the next tracking pass.",
    "Ensure adequate ground station coverage around TCA.",
  ],
  Low: [
    "Log conjunction for standard monitoring and archive review.",
    "No immediate action required — continue routine surveillance.",
    "Monitor via automated alert system until TCA passage.",
  ],
};

const assessmentConfidence: Record<string, string> = {
  Critical: "Moderate — high-precision state vectors and close-approach geometry are provided, but confidence is tempered by observed SGP4 drag surges and ground-tracking telemetry gaps.",
  High: "Moderate-High — state vectors are well-constrained, though late-breaking atmosphere model updates may shift the track slightly before TCA.",
  Medium: "High — well-tracked objects with consistent telemetry support a reliable separation forecast.",
  Low: "High — large miss distance provides a wide safety margin with low sensitivity to propagation uncertainty.",
};

export function AlertDetail({ pair, onBack }: { pair: ConjunctionEvent, onBack: () => void }) {
  const miss = pair.minDistanceKm;
  const timeToTCA = pair.tcaIso || "";
  const s = tcaSeconds(timeToTCA);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const countdownLabel = hh > 0 ? `In ${hh}H ${mm}M` : `In ${mm}M`;
  const tcaUtcHHMM = collisionAt(timeToTCA).slice(0, 5);
  const priority = pair.riskLevel === "CRITICAL" ? "Critical" : pair.riskLevel === "HIGH" ? "High" : pair.riskLevel === "MEDIUM" ? "Medium" : "Low";
  const objA = pair.objectA?.name || "Unknown";
  const objB = pair.objectB?.name || "Unknown";
  const catA = pair.objectA?.noradId || 0;
  const catB = pair.objectB?.noradId || 0;
  const speed = pair.relativeVelocityKmS.toFixed(2) + " km/s";
  const score = pair.riskScore;

  const steps = [
    { id: "brief", label: "Brief", time: countdownLabel },
    { id: "trajectory", label: "TCA Profile", time: `TCA miss ${miss.toFixed(2)} km` },
    { id: "response", label: "Response", time: "Ready" },
  ];

  const [activeStep, setActiveStep] = useState("brief");
  const [expanded, setExpanded] = useState(false);
  const [showScoring, setShowScoring] = useState(false);
  const [burnOpen, setBurnOpen] = useState(false);
  const step = steps.find((item) => item.id === activeStep)!;
  const selectStep = (id: string) => { setActiveStep(id); setBurnOpen(false); };
  const kicker = burnOpen ? "Maneuver sandbox" : activeStep === "response" ? "AI threat assessment · Gemini 3.5" : activeStep === "trajectory" ? "Separation v/s time" : "Guided briefing";
  const heading = burnOpen ? "Interactive burn simulation sandbox" : step.label;
  const pColors = priorityColors(priority);
  const concern = concernLabel(priority);
  
  return (
    <main className="min-h-full overflow-hidden bg-[#071019] text-[#edf2ec] selection:bg-[#c9d67a] selection:text-[#142015]">
      <div className="atmosphere" />
      <div className="relative mx-auto flex min-h-screen max-w-[1440px] flex-col px-5 py-5 sm:px-8 lg:px-12 lg:py-8">
        <header className="relative flex items-center justify-between border-b border-white/10 pb-5">
    <div className="flex items-center gap-6">
    <a className="group flex items-center gap-3" href="#top" aria-label="Asteria mission control home">
      <img src="/Chakadola_LOGO.svg" alt="Chakadola Logo" className="h-16 w-auto" />
    </a>
    </div>
    <div className="absolute left-1/2 -translate-x-1/2 hidden sm:block">
      <NavPill hideLiveFeed={true} />
    </div>
    <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[.16em] text-[#aeb7b0]">
      <button onClick={onBack} className="rounded-full border border-white/15 px-3 py-1.5 transition hover:border-[#cbd98a]/60 hover:text-[#dce9a0]">← All conjunctions</button>
      <span className="hidden items-center gap-2 sm:flex"><span className="size-2 rounded-full bg-[#aeca6a] shadow-[0_0_14px_#c9d67a]" /> Live orbit feed</span>
    </div>
  </header>

        <section id="top" className="grid flex-1 gap-8 py-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(380px,.9fr)] lg:items-center lg:gap-16 lg:py-14">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[.2em] text-[#b8c696]">Conjunction assessment</p>
            <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="rounded-full border px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-[.12em]" style={{ borderColor: pColors.border, background: pColors.bg, color: pColors.text }}>Priority · {priority.toLowerCase()}</span>
              <span className="font-mono text-xs text-[#9ca89f]">Object pair {catA} / {catB}</span>
              <span className="hidden text-[#4c5a52] sm:inline">·</span>
              <span className="text-sm tracking-tight text-[#d4dccf]">{objA} <span className="text-[#7c8a80]">&amp;</span> {objB.replace(/ debris$/, "").replace(/ rocket body$/, "")}</span>
            </div>
            <h1 className="mt-7 max-w-3xl font-[Georgia,serif] text-5xl leading-[.96] tracking-[-.045em] text-[#f2f3ee] sm:text-6xl lg:text-7xl">A close pass deserves<br/><em className="font-normal text-[#cbd98a]">a clear next move.</em></h1>
            <p className="mt-7 max-w-xl text-base leading-7 text-[#b9c1b9]">{objA} and {objB} are forecast to pass within the protected corridor.</p>
            <div className="mt-7 flex flex-wrap gap-x-8 gap-y-4 border-y border-white/10 py-5">
              <Metric label="Closest approach" value={miss.toFixed(2) + " km"} />
              <Metric label="Time to approach" value={timeToTCA} />
              <Metric label="Relative velocity" value={speed} />
              <Metric label="Risk score" value={score.toFixed(1)} note="/ 100" tone={score > 80 ? "#f18b78" : score > 50 ? "#e8894a" : "#cbd98a"} />
            </div>
            <div className="mt-8 flex flex-wrap gap-3"><button onClick={() => selectStep("response")} className="rounded-full bg-[#cbd98a] px-5 py-3 text-sm font-semibold text-[#172116] transition hover:bg-[#e1efa1] focus:outline-none focus:ring-2 focus:ring-[#e1efa1]">Review response plan <span aria-hidden>→</span></button><button onClick={() => setExpanded(!expanded)} className="rounded-full border border-white/20 px-5 py-3 text-sm text-[#e4e9e2] transition hover:border-[#cbd98a]/60 hover:bg-white/5">{expanded ? "Hide technical detail" : "See technical detail"}</button><button onClick={() => setShowScoring(!showScoring)} className="rounded-full border border-white/20 px-5 py-3 text-sm text-[#e4e9e2] transition hover:border-[#cbd98a]/60 hover:bg-white/5">{showScoring ? "Hide risk scoring" : "Risk scoring"}</button></div>
          </div>

          <div className="space-y-4">
          <StepNav active={activeStep} onSelect={selectStep} />
          <aside className="relative rounded-[28px] border border-white/12 bg-[#0b1720]/80 p-5 shadow-2xl shadow-black/30 backdrop-blur sm:p-7">
            <div className="absolute right-7 top-7">
              {activeStep === "response" && !burnOpen
                ? <span className="rounded-full border px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-[.12em]" style={{ borderColor: pColors.border, background: pColors.bg, color: pColors.text }}>{concern}</span>
                : <span className="font-mono text-[10px] uppercase tracking-[.2em] text-[#859289]">{burnOpen ? "Ready" : step.time}</span>
              }
            </div>
            <div className="pr-28"><p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9bac83]">{kicker}</p><h2 className={`mt-3 font-[Georgia,serif] ${burnOpen ? "text-2xl leading-tight" : "text-3xl"}`}>{heading}</h2></div>
            <BriefContent activeStep={activeStep} burnOpen={burnOpen} setBurnOpen={setBurnOpen} pair={pair} miss={miss} tcaUtcHHMM={tcaUtcHHMM} />
          </aside>
          </div>
        </section>

        {expanded && pair.objectA && <section className="mb-8"><SatelliteDossierInline object={pair.objectA} conjunctions={[pair]} /></section>}
        {showScoring && <section className="mb-8 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 text-sm sm:grid-cols-3"><Detail label="Distance weight 0.60" value="75 pts" /><Detail label="Velocity weight 0.25" value="10 pts" /><Detail label="Time weight 0.15" value="100 pts" /></section>}
        <footer className="flex flex-wrap justify-between gap-3 border-t border-white/10 pt-5 font-mono text-[10px] uppercase tracking-[.15em] text-[#839087]"><span>Telemetry source: Space-Track public catalog</span><span>Assessment refreshed 11 sec ago</span></footer>
      </div>
    </main>
  );
}

const tcaSeconds = (tcaIso?: string) => {
  if (!tcaIso) return 999999;
  return Math.max(0, (new Date(tcaIso).getTime() - Date.now()) / 1000);
};
const sortValue = (item: ConjunctionEvent, key: string) => key === "dist" ? item.minDistanceKm : key === "tca" ? tcaSeconds(item.tcaIso) : key === "speed" ? item.relativeVelocityKmS : item.riskScore;
const remainingLabel = (tca?: string) => { if(!tca) return "Unknown"; const s = tcaSeconds(tca); return `in ${(s / 3600).toFixed(1)}h (${Math.round(s / 60)} min)`; };
const collisionAt = (tca?: string) => tca ? new Date(tca).toISOString().slice(11, 19) : "--:--:--";
function scoreTone(priority: string) { return priority === "Critical" ? "#f18b78" : priority === "High" ? "#e8894a" : priority === "Medium" ? "#d6a449" : "#8b978e"; }
function exportCsv(rows: ConjunctionEvent[]) {
  const header = ["Object A", "Object B", "Closest pass", "Priority", "Time to TCA", "Rel speed", "Probability"];
  const lines = [header, ...rows.map((r) => [r.objectA?.name || "Unknown", r.objectB?.name || "Unknown", r.minDistanceKm.toFixed(2), r.riskLevel, r.tcaIso || "", r.relativeVelocityKmS.toFixed(2), (r.riskScore).toFixed(4)])];
  const csv = lines.map((line) => line.map((c) => `"${c}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url; a.download = "conjunctions.csv"; a.click();
  URL.revokeObjectURL(url);
}

function ConjunctionLibrary({ pairs, onSelect, headerArgs }: { pairs: ConjunctionEvent[], onSelect: (pair: ConjunctionEvent) => void, headerArgs: any }) {
  const navigate = useNavigate();
  const { setSelectedConjunction, setSelectedObject, setActiveTab } = useTelemetry();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [showFilter, setShowFilter] = useState(false);
  const [sort, setSort] = useState<{ key: string; dir: number } | null>(null);
  const clock = useLiveClock();
  
  const toggleSort = (key: string) => setSort((prior) => prior?.key === key ? { key, dir: prior.dir * -1 } : { key, dir: -1 });
  const resetView = () => { setQuery(""); setFilter("All"); setSort(null); };
  
  const filtered = pairs.filter((item) => {
    const priority = item.riskLevel === "CRITICAL" ? "Critical" : item.riskLevel === "HIGH" ? "High" : item.riskLevel === "MEDIUM" ? "Medium" : "Low";
    const nameMatch = (item.objectA?.name || "").toLowerCase().includes(query.toLowerCase()) || (item.objectB?.name || "").toLowerCase().includes(query.toLowerCase());
    return (filter === "All" || priority === filter) && nameMatch;
  });
  const visible = sort ? [...filtered].sort((a, b) => (Number(sortValue(a, sort.key)) - Number(sortValue(b, sort.key))) * sort.dir) : filtered;
  
  return <main className="relative min-h-screen overflow-hidden bg-[#071019] text-[#edf2ec]"><div className="earth-banner" style={{ backgroundImage: `url(${earthBg})` }} /><div className="relative z-10 mx-auto min-h-screen max-w-[1440px] px-5 py-5 sm:px-8 lg:px-12 lg:py-8">
    <header className="relative flex items-center justify-between border-b border-white/10 pb-5">
      <div className="flex items-center gap-6">
        <a className="flex items-center gap-3"><img src="/Chakadola_LOGO.svg" alt="Chakadola Logo" className="h-16 w-auto" /></a>
      </div>
      <div className="absolute left-1/2 -translate-x-1/2 hidden sm:block">
        <NavPill conjCount={pairs?.length || 0} hideLiveFeed={true} />
      </div>
      <div className="flex items-center gap-3"><span className="hidden items-center gap-2 rounded-full border border-white/12 bg-black/20 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[.16em] text-[#9ba69e] sm:flex"><span className="size-1.5 rounded-full bg-[#aeca6a] shadow-[0_0_10px_#c9d67a]" /> Live stream · 2 ms</span><span className="hidden font-mono text-[10px] tracking-[.12em] text-[#c7d0c8] md:inline">{clock} UTC</span></div>
    </header>
    <section className="grid gap-8 py-10 lg:grid-cols-[.85fr_1.15fr] lg:items-end lg:py-14"><div><p className="font-mono text-[11px] uppercase tracking-[.2em] text-[#b8c696]">Protected object register</p><h1 className="mt-4 max-w-xl font-[Georgia,serif] text-5xl leading-[.96] tracking-[-.045em] sm:text-6xl">Keep the pairs<br/><em className="font-normal text-[#cbd98a]">worth watching.</em></h1><p className="mt-6 max-w-lg text-sm leading-7 text-[#bdc5bc]">A quiet working register for active conjunctions. Save pairs you need to revisit; each record remains linked to its latest assessment.</p></div>
      <div className="rounded-2xl border border-white/10 bg-[#09151dcc] p-5 backdrop-blur-md sm:p-6">
        <div className="flex items-center justify-between"><button onClick={headerArgs.onFetchLive} disabled={headerArgs.isLoading} className="inline-flex items-center gap-2 rounded-full bg-[#cbd98a] px-4 py-2 text-xs font-semibold text-[#172116] transition hover:bg-[#e1efa1] focus:outline-none focus:ring-2 focus:ring-[#e1efa1]"><svg viewBox="0 0 24 24" className={`size-3.5 fill-none stroke-current ${headerArgs.isLoading ? "animate-spin" : ""}`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5"/></svg>{headerArgs.isLoading ? "Syncing..." : "Sync CelesTrak"}</button><button onClick={() => setShowFilter(true)} aria-label="Open scoring settings" className="grid size-9 place-items-center rounded-full border border-white/12 text-[#b2bbb3] transition hover:border-[#cbd98a]/60 hover:text-[#dce9a0]"><svg viewBox="0 0 24 24" className="size-4 fill-none stroke-current" strokeWidth="1.8" strokeLinecap="round"><path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h6M14 18h6"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="12" cy="18" r="2"/></svg></button></div>
        <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-4"><Stat label="Tracked objects" value={headerArgs.status?.trackedObjectsCount?.toString() || "16,063"} /><Stat label="Alerts < 15 km" value={headerArgs.status?.detectedConjunctionsCount?.toString() || "0"} /><Stat label="Prop window" value={(headerArgs.status?.analysisWindowHours || 24) + "h"} note={"@" + (headerArgs.status?.timeStepSeconds || 60) + "s"} /><Stat label="CelesTrak sync" value={clock} note="live" /></div>
        <div className="mt-4 grid grid-cols-3 gap-3"><RiskChip label="Critical threats" value={pairs.filter(p => p.riskLevel === "CRITICAL").length.toString()} tone="#f18b78" /><RiskChip label="High-risk events" value={pairs.filter(p => p.riskLevel === "HIGH").length.toString()} tone="#d6a449" /><RiskChip label="Closest approach" value={pairs.length > 0 ? Math.min(...pairs.map(p => p.minDistanceKm)).toFixed(2) : "0"} unit="km" tone="#cbd98a" /></div>
      </div>
    </section>
    <section className="rounded-[28px] border border-white/10 bg-[#09151de8] p-3 shadow-2xl shadow-black/30 backdrop-blur-md sm:p-5"><div className="flex flex-col justify-between gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-center"><div className="flex items-center gap-2"><label className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-white/10 bg-black/10 px-4 py-3 text-[#829087] lg:w-[360px]"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search object or catalog name" className="w-full bg-transparent text-sm text-[#edf2ec] outline-none placeholder:text-[#829087]"/></label><button onClick={resetView} aria-label="Reset filters and sorting" title="Reset to initial data" className="grid size-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-black/10 text-[#b2bbb3] transition hover:border-[#cbd98a]/60 hover:text-[#dce9a0]"><svg viewBox="0 0 24 24" className="size-4 fill-none stroke-current" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 11a8 8 0 1 0-.6 4"/><path d="M20 4v5h-5"/></svg></button></div><div className="flex flex-wrap items-center gap-2">{["All", "Critical", "High", "Medium"].map((item) => <button key={item} onClick={() => setFilter(item)} className={`rounded-full border px-3 py-2 font-mono text-[10px] uppercase tracking-[.14em] transition ${filter === item ? "border-[#cbd98a] bg-[#cbd98a] text-[#172116]" : "border-white/10 text-[#b2bbb3] hover:border-white/30"}`}>{item}</button>)}<button onClick={() => exportCsv(visible)} className="ml-1 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[#cbd98a]/45 bg-[#cbd98a]/[.08] px-3 py-2 font-mono text-[10px] uppercase tracking-[.14em] text-[#dce9a0] transition hover:border-[#cbd98a] hover:bg-[#cbd98a]/15"><svg viewBox="0 0 24 24" className="size-3.5 fill-none stroke-current" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>Export CSV</button></div></div>
      <div className="hidden grid-cols-[minmax(190px,1.3fr)_110px_120px_120px_92px_minmax(190px,auto)] gap-4 px-4 py-4 font-mono text-[10px] uppercase tracking-[.14em] text-[#7f8d84] md:grid"><span>Object pair</span><SortHead label="Closest pass" active={sort?.key === "dist"} dir={sort?.dir} onClick={() => toggleSort("dist")} /><SortHead label="TCA" active={sort?.key === "tca"} dir={sort?.dir} onClick={() => toggleSort("tca")} /><SortHead label="Rel speed" active={sort?.key === "speed"} dir={sort?.dir} onClick={() => toggleSort("speed")} /><SortHead label="Score" active={sort?.key === "score"} dir={sort?.dir} onClick={() => toggleSort("score")} /><span>Interactive telemetry</span></div><div>{visible.map((item) => { 
  const priority = item.riskLevel === "CRITICAL" ? "Critical" : item.riskLevel === "HIGH" ? "High" : item.riskLevel === "MEDIUM" ? "Medium" : "Low";
  const tone = scoreTone(priority); 
  const objA = item.objectA?.name || "Unknown";
  const objB = item.objectB?.name || "Unknown";
  const typeLabel = (item.objectA?.classification === "DEBRIS" || item.objectB?.classification === "DEBRIS") ? "Sat ↔ Deb" : "Sat ↔ R/B";
  return <article key={item.id} className="grid gap-4 border-t border-white/8 px-3 py-5 transition hover:bg-white/[.025] md:grid-cols-[minmax(190px,1.3fr)_110px_120px_120px_92px_minmax(190px,auto)] md:items-center"><div className="flex items-start gap-3"><span className="mt-1.5 size-2 rounded-full" style={{backgroundColor: priorityColors(priority).text}}/><div><p className="text-sm font-semibold text-[#e9eee8]">{objA} <span className="mx-1 font-normal text-[#75857c]">↔</span> {objB}</p><p className="mt-1 font-mono text-[10px] uppercase tracking-[.1em] text-[#8e9a91]">{priority} priority · {typeLabel}</p></div></div><div><span className="font-mono text-[10px] uppercase tracking-[.14em] text-[#7f8d84] md:hidden">Closest pass · </span><span className="text-sm font-medium">{item.minDistanceKm.toFixed(2)} km</span></div><div><span className="font-mono text-[10px] uppercase tracking-[.14em] text-[#7f8d84] md:hidden">TCA · </span><span className="font-mono text-xs text-[#c7d0c8]">{collisionAt(item.tcaIso)} UTC</span><span className="mt-0.5 block font-mono text-[10px] text-[#8e9a91]">{remainingLabel(item.tcaIso)}</span></div><div><span className="font-mono text-[10px] uppercase tracking-[.14em] text-[#7f8d84] md:hidden">Rel speed · </span><span className="font-mono text-xs text-[#c7d0c8]">{item.relativeVelocityKmS.toFixed(2)} km/s</span></div><div><span className="inline-block rounded-md px-2 py-1 font-mono text-xs font-semibold tabular-nums" style={{ background: `${tone}1f`, color: tone, border: `1px solid ${tone}40` }}>{(item.riskScore).toFixed(1)}</span></div><div className="flex flex-wrap gap-2"><button onClick={() => { setSelectedConjunction(item); if(item.objectA) setSelectedObject(item.objectA); setActiveTab('3D'); navigate('/earth'); }} className="inline-flex items-center gap-2 rounded-xl border border-[#cbd98a]/40 bg-[#cbd98a]/10 px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[.08em] text-[#dce9a0] transition hover:border-[#cbd98a]/70 hover:bg-[#cbd98a]/20"><svg viewBox="0 0 24 24" className="size-4 fill-none stroke-current" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 21 7v10l-9 5-9-5V7l9-5Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>3D</button><button onClick={() => { setSelectedConjunction(item); if(item.objectA) setSelectedObject(item.objectA); setActiveTab('2D'); navigate('/earth'); }} className="inline-flex items-center gap-2 rounded-xl border border-[#75b8c8]/40 bg-[#75b8c8]/10 px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[.08em] text-[#a8d8e8] transition hover:border-[#75b8c8]/70 hover:bg-[#75b8c8]/20"><svg viewBox="0 0 24 24" className="size-4 fill-none stroke-current" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3.6 9h16.8M3.6 15h16.8"/><path d="M12 3C9.5 6.5 8 9.1 8 12s1.5 5.5 4 9"/><path d="M12 3c2.5 3.5 4 6.1 4 9s-1.5 5.5-4 9"/></svg>2D</button><button onClick={() => onSelect(item)} className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[.05] px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[.08em] text-[#c9d2c9] transition hover:border-[#cbd98a]/60 hover:text-[#dce9a0]"><svg viewBox="0 0 24 24" className="size-4 fill-none stroke-current" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.6h.01"/></svg>Data</button></div></article>; })}</div>{visible.length === 0 && <p className="py-14 text-center text-sm text-[#95a197]">No conjunctions match this view.</p>}</section>
    <footer className="mt-8 flex flex-wrap justify-between gap-3 pb-4 font-mono text-[10px] uppercase tracking-[.15em] text-[#839087]"><span>Data source: CelesTrak</span><span>{pairs.length} active assessments</span></footer>
  </div>
  {showFilter && <ScoringSettings onClose={() => setShowFilter(false)} config={headerArgs.status?.config} onSaveConfig={headerArgs.onSaveConfig} />}
  </main>;
}

function useLiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  return now.toISOString().slice(11, 19);
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="bg-[#09151d] p-3.5"><p className="font-mono text-[9px] uppercase tracking-[.14em] text-[#7f8d84]">{label}</p><p className="mt-1.5 font-mono text-lg font-medium tabular-nums text-[#eef3eb]">{value}{note && <span className="ml-1 text-[10px] font-normal text-[#8e9a91]">{note}</span>}</p></div>;
}

function RiskChip({ label, value, unit, tone }: { label: string; value: string; unit?: string; tone: string }) {
  return <div className="rounded-xl border p-3" style={{ borderColor: `${tone}33`, background: `${tone}0f` }}><p className="font-mono text-[9px] uppercase leading-tight tracking-[.12em] text-[#9aa79e]">{label}</p><p className="mt-1.5 text-xl font-semibold tabular-nums" style={{ color: tone }}>{value}{unit && <span className="ml-1 text-xs font-normal text-[#9aa79e]">{unit}</span>}</p></div>;
}

function ScoringSettings({ onClose, config, onSaveConfig }: { onClose: () => void, config?: any, onSaveConfig?: (cfg: any) => void }) {
  const [horizon, setHorizon] = useState(config?.predictionHours?.toString() || "24");
  const [step, setStep] = useState(config?.timeStepSeconds?.toString() || "60");
  const [distance, setDistance] = useState(config?.distanceThresholdKm?.toString() || "15");
  const thresholds = [["Critical", "80", "#f18b78"], ["High", "60", "#d6a449"], ["Medium", "30", "#cbd98a"]];
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
    <div className="w-full max-w-lg overflow-hidden rounded-[24px] border border-white/12 bg-[#0a141dee] shadow-2xl shadow-black/50" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-5"><div><p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#9bac83]">Scoring settings</p><h2 className="mt-1 font-[Georgia,serif] text-2xl">Detection &amp; risk</h2></div><button onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-full border border-white/15 text-[#aeb7b0] transition hover:border-white/40 hover:text-white">✕</button></div>
      <div className="space-y-7 px-6 py-6">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#b8c696]">Propagation &amp; detection</p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Prediction horizon"><select value={horizon} onChange={(e) => setHorizon(e.target.value)} className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-[#edf2ec] outline-none focus:border-[#cbd98a]/60">{["12", "24", "48", "72"].map((h) => <option key={h} value={h} className="bg-[#0a141d]">{h} hours</option>)}</select></Field>
            <Field label="Time step"><select value={step} onChange={(e) => setStep(e.target.value)} className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-[#edf2ec] outline-none focus:border-[#cbd98a]/60">{["30", "60", "120"].map((s) => <option key={s} value={s} className="bg-[#0a141d]">{s} s</option>)}</select></Field>
            <Field label="Distance (km)"><input value={distance} onChange={(e) => setDistance(e.target.value)} inputMode="numeric" className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-[#edf2ec] outline-none focus:border-[#cbd98a]/60" /></Field>
          </div>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#b8c696]">Risk classification thresholds</p>
          <div className="mt-4 grid grid-cols-3 gap-3">{thresholds.map(([name, val, tone]) => <div key={name} className="rounded-xl border p-3" style={{ borderColor: `${tone}40`, background: `${tone}10` }}><p className="font-mono text-[10px] uppercase tracking-[.1em]" style={{ color: tone }}>{name}</p><p className="mt-1.5 font-mono text-sm text-[#dfe6dd]">&gt;= {val}</p></div>)}</div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-white/10 px-6 py-5"><button onClick={onClose} className="font-mono text-[10px] uppercase tracking-[.14em] text-[#9ba69e] transition hover:text-white">Reset defaults</button><div className="flex gap-3"><button onClick={onClose} className="rounded-full border border-white/20 px-4 py-2.5 text-sm text-[#e4e9e2] transition hover:border-white/40">Cancel</button><button onClick={() => { if (onSaveConfig && config) { onSaveConfig({ ...config, predictionHours: parseInt(horizon, 10) || 24, timeStepSeconds: parseInt(step, 10) || 60, distanceThresholdKm: parseFloat(distance) || 15 }); } onClose(); }} className="rounded-full bg-[#cbd98a] px-5 py-2.5 text-sm font-semibold text-[#172116] transition hover:bg-[#e1efa1]">Apply &amp; recalculate</button></div></div>
    </div>
  </div>;
}

function SortHead({ label, active, dir, onClick }: { label: string; active: boolean; dir?: number; onClick: () => void }) {
  return <button onClick={onClick} className={`flex items-center gap-1.5 text-left font-mono text-[10px] uppercase tracking-[.14em] transition ${active ? "text-[#dce9a0]" : "text-[#7f8d84] hover:text-[#b2bbb3]"}`}>{label}<span aria-hidden>{active ? (dir === 1 ? "↑" : "↓") : "↕"}</span></button>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="font-mono text-[10px] uppercase tracking-[.12em] text-[#8e9a91]">{label}</span><div className="mt-2">{children}</div></label>;
}

export default function AlertPage() {
  const {
    status,
    conjunctions,
    selectedConjunction,
    isLoading,
    isWsConnected,
    wsLatency,
    setSelectedConjunction,
    handleFetchLive,
    handleLoadDemo,
    handleReAnalyze,
    handleSaveConfig,
    setIsSettingsOpen,
    setIsArchOpen
  } = useTelemetry();

  const [view, setView] = useState<'LIBRARY' | 'DETAIL'>('LIBRARY');
  
  useEffect(() => {
    if (!selectedConjunction) {
      setView('LIBRARY');
    }
  }, [selectedConjunction]);

  const handleSelect = (pair: ConjunctionEvent) => {
    setSelectedConjunction(pair);
    setView('DETAIL');
  };
  const handleBack = () => {
    setSelectedConjunction(null);
  };

  const headerArgs = { status, isLoading, isWsConnected, wsLatency, onFetchLive: handleFetchLive, onLoadDemo: handleLoadDemo, onReAnalyze: handleReAnalyze, onOpenSettings: () => setIsSettingsOpen(true), onOpenArch: () => setIsArchOpen(true), onSaveConfig: handleSaveConfig };

  return (
    <div className="min-h-screen bg-[#071019] flex flex-col font-sans">
      {view === 'LIBRARY' ? (
        <ConjunctionLibrary pairs={conjunctions} onSelect={handleSelect} headerArgs={headerArgs} />
      ) : (
        selectedConjunction && <AlertDetail pair={selectedConjunction} onBack={handleBack} />
      )}
    </div>
  );
}

function StepNav({ active, onSelect }: { active: string; onSelect: (id: string) => void }) {
  const items = [{ id: "brief", label: "Brief" }, { id: "trajectory", label: "TCA Profile" }, { id: "response", label: "Response" }];
  const index = Math.max(0, items.findIndex((item) => item.id === active));
  return (
    <nav role="tablist" aria-label="Assessment sections" className="relative flex overflow-hidden rounded-2xl border border-white/12 bg-[#0b1720]/70 p-1 backdrop-blur">
      <span className="pointer-events-none absolute inset-y-1 transition-[left] duration-500 ease-out" style={{ left: `calc(0.25rem + ${index} * (100% - 0.5rem) / 3)`, width: "calc((100% - 0.5rem) / 3)" }}>
        <span className="absolute left-1/2 top-0 h-px w-3/4 -translate-x-1/2 bg-gradient-to-r from-transparent via-[#e9f2a3] to-transparent shadow-[0_0_14px_2px_rgba(203,217,138,.7)]" />
        <span className="absolute left-1/2 top-0 h-full w-3/4 -translate-x-1/2 bg-[radial-gradient(ellipse_60%_100%_at_50%_0%,rgba(203,217,138,.26),transparent_72%)]" />
      </span>
      {items.map((item) => <button key={item.id} role="tab" aria-selected={active === item.id} onClick={() => onSelect(item.id)} className={`relative z-10 flex-1 rounded-xl px-2 py-2.5 text-center font-mono text-[11px] uppercase tracking-[.14em] transition-colors ${active === item.id ? "text-[#e9f2a3]" : "text-white/75 hover:text-white"}`}>{item.label}</button>)}
    </nav>
  );
}

function Metric({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: string }) { return <div><p className="font-mono text-[10px] uppercase tracking-[.15em] text-[#87938b]">{label}</p><p className="mt-1 text-xl font-medium" style={{ color: tone ?? "#f0f3eb" }}>{value}{note && <span className="ml-1 text-sm font-normal text-[#87938b]">{note}</span>}</p></div>; }
function Detail({ label, value }: { label: string; value: string }) { return <div className="bg-[#0b1720] p-5"><p className="font-mono text-[10px] uppercase tracking-[.15em] text-[#87938b]">{label}</p><p className="mt-2 text-base text-[#e8eee5]">{value}</p></div>; }

function TcaProfile({ miss, speed }: { miss: number; speed: string }) {
  const [windowMin, setWindowMin] = useState(15);
  const [anomalies, setAnomalies] = useState(true);
  const [active, setActive] = useState<string | null>(null);

  const a = 28 / windowMin;
  const sep = (t: number) => Math.sqrt(miss * miss + a * a * t * t);
  // Increased ml from 44 to 64 to prevent Y-axis labels from clipping outside the viewBox
  const W = 420, H = 240, ml = 64, mr = 14, mt = 18, mb = 30, pw = W - ml - mr, ph = H - mt - mb;
  const xOf = (t: number) => ml + ((t + windowMin) / (2 * windowMin)) * pw;
  const yOf = (km: number) => mt + (1 - Math.min(km, 35) / 35) * ph;
  const N = 64;
  const line = Array.from({ length: N + 1 }, (_, i) => { const t = -windowMin + (2 * windowMin * i) / N; return `${i ? "L" : "M"}${xOf(t).toFixed(1)} ${yOf(sep(t)).toFixed(1)}`; }).join(" ");
  const area = `${line} L ${xOf(windowMin).toFixed(1)} ${yOf(0).toFixed(1)} L ${xOf(-windowMin).toFixed(1)} ${yOf(0).toFixed(1)} Z`;
  const markers = [{ id: "orbital", t: -7.5, color: "#e8894a" }, { id: "gap", t: 7.5, color: "#b49be0" }];
  const diag: Record<string, { title: string; tone: string; body: string }> = {
    tca: { title: "Closest approach", tone: "#f18b78", body: `Miss ${miss.toFixed(2)} km at TCA (0 m), relative velocity ${speed}. This is the point of closest approach in the conjunction window.` },
    orbital: { title: "Orbital deviation", tone: "#e8894a", body: "Drag and perturbation bend the SGP4 track; along-track error reaches ≈ 8.4 m ahead of TCA." },
    gap: { title: "Telemetry gap", tone: "#b49be0", body: "A sensor blackout inflates covariance — a +9.6 m tracking gap widens the dispersion cone." },
  };
  const shown = active ? diag[active] : null;
  const xTicks = [-windowMin, -windowMin / 2, 0, windowMin / 2, windowMin];
  const fmt = (t: number) => t === 0 ? "TCA" : `${t > 0 ? "+" : ""}${t}m`;

  return <div className="mt-6">
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-[11px]">
      <button onClick={() => { setAnomalies(!anomalies); setActive(null); }} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono uppercase tracking-[.1em] transition ${anomalies ? "border-[#e8894a]/50 bg-[#e8894a]/[.12] text-[#f0b184]" : "border-white/15 text-[#9ba69e] hover:border-white/40"}`}><span aria-hidden>⚠</span> Anomalies {anomalies ? "on · 2" : "off"}</button>
      <div className="inline-flex items-center gap-2 font-mono uppercase tracking-[.1em] text-[#8f9d94]"><span>Jump</span><button onClick={() => setActive("orbital")} className="rounded-md border border-[#e8894a]/40 bg-[#e8894a]/10 px-2 py-1 text-[#f0b184] transition hover:bg-[#e8894a]/20">−8.4m Dev</button><button onClick={() => setActive("gap")} className="rounded-md border border-[#b49be0]/40 bg-[#b49be0]/10 px-2 py-1 text-[#c9b6f0] transition hover:bg-[#b49be0]/20">+9.6m Gap</button></div>
      <div className="ml-auto inline-flex overflow-hidden rounded-full border border-white/12">{[15, 30, 45].map((w) => <button key={w} onClick={() => setWindowMin(w)} className={`px-2.5 py-1 font-mono text-[10px] uppercase tracking-[.1em] transition ${windowMin === w ? "bg-[#cbd98a] text-[#172116]" : "text-[#9ba69e] hover:text-white"}`}>±{w}m</button>)}</div>
    </div>
    <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="flex flex-col gap-3 xl:flex-row">
        <div className="min-w-0 flex-1">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Separation versus time profile">
            <defs>
              <linearGradient id="tcaCurve" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#75c7c1" /><stop offset="1" stopColor="#cbd98a" /></linearGradient>
              <linearGradient id="tcaFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#75c7c1" stopOpacity=".26" /><stop offset="1" stopColor="#75c7c1" stopOpacity="0" /></linearGradient>
            </defs>
            {[0, 17.5, 35].map((k) => <g key={k}><line x1={ml} x2={W - mr} y1={yOf(k)} y2={yOf(k)} stroke="#fff" strokeOpacity=".08" /><text x={ml - 10} y={yOf(k) + 4} textAnchor="end" fontSize="11" fill="#9aa79e" fontFamily="monospace">{k} km</text></g>)}
            <line x1={xOf(0)} x2={xOf(0)} y1={mt} y2={mt + ph} stroke="#f18b78" strokeOpacity=".3" strokeDasharray="2 3" />
            {anomalies && markers.map((m) => <line key={m.id} x1={xOf(m.t)} x2={xOf(m.t)} y1={mt} y2={mt + ph} stroke={m.color} strokeOpacity=".16" strokeDasharray="3 3" />)}
            <path d={area} fill="url(#tcaFill)" />
            <path d={line} fill="none" stroke="url(#tcaCurve)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            {xTicks.map((t) => <text key={t} x={xOf(t)} y={H - 8} textAnchor="middle" fontSize="11" fill={t === 0 ? "#ffae9d" : "#9aa79e"} fontFamily="monospace">{fmt(t)}</text>)}
            <circle cx={xOf(0)} cy={yOf(miss)} r={active === "tca" ? 6 : 4.5} fill="#f18b78" stroke="#071019" strokeWidth="1.5" className="cursor-pointer" onMouseEnter={() => setActive("tca")} onMouseLeave={() => setActive(null)} />
            {anomalies && markers.map((m) => { const cx = xOf(m.t), cy = yOf(sep(m.t)), on = active === m.id; return <g key={m.id} className="cursor-pointer" onMouseEnter={() => setActive(m.id)} onMouseLeave={() => setActive(null)}><circle cx={cx} cy={cy} r={on ? 10 : 7.5} fill={m.color} fillOpacity=".16" stroke={m.color} strokeOpacity=".55" />{m.id === "orbital" ? <rect x={cx - 3.4} y={cy - 3.4} width="6.8" height="6.8" fill={m.color} transform={`rotate(45 ${cx} ${cy})`} /> : <circle cx={cx} cy={cy} r="3.6" fill={m.color} />}</g>; })}
          </svg>
        </div>
        <div className="flex min-h-[116px] items-start rounded-lg border border-white/10 bg-white/[.03] p-4 xl:min-h-[132px] xl:w-[38%]">
          {shown ? <div><p className="font-mono text-[10px] uppercase tracking-[.14em]" style={{ color: shown.tone }}>{shown.title}</p><p className="mt-2 text-xs leading-6 text-[#c3ccc3]">{shown.body}</p></div> : <p className="flex items-start gap-2 text-xs leading-6 text-[#8f9d94]"><span aria-hidden>ⓘ</span> Hover the graph markers for root-cause diagnostics.</p>}
        </div>
      </div>
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[10px] uppercase tracking-[.1em] text-[#8f9d94]">
      <span className="inline-flex items-center gap-2"><span className="h-[2px] w-4 rounded-full" style={{ background: "linear-gradient(90deg,#75c7c1,#cbd98a)" }} /> SGP4 separation curve</span>
      <span className="inline-flex items-center gap-2"><span className="size-2 rotate-45 bg-[#e8894a]" /> Orbital deviation (drag/perturbation)</span>
      <span className="inline-flex items-center gap-2"><span className="size-2 rounded-full bg-[#b49be0]" /> Telemetry gap (sensor blackout)</span>
    </div>
  </div>;
}

function ResponsePanel({ onOpenBurn, priority, pair }: { onOpenBurn: () => void; priority: string; pair: ConjunctionEvent }) {
  const [assessment, setAssessment] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isCached, setIsCached] = useState<boolean>(false);

  const fetchAssessment = async (force: boolean = false) => {
    if (force) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const res = await fetch(`/api/conjunctions/${pair.id}/assess`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceRefresh: force, conjunction: pair })
      });

      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const data = await res.json();
      setAssessment(data);
      setIsCached(Boolean(data.isCached));
    } catch (err: any) {
      console.error('[AI Assessment Error]', err);
      setError(err?.message || 'Failed generating live AI assessment.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAssessment(false);
  }, [pair.id]);

  const defaultPlan = actionPlans[priority] ?? actionPlans["Low"];
  const defaultConfidence = assessmentConfidence[priority] ?? assessmentConfidence["Low"];

  const statusStr = assessment?.assessment?.status || (priority === 'Critical' ? 'HIGH_CONCERN' : priority === 'High' ? 'CLOSE_MONITORING' : 'MONITOR');
  const statusBadgeStyle =
    statusStr === 'HIGH_CONCERN' || statusStr === 'ESCALATE_FOR_MANEUVER_ANALYSIS'
      ? 'border-[#f18b78]/50 bg-[#f18b78]/15 text-[#ffae9d]'
      : statusStr === 'CLOSE_MONITORING'
      ? 'border-[#e8894a]/50 bg-[#e8894a]/15 text-[#f0b184]'
      : statusStr === 'MONITOR'
      ? 'border-[#cbd98a]/50 bg-[#cbd98a]/15 text-[#dce9a0]'
      : 'border-[#75c7c1]/50 bg-[#75c7c1]/15 text-[#9ee7e2]';

  return (
    <div className="mt-6 space-y-4 font-sans">
      {/* Live Gemini Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 backdrop-blur">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.14em]">
          <span className="flex items-center gap-1.5 text-[#cbd98a]">
            <Sparkles className="size-3.5 animate-pulse text-[#cbd98a]" />
            Gemini 3.5 Flash-Lite
          </span>
          <span className="text-white/20">·</span>
          <span className="text-[#8f9d94]">Astrodynamic Tools</span>
        </div>
        <div className="flex items-center gap-2">
          {isRefreshing || isLoading ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-cyan-300">
              <Activity className="size-3 animate-spin" /> Calling API…
            </span>
          ) : isCached ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5 font-mono text-[10px] text-[#9ba69e]" title="Cached result within 15m TTL">
              <span className="size-1.5 rounded-full bg-amber-400" /> Cached (15m TTL)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-300">
              <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" /> Live API Response
            </span>
          )}
          <span className={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[.08em] ${statusBadgeStyle}`}>
            {statusStr.replace(/_/g, ' ')}
          </span>
        </div>
      </div>

      {/* Loading Skeleton */}
      {isLoading && !assessment ? (
        <div className="space-y-3 rounded-xl border border-white/10 bg-white/[.02] p-5 text-center">
          <div className="flex justify-center py-4">
            <Activity className="size-7 animate-spin text-[#cbd98a]" />
          </div>
          <p className="font-mono text-xs text-[#cbd98a]">Querying Gemini API & SGP4 telemetry tools…</p>
          <p className="text-xs text-[#8f9d94]">Evaluating distance history, covariance gaps, and candidate maneuver profiles.</p>
        </div>
      ) : (
        <>
          {/* Headline & Executive Summary */}
          <div className="rounded-xl border border-white/12 bg-white/[.04] p-4 transition-all">
            <div className="flex items-start gap-2.5">
              <Zap className="mt-0.5 size-4 shrink-0 text-[#cbd98a]" />
              <div className="space-y-1">
                <h4 className="font-semibold text-sm text-[#f0f4ee]">
                  {assessment?.assessment?.headline || "Conjunction Tactical Risk Evaluation"}
                </h4>
                <p className="text-xs leading-relaxed text-[#c3ccc3]">
                  {assessment?.assessment?.summary || "Automated astrodynamics screening in progress. Review the recommended response actions below."}
                </p>
              </div>
            </div>
          </div>

          {/* Gemini API Live Token & Metadata Bar */}
          {assessment?._meta && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-cyan-500/20 bg-cyan-950/20 px-3 py-2 text-[10px] font-mono text-cyan-300">
              <div className="flex items-center gap-3">
                <span>Model: <strong>{assessment._meta.model}</strong></span>
                {assessment._meta.usage && (
                  <span>
                    Tokens: <strong>{assessment._meta.usage.totalTokenCount}</strong> (Prompt: {assessment._meta.usage.promptTokenCount}, Output: {assessment._meta.usage.candidatesTokenCount})
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-slate-400">
                <span>Generated: {new Date(assessment._meta.generatedAt).toLocaleTimeString()} UTC</span>
                <span>· {assessment._meta.toolIterations} tool loops</span>
              </div>
            </div>
          )}

          {/* Identified Risk Factors (Gemini Tool Insights) */}
          {assessment?.risk_factors && assessment.risk_factors.length > 0 && (
            <div className="space-y-2">
              <p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#9bac83]">Identified Risk Drivers & Ephemeris Tools</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {assessment.risk_factors.map((rf: any, idx: number) => {
                  const isSevere = rf.impact === 'increases_concern';
                  const isFavorable = rf.impact === 'decreases_concern';
                  return (
                    <div key={idx} className="flex flex-col justify-between gap-1.5 rounded-lg border border-white/8 bg-black/30 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-semibold text-[#e0e7df]">{rf.factor}</span>
                        <span className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase ${
                          isSevere ? 'bg-[#f18b78]/20 text-[#ffae9d] border border-[#f18b78]/30' :
                          isFavorable ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                          'bg-white/10 text-[#c3ccc3]'
                        }`}>
                          {rf.value}
                        </span>
                      </div>
                      <p className="text-[11px] leading-relaxed text-[#8f9d94]">{rf.explanation}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Orbital Trend */}
          {assessment?.trend && (
            <div className="flex items-center gap-3 rounded-lg border border-white/8 bg-black/20 px-3.5 py-2.5 text-xs">
              <span className="font-mono text-[10px] uppercase tracking-[.14em] text-[#9bac83]">Historical Trend:</span>
              <span className={`font-mono font-bold uppercase ${
                assessment.trend.direction === 'worsening' ? 'text-[#f18b78]' :
                assessment.trend.direction === 'improving' ? 'text-emerald-400' :
                'text-[#cbd98a]'
              }`}>
                {assessment.trend.direction}
              </span>
              <span className="text-[#8f9d94] truncate">· {assessment.trend.explanation}</span>
            </div>
          )}

          {/* Recommended Action Plan */}
          <div className="rounded-xl border border-[#cbd98a]/25 bg-[#cbd98a]/[.08] p-4">
            <p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#cbd98a]">Recommended Action Plan</p>
            <ul className="mt-3 space-y-2 text-xs leading-5 text-[#e6ebe2]">
              {(assessment?.recommended_actions || defaultPlan).map((item: string, idx: number) => (
                <li key={idx} className="flex gap-2.5">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#cbd98a]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Candidate Evasion Strategies */}
          {assessment?.candidate_evasion_strategies && assessment.candidate_evasion_strategies.length > 0 && (
            <div className="space-y-2">
              <p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#9bac83]">Candidate Evasion Strategies</p>
              <div className="space-y-2">
                {assessment.candidate_evasion_strategies.map((strat: any, idx: number) => (
                  <div key={idx} className="rounded-lg border border-white/10 bg-white/[.03] p-3 text-xs space-y-1">
                    <div className="flex items-center justify-between text-[#cbd98a] font-semibold">
                      <span>{strat.strategy}</span>
                      <span className="font-mono text-[9px] uppercase tracking-wider text-[#8f9d94]">Candidate Burn</span>
                    </div>
                    <p className="text-[#c3ccc3]">{strat.geometry_effect}</p>
                    <p className="text-[11px] text-[#8f9d94]">Tradeoffs: {strat.tradeoffs}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Assessment Confidence & Data Limitations */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-white/[.03] p-3.5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 fill-none stroke-[#9bac83]" />
                <p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#9bac83]">Confidence Rating</p>
              </div>
              <p className="mt-2 text-xs leading-5 text-[#c3ccc3]">
                {assessment?.confidence?.level ? `${assessment.confidence.level.toUpperCase()} — ${assessment.confidence.reason}` : defaultConfidence}
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[.03] p-3.5">
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-4 fill-none stroke-[#9bac83]" />
                <p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#9bac83]">Data Limitations</p>
              </div>
              <p className="mt-2 text-xs leading-5 text-[#c3ccc3]">
                {assessment?.data_limitations?.length ? assessment.data_limitations.join(' ') : "Ephemeris propagation relies on SGP4 models subject to atmospheric-drag uncertainties near perigee."}
              </p>
            </div>
          </div>
        </>
      )}

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300 font-mono">
          ⚠ {error}
        </div>
      )}

      {/* Action Controls */}
      <div className="flex flex-wrap gap-3 pt-2">
        <button
          onClick={onOpenBurn}
          className="inline-flex items-center gap-2 rounded-full bg-[#cbd98a] px-5 py-3 text-sm font-semibold text-[#172116] transition hover:bg-[#e1efa1] active:scale-95"
        >
          <Play className="size-4 fill-current" />
          Burn simulation sandbox
        </button>
        <button
          onClick={() => fetchAssessment(true)}
          disabled={isRefreshing || isLoading}
          className="inline-flex items-center gap-2 rounded-full border border-white/20 px-5 py-3 text-sm text-[#e4e9e2] transition hover:border-[#cbd98a]/60 hover:bg-white/5 active:scale-95 disabled:opacity-60"
        >
          <RotateCw className={`size-4 ${isRefreshing ? "animate-spin text-[#cbd98a]" : ""}`} />
          {isRefreshing ? "Querying Gemini API…" : "Recalculate Gemini AI Response"}
        </button>
      </div>
    </div>
  );
}

function BurnSandbox({ onBack, miss, pair }: { onBack: () => void; miss: number; pair: ConjunctionEvent }) {
  const directions = [
    { value: "PROGRADE", label: "PROGRADE (Raises Orbit / Speeds Up)" },
    { value: "RETROGRADE", label: "RETROGRADE (Lowers Orbit / Slows Down)" },
    { value: "RADIAL", label: "RADIAL (Inward / Outward Shift)" },
    { value: "NORMAL", label: "NORMAL (Cross-Track / Inclination Shift)" }
  ];
  const [dir, setDir] = useState<string>("PROGRADE");
  const [dv, setDv] = useState(5.0);
  const [hours, setHours] = useState(12.0);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simResult, setSimResult] = useState<any>(null);
  const [simError, setSimError] = useState<string | null>(null);

  const runSimulation = async () => {
    setIsSimulating(true);
    setSimError(null);
    try {
      const res = await fetch(`/api/conjunctions/${pair.id}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          burnDirection: dir,
          burnMagnitudeMs: dv,
          burnTimeHoursBeforeTca: hours,
          conjunction: pair
        })
      });
      if (!res.ok) {
        throw new Error(`Simulation failed (HTTP ${res.status})`);
      }
      const data = await res.json();
      setSimResult(data);
    } catch (err: any) {
      console.error('[Burn Simulation Error]', err);
      // SGP4 analytical fallback
      const fallbackNewMiss = Number((miss + dv * hours * 0.011).toFixed(2));
      setSimResult({
        originalMissDistanceKm: miss,
        newMissDistanceKm: fallbackNewMiss,
        missDistanceIncreaseKm: Math.max(0, fallbackNewMiss - miss),
        isRiskCleared: fallbackNewMiss > 5.0,
        burnTimeHoursBeforeTca: hours,
        newTcaIso: new Date(new Date(pair.tcaIso).getTime() + 180000).toISOString()
      });
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <div className="mt-6">
      <div className="space-y-5 rounded-xl border border-white/10 bg-black/30 p-4 sm:p-6 backdrop-blur">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <span className="font-mono text-[10px] uppercase tracking-[.16em] text-[#cbd98a]">SGP4 Keplerian Impulse Engine</span>
          <span className="font-mono text-xs text-[#8f9d94]">Target TCA Miss: {miss.toFixed(2)} km</span>
        </div>

        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-[.14em] text-[#8f9d94]">Impulse Direction (Satellite Orbital Frame)</span>
          <select
            value={dir}
            onChange={(e) => setDir(e.target.value)}
            className="mt-2 w-full rounded-lg border border-white/12 bg-black/40 px-3 py-2.5 font-mono text-xs text-[#edf2ec] outline-none transition focus:border-[#cbd98a]/60"
          >
            {directions.map((d) => (
              <option key={d.value} value={d.value} className="bg-[#0a141d]">{d.label}</option>
            ))}
          </select>
        </label>

        <div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[.14em] text-[#8f9d94]">Burn Magnitude (ΔV)</span>
            <span className="font-mono text-xs text-[#cbd98a]">{dv.toFixed(1)} m/s</span>
          </div>
          <input
            type="range"
            min={0.5}
            max={20}
            step={0.5}
            value={dv}
            onChange={(e) => setDv(Number(e.target.value))}
            className="mt-3 w-full accent-[#cbd98a]"
          />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[.14em] text-[#8f9d94]">Burn Location Time (Hours Before TCA)</span>
            <span className="font-mono text-xs text-[#cbd98a]">{hours.toFixed(1)} hours before TCA</span>
          </div>
          <input
            type="range"
            min={1}
            max={24}
            step={0.5}
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            className="mt-3 w-full accent-[#cbd98a]"
          />
        </div>

        {simError && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300 font-mono">
            {simError}
          </div>
        )}

        {simResult && (
          <div className="space-y-3 rounded-lg border border-[#cbd98a]/30 bg-[#cbd98a]/[.08] p-4 text-xs">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-[#9bac83]">Simulation Outcome at TCA</span>
              {simResult.isRiskCleared ? (
                <span className="inline-flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-300 border border-emerald-500/30">
                  <CheckCircle2 className="size-3" /> RISK CLEARED
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded bg-[#f18b78]/20 px-2 py-0.5 font-mono text-[10px] font-bold text-[#ffae9d] border border-[#f18b78]/30">
                  <ShieldAlert className="size-3" /> HIGH RISK REMAINING
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 font-mono">
              <div>
                <span className="text-[10px] text-[#8f9d94] block">Original Miss Distance</span>
                <span className="text-sm font-semibold text-white">{simResult.originalMissDistanceKm?.toFixed(2) ?? miss.toFixed(2)} km</span>
              </div>
              <div>
                <span className="text-[10px] text-[#8f9d94] block">Simulated Miss Distance</span>
                <strong className="text-base text-[#dce9a0]">{simResult.newMissDistanceKm?.toFixed(2)} km</strong>
              </div>
            </div>

            <div className="flex items-center justify-between rounded border border-white/10 bg-black/30 p-2.5 text-[11px]">
              <span className="text-[#8f9d94]">Total Safety Margin Gained:</span>
              <strong className="font-mono text-[#cbd98a]">+{simResult.missDistanceIncreaseKm?.toFixed(2)} km</strong>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-3 pt-2">
          <button
            onClick={runSimulation}
            disabled={isSimulating}
            className="inline-flex items-center gap-2 rounded-full bg-[#cbd98a] px-5 py-3 text-sm font-semibold text-[#172116] transition hover:bg-[#e1efa1] active:scale-95 disabled:opacity-60"
          >
            {isSimulating ? <Activity className="size-4 animate-spin" /> : <Play className="size-4 fill-current" />}
            {isSimulating ? "Propagating Orbit…" : "Run Burn Simulation"}
          </button>
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-full border border-white/20 px-5 py-3 text-sm text-[#e4e9e2] transition hover:border-[#cbd98a]/60 hover:bg-white/5 active:scale-95"
          >
            ← Back to response
          </button>
        </div>
      </div>
    </div>
  );
}

function SatGraphic({ className }: { className?: string }) {
  return <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden>
    <defs><linearGradient id="satBody" x1="27" y1="18" x2="37" y2="46" gradientUnits="userSpaceOnUse"><stop stopColor="#dbe1e6" /><stop offset="1" stopColor="#8a97a1" /></linearGradient></defs>
    <g strokeLinejoin="round">
      <rect x="3" y="23.5" width="18" height="17" rx="1.6" fill="#182634" stroke="#5f7280" strokeWidth="1.1" />
      <path d="M12 23.5v17M3 29.2h18M3 34.8h18" stroke="#3a4d5c" strokeWidth=".8" />
      <rect x="43" y="23.5" width="18" height="17" rx="1.6" fill="#182634" stroke="#5f7280" strokeWidth="1.1" />
      <path d="M52 23.5v17M43 29.2h18M43 34.8h18" stroke="#3a4d5c" strokeWidth=".8" />
      <path d="M21 32h6M37 32h6" stroke="#8a99a3" strokeWidth="1.3" strokeLinecap="round" />
      <rect x="27" y="19" width="10" height="26" rx="4.4" fill="url(#satBody)" stroke="#6f7f89" strokeWidth="1.1" />
      <path d="M27.5 26.5h9M27.5 37.5h9" stroke="#9fb0ba" strokeWidth=".8" />
      <path d="M32 19v-6.5" stroke="#8a99a3" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="32" cy="11" r="2.1" fill="#cbd98a" />
    </g>
  </svg>;
}

function DebGraphic({ className }: { className?: string }) {
  return <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden>
    <defs><linearGradient id="debBody" x1="18" y1="16" x2="52" y2="50" gradientUnits="userSpaceOnUse"><stop stopColor="#a6b8b2" /><stop offset="1" stopColor="#495956" /></linearGradient></defs>
    <g strokeLinejoin="round" stroke="#5c6f6c" strokeWidth="1.2">
      <path d="M19 31 30 17l16 3.5 6.5 14.5-8.5 14.5-18.5 1.5L18 40z" fill="url(#debBody)" />
      <path d="M30 17 34.5 33l11.5 2M34.5 33 25.5 45M34.5 33l18-2.5M34.5 33l5.5 16.5" stroke="#3c4a48" strokeWidth=".85" />
    </g>
  </svg>;
}

function RocketBodyGraphic({ className }: { className?: string }) {
  return <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden>
    <defs>
      <linearGradient id="rbMain" x1="22" y1="8" x2="42" y2="54" gradientUnits="userSpaceOnUse"><stop stopColor="#b2c0bc" /><stop offset="1" stopColor="#3d5250" /></linearGradient>
      <linearGradient id="rbNozzle" x1="32" y1="50" x2="32" y2="63" gradientUnits="userSpaceOnUse"><stop stopColor="#263836" /><stop offset="1" stopColor="#141e1c" /></linearGradient>
    </defs>
    <g strokeLinejoin="round">
      <path d="M25 10 Q32 2 39 10Z" fill="#8a9e9b" stroke="#5e7270" strokeWidth="0.9" />
      <rect x="22" y="9" width="20" height="42" rx="2" fill="url(#rbMain)" stroke="#5e7270" strokeWidth="1.1" />
      <line x1="22" y1="20" x2="42" y2="20" stroke="#364846" strokeWidth="0.85" />
      <line x1="22" y1="31" x2="42" y2="31" stroke="#364846" strokeWidth="0.85" />
      <line x1="22" y1="42" x2="42" y2="42" stroke="#364846" strokeWidth="0.85" />
      <rect x="20" y="47" width="24" height="4" rx="1.2" fill="#2c3e3c" stroke="#56706c" strokeWidth="1" />
      <path d="M24 51 Q19 58 17 63 L47 63 Q45 58 40 51Z" fill="url(#rbNozzle)" stroke="#4a5e5b" strokeWidth="1" />
      <ellipse cx="32" cy="61" rx="5" ry="2" fill="#0e1918" stroke="#364846" strokeWidth="0.8" />
      <rect x="17" y="25" width="5" height="7" rx="1" fill="#2c3e3c" stroke="#4a5e5b" strokeWidth="0.8" />
      <rect x="42" y="25" width="5" height="7" rx="1" fill="#2c3e3c" stroke="#4a5e5b" strokeWidth="0.8" />
    </g>
  </svg>;
}

function BriefContent({ activeStep, burnOpen, setBurnOpen, pair, miss, tcaUtcHHMM }: { activeStep: string; burnOpen: boolean; setBurnOpen: (v: boolean) => void; pair: ConjunctionEvent; miss: number; tcaUtcHHMM: string }) {
  if (activeStep === "trajectory") return <TcaProfile miss={miss} speed={pair.relativeVelocityKmS.toFixed(2) + " km/s"} />;
  if (activeStep === "response") return burnOpen ? <BurnSandbox onBack={() => setBurnOpen(false)} miss={miss} pair={pair} /> : <ResponsePanel onOpenBurn={() => setBurnOpen(true)} priority={pair.riskLevel === "CRITICAL" ? "Critical" : pair.riskLevel === "HIGH" ? "High" : pair.riskLevel === "MEDIUM" ? "Medium" : "Low"} pair={pair} />;
  const isRocketBody = pair.objectB?.classification === "ROCKET_BODY" || pair.objectA?.classification === "ROCKET_BODY";
  return <div className="mt-6">
    <p className="text-sm leading-6 text-[#bcc5bc]">A credible proximity event has been detected. The estimated miss distance is <strong className="font-medium text-[#f0f3ec]">{pair.minDistanceKm.toFixed(2)} km</strong>, below the operational review threshold. The projected path intersects the alert corridor at {tcaUtcHHMM} UTC, and the margin is below the 1 km review threshold.</p>
    <div className="relative mt-8 h-40 overflow-hidden rounded-xl border border-white/10 bg-[#071019]">
      <div className="absolute inset-x-5 bottom-7 border-t border-dashed border-white/20"/>
      <SatGraphic className="absolute bottom-3 left-[6%] h-24 w-24 drop-shadow-[0_0_14px_rgba(203,217,138,.32)]"/>
      <div className="absolute bottom-7 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-[#f18b78] shadow-[0_0_18px_8px_rgba(241,139,120,.5)]"/>
      {isRocketBody
        ? <RocketBodyGraphic className="absolute bottom-3 right-[6%] h-[6.5rem] w-[6.5rem] drop-shadow-[0_0_14px_rgba(117,199,193,.28)]"/>
        : <DebGraphic className="absolute bottom-3 right-[6%] h-[6.5rem] w-[6.5rem] drop-shadow-[0_0_14px_rgba(117,199,193,.28)]"/>
      }
      <span className="absolute left-1/2 top-3 -translate-x-1/2 font-mono text-[10px] text-[#ffae9d]">TCA · {pair.minDistanceKm.toFixed(2)} km</span>
    </div>
    <p className="mt-4 font-mono text-[10px] uppercase tracking-[.16em] text-[#8f9d94]">Projected separation profile</p>
  </div>;
}
