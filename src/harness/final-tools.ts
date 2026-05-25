import { makeFinalTool } from "./tooling";

const questionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["target", "question"],
  properties: {
    target: { type: "string" },
    question: { type: "string" },
    constraints: { type: "array", items: { type: "string" } },
  },
};

const organCommandSchema = {
  type: "object",
  additionalProperties: false,
  required: ["target", "operation", "payload"],
  properties: {
    target: { type: "string" },
    operation: { type: "string" },
    payload: { type: "object", additionalProperties: true },
    reason: { type: "string" },
  },
};

export const finalOrganQuestionsTool = makeFinalTool("final_organ_questions", "Return the targeted organ questions for the first consultation round.", {
  type: "object",
  additionalProperties: false,
  required: ["questions"],
  properties: {
    questions: { type: "array", items: questionSchema },
  },
});

export const continueConsultationTool = makeFinalTool("continue_consultation", "Request one more targeted consultation round before finalizing.", {
  type: "object",
  additionalProperties: false,
  required: ["reason", "questions"],
  properties: {
    reason: { type: "string" },
    questions: { type: "array", minItems: 1, items: questionSchema },
  },
});

export const finalCortexOutputTool = makeFinalTool("final_cortex_output", "Finalize the cortex decision for this turn.", {
  type: "object",
  additionalProperties: false,
  required: ["organCommands"],
  properties: {
    userResponse: { type: "string" },
    organCommands: { type: "array", items: organCommandSchema },
    uncertainty: {
      type: "object",
      additionalProperties: false,
      required: ["level", "reason"],
      properties: {
        level: { type: "string", enum: ["low", "medium", "high"] },
        reason: { type: "string" },
      },
    },
  },
});

export const finalOrganAnswerTool = makeFinalTool("final_organ_answer", "Return this organ's normalized answer to the cortex.", {
  type: "object",
  additionalProperties: false,
  required: ["organ", "relevant", "confidence", "summary"],
  properties: {
    organ: { type: "string" },
    relevant: { type: "boolean" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    summary: { type: "string" },
    evidence: { type: "array", items: {} },
    recommendedActions: { type: "array", items: { type: "string" } },
    warnings: { type: "array", items: { type: "string" } },
  },
});

export const finalRenderedResponseTool = makeFinalTool("final_rendered_response", "Return the final user-facing response text.", {
  type: "object",
  additionalProperties: false,
  required: ["response"],
  properties: {
    response: { type: "string" },
  },
});
