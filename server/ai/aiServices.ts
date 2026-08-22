import { gemini } from "./gemini.ts";
import { Type } from "@google/genai";
import { ConjunctionEvent, TleRecord } from "../types.ts";
import { getDistanceHistory, simulateManeuver } from "../conjunctionEngine.ts";

// Define the response schema using Gemini API OpenAPI subset format
const responseSchema = {
  type: Type.OBJECT,
  properties: {
    assessment: {
      type: Type.OBJECT,
      properties: {
        status: {
          type: Type.STRING,
          enum: ["LOW_CONCERN", "MONITOR", "CLOSE_MONITORING", "HIGH_CONCERN", "ESCALATE_FOR_MANEUVER_ANALYSIS", "INSUFFICIENT_DATA"],
          description: "Tactical conjunction severity classification status."
        },
        headline: { type: Type.STRING, description: "A concise headline summarizing the conjunction threat." },
        summary: { type: Type.STRING, description: "Detailed executive summary of the conjunction and tactical reasoning." }
      },
      required: ["status", "headline", "summary"]
    },
    risk_factors: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          factor: { type: Type.STRING, description: "The name of the risk factor (e.g. Miss Distance, Velocity, Telemetry Gap)." },
          value: { type: Type.STRING, description: "The parameter value (e.g. 0.42 km, 14.8 km/s)." },
          impact: { type: Type.STRING, enum: ["increases_concern", "decreases_concern", "uncertain"], description: "Directional impact of this risk factor." },
          explanation: { type: Type.STRING, description: "Brief explanation of how this factor influences the decision." }
        },
        required: ["factor", "value", "impact", "explanation"]
      }
    },
    trend: {
      type: Type.OBJECT,
      properties: {
        direction: { type: Type.STRING, enum: ["improving", "worsening", "stable", "unknown"] },
        explanation: { type: Type.STRING, description: "Reasoning for the trend assessment." }
      },
      required: ["direction", "explanation"]
    },
    candidate_evasion_strategies: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          strategy: { type: Type.STRING, description: "Evasion strategy name (e.g., Retrograde Burn, Out-of-plane Radial)." },
          geometry_effect: { type: Type.STRING, description: "Effect of this strategy on encounter geometry." },
          tradeoffs: { type: Type.STRING, description: "Qualitative tradeoffs (timing, fuel, secondary conjunction risk)." },
          validation_required: { type: Type.STRING, description: "Further analysis required to validate this strategy." }
        },
        required: ["strategy", "geometry_effect", "tradeoffs", "validation_required"]
      }
    },
    recommended_actions: {
      type: Type.ARRAY,
      items: { type: Type.STRING }
    },
    missing_information: {
      type: Type.ARRAY,
      items: { type: Type.STRING }
    },
    confidence: {
      type: Type.OBJECT,
      properties: {
        level: { type: Type.STRING, enum: ["low", "moderate", "high"] },
        reason: { type: Type.STRING, description: "Justification for the confidence rating." }
      },
      required: ["level", "reason"]
    },
    data_limitations: {
      type: Type.ARRAY,
      items: { type: Type.STRING }
    },
    safety_note: { type: Type.STRING, description: "Decision support only; candidate maneuvers require validated orbital and mission analysis." }
  },
  required: [
    "assessment",
    "risk_factors",
    "trend",
    "candidate_evasion_strategies",
    "recommended_actions",
    "missing_information",
    "confidence",
    "data_limitations",
    "safety_note"
  ]
};

// Define available tools (function declarations) for the model
const tools = [
  {
    functionDeclarations: [
      {
        name: "getDistanceHistory",
        description: "Retrieves the dynamic distance history and SGP4 orbital propagation anomaly tracking (telemetry gaps, drag surges) around the TCA.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            conjunctionId: { type: Type.STRING, description: "The ID of the conjunction event (e.g. CONJ-xxx-yyy)." },
            spanMinutes: { type: Type.INTEGER, description: "The temporal window to analyze around TCA in minutes. Defaults to 60." }
          },
          required: ["conjunctionId"]
        }
      },
      {
        name: "simulateManeuver",
        description: "Simulates a candidate impulse collision-avoidance maneuver for the primary satellite at a given duration before TCA, and calculates the resulting new miss distance.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            conjunctionId: { type: Type.STRING, description: "The ID of the conjunction event." },
            burnDirection: {
              type: Type.STRING,
              enum: ["PROGRADE", "RETROGRADE", "RADIAL", "INTRACK", "NORMAL"],
              description: "The direction of the impulse burn in the satellite's local orbital frame."
            },
            burnMagnitudeMs: { type: Type.NUMBER, description: "Delta-V velocity increment magnitude in meters per second (m/s)." },
            burnTimeHoursBeforeTca: { type: Type.NUMBER, description: "Time of burn implementation, represented as hours prior to the TCA (e.g. 12.0 hours)." }
          },
          required: ["conjunctionId", "burnDirection", "burnMagnitudeMs", "burnTimeHoursBeforeTca"]
        }
      }
    ]
  }
];

const systemInstruction = `
You are an expert Space Situational Awareness (SSA) decision-support assistant.
Assess the conjunction using ONLY the supplied data and the outputs of the tools you choose to call.

Rules:
- Do not invent data or calculate new numerical values.
- Do not recalculate Pc, covariance, miss distance, delta-v, fuel, or burn duration unless using the simulateManeuver tool.
- Distinguish facts from interpretation.
- Do not assume maneuver capability, propulsion, constraints, or object properties unless provided or discovered via tool output.
- Do not issue executable maneuver commands.
- Maneuver suggestions are candidate strategies for further validation only.
- Do not claim trends without invoking getDistanceHistory to check historical coordinates.
- Flag stale, missing, uncertain, or low-fidelity data (e.g., telemetry gaps, SGP4 deviations).
- Prefer monitoring/reassessment when information is insufficient.
- Use UTC for times.
`;

/**
 * Production-ready conjunction assessment function.
 * Queries Gemini using structured output schemas and executes tools (Function Calling) dynamically.
 */
export async function getConjunctionAssessment(
  conjunction: ConjunctionEvent,
  tleRecords: TleRecord[]
): Promise<any> {
  const fallbackResponse = {
    assessment: {
      status: "INSUFFICIENT_DATA",
      headline: "AI Service Interrupted",
      summary: "Could not generate automated AI assessment due to a service rate limit or api connection issue. Please monitor manually."
    },
    risk_factors: [
      {
        factor: "System Status",
        value: "API Offline/Error",
        impact: "uncertain",
        explanation: "The server failed to communicate with the Gemini API. This may be due to missing configuration or network blocks."
      }
    ],
    trend: {
      direction: "unknown",
      explanation: "Trend analysis unavailable."
    },
    candidate_evasion_strategies: [],
    recommended_actions: ["Manually review conjunction orbital parameters", "Check GEMINI_API_KEY environment variable"],
    missing_information: ["Gemini API response payload"],
    confidence: {
      level: "low",
      reason: "Fallback output generated due to backend exception."
    },
    data_limitations: ["Model generation failed"],
    safety_note: "Decision support only; candidate maneuvers require validated orbital and mission analysis."
  };

  try {
    const prompt = `
INPUT(SGP4 Propagation & Ephemeris State Data):
${JSON.stringify(conjunction, null, 2)}

Please assess this conjunction. Ensure you utilize the tools to get historical telemetry / distance history and to simulate at least one candidate maneuver to see if it reduces risk (e.g. a 5 m/s prograde burn 12 hours before TCA).
`;

    let activeContents: any[] = [{ role: 'user', parts: [{ text: prompt }] }];
    let finished = false;
    let iterations = 0;
    const MAX_ITERATIONS = 5;

    while (!finished && iterations < MAX_ITERATIONS) {
      const result = await gemini.models.generateContent({
        model: "gemini-3.5-flash-lite",
        contents: activeContents,
        config: {
          systemInstruction,
          tools,
          responseMimeType: "application/json",
          responseSchema: responseSchema
        }
      });

      const functionCalls = result.functionCalls;
      if (functionCalls && functionCalls.length > 0) {
        // Record assistant's function call intent
        activeContents.push({
          role: 'model',
          parts: result.candidates?.[0]?.content?.parts || []
        });

        const functionResponses: any[] = [];
        for (const call of functionCalls) {
          const { name, args } = call;
          let functionResult: any;

          try {
            if (name === "getDistanceHistory") {
              const recA = tleRecords.find(t => t.id === conjunction.objectA.id || t.name === conjunction.objectA.name);
              const recB = tleRecords.find(t => t.id === conjunction.objectB.id || t.name === conjunction.objectB.name);
              if (!recA || !recB) {
                functionResult = { error: "Missing TLE records for distance history lookup." };
              } else {
                functionResult = getDistanceHistory(
                  recA,
                  recB,
                  new Date(conjunction.tcaIso),
                  (args as any).spanMinutes || 60,
                  conjunction.minDistanceKm,
                  conjunction.relativeVelocityKmS
                );
              }
            } else if (name === "simulateManeuver") {
              functionResult = simulateManeuver(
                conjunction,
                tleRecords,
                (args as any).burnDirection,
                (args as any).burnMagnitudeMs,
                (args as any).burnTimeHoursBeforeTca
              );
            } else {
              functionResult = { error: `Function ${name} not found.` };
            }
          } catch (err: any) {
            functionResult = { error: err.message || "Failed executing tool" };
          }

          functionResponses.push({
            functionResponse: {
              name,
              response: { result: functionResult }
            }
          });
        }

        // Send function execution results back to model
        activeContents.push({
          role: 'user',
          parts: functionResponses
        });
        iterations++;
      } else {
        // No function calls, parse output text and return
        finished = true;
        if (result.text) {
          try {
            return JSON.parse(result.text.trim());
          } catch (parseErr) {
            console.error("[Gemini Parser Error] Failed parsing JSON output:", result.text, parseErr);
            return fallbackResponse;
          }
        }
      }
    }

    return fallbackResponse;
  } catch (err) {
    console.error("[Gemini Assessment Error]", err);
    return fallbackResponse;
  }
}