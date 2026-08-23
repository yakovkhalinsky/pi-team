export type AtpStage =
  | "goal-receipt"
  | "routing"
  | "context-gathering"
  | "action"
  | "verification"
  | "recording-and-archival"
  | "hand-off-or-closure";

export type AtpMarkerName =
  | "[goal-received]"
  | "[routing]"
  | "[context-gathering]"
  | "[skip-context-gathering]"
  | "[action]"
  | "[api-ready]"
  | "[verdict]"
  | "[recorded]"
  | "[closure]"
  | "[handoff]"
  | "[andon]"
  | "[escalation]"
  | "[worker-terminal]"
  | "[worker-relay]"
  | "[worker-pruned]";

export type AtpMarkerOwner =
  | "team-lead"
  | "dispatcher"
  | "researcher"
  | "builder"
  | "runtime"
  | "verifier"
  | "archivist"
  | "orchestrator"
  | "*";

export interface AtpMarkerSpec {
  marker: AtpMarkerName;
  stage: AtpStage | null;
  owner: AtpMarkerOwner;
  workerEvent: boolean;
}

export const ATP_MARKERS: readonly AtpMarkerSpec[];
export const ATP_MARKERS_BY_NAME: Readonly<Record<AtpMarkerName, AtpMarkerSpec>>;
export const ATP_MARKER_STAGE: Readonly<Record<AtpMarkerName, AtpStage | undefined>>;
export const ATP_MARKER_OWNER: Readonly<Record<AtpMarkerName, AtpMarkerOwner>>;
export const ATP_STAGES: readonly AtpStage[];
export function getMarkerSpec(marker: AtpMarkerName): AtpMarkerSpec;
export function isRoleAllowedForMarker(role: string, marker: AtpMarkerName): boolean;
