export type EventType = "user_message" | "system_event" | "timer" | "file_change" | "inbox";

export type Event = {
  id: string;
  type: EventType;
  content: string;
  timestamp: string;
  source?: string;
};

export type OrganQuestion = {
  target: string;
  question: string;
  event: Event;
  constraints?: string[];
};

export type OrganAnswer = {
  organ: string;
  relevant: boolean;
  confidence: number;
  summary: string;
  evidence?: unknown[];
  recommendedActions?: string[];
  warnings?: string[];
};

export type ConsultationRound = {
  round: number;
  questions: OrganQuestion[];
  answers: OrganAnswer[];
};

export type OrganCommand = {
  target: string;
  operation: string;
  payload: unknown;
  reason?: string;
};

export type OrganResult = {
  target: string;
  operation: string;
  status: "accepted" | "rejected" | "failed";
  summary: string;
  data?: unknown;
};

export type MainCortexOutput = {
  userResponse?: string;
  organCommands: OrganCommand[];
  uncertainty?: {
    level: "low" | "medium" | "high";
    reason: string;
  };
};

export type CortexContinueOutput = {
  type: "continue";
  reason: string;
  questions: Array<{
    target: string;
    question: string;
    constraints?: string[];
  }>;
};

export type CortexFinalOutput = MainCortexOutput & {
  type?: "final";
};

export type CortexStepOutput = CortexContinueOutput | CortexFinalOutput;

export type OrganInfo = {
  name: string;
  responsibility: string;
  dangerous?: boolean;
};

export type Organ = OrganInfo & {
  sense(question: OrganQuestion): Promise<OrganAnswer>;
  act(command: OrganCommand, event: Event): Promise<OrganResult>;
};
