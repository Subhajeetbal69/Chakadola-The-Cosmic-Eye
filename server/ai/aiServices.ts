import { gemini } from "./gemini.ts";
import data from "./data.json" with {type: "json"}

const prompt =`

You are an SSA decision-support assistant.
INPUT(SGP4 Propagation & Ephemeris State Data):
${JSON.stringify(data,null,2)}

Assess the conjunction using ONLY the supplied data.

Rules:
- Do not invent data or calculate new numerical values.
- Do not recalculate Pc, covariance, miss distance, delta-v, fuel, or burn duration.
- Distinguish facts from interpretation.
- Do not assume maneuver capability, propulsion, constraints, or object properties unless provided.
- Do not issue executable maneuver commands.
- Maneuver suggestions are candidate strategies for further validation only.
- Do not claim trends without time-series data.
- Flag stale, missing, uncertain, or low-fidelity data.
- Prefer monitoring/reassessment when information is insufficient.
- Use UTC for times.

Assess:
1. Current conjunction severity and tactical significance.
2. Relative geometry and encounter type, only when supported by the input.
3. Main risk drivers.
4. Trend, if historical assessments exist.
5. Candidate avoidance strategy classes and qualitative trade-offs:
   timing, geometry effect, operational complexity, fuel/delta-v implications, secondary-conjunction risk.
6. Required next actions and missing information.

Return ONLY valid JSON:

{
  "assessment": {
    "status": "LOW_CONCERN|MONITOR|CLOSE_MONITORING|HIGH_CONCERN|ESCALATE_FOR_MANEUVER_ANALYSIS|INSUFFICIENT_DATA",
    "headline": "...",
    "summary": "..."
  },
  "risk_factors": [
    {
      "factor": "...",
      "value": "...",
      "impact": "increases_concern|decreases_concern|uncertain",
      "explanation": "..."
    }
  ],
  "trend": {
    "direction": "improving|worsening|stable|unknown",
    "explanation": "..."
  },
  "candidate_evasion_strategies": [
    {
      "strategy": "...",
      "geometry_effect": "...",
      "tradeoffs": "...",
      "validation_required": "..."
    }
  ],
  "recommended_actions": ["..."],
  "missing_information": ["..."],
  "confidence": {
    "level": "low|moderate|high",
    "reason": "..."
  },
  "data_limitations": ["..."],
  "safety_note": "Decision support only; candidate maneuvers require validated orbital and mission analysis."
}
`


export async function testGemini() {
  const response = await gemini.models.generateContent({
    model: "gemini-3.5-flash-lite",
    contents: prompt,
  });

  return response.text;
}
testGemini().then(console.log).catch(console.error);