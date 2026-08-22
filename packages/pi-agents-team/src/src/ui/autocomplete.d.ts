import type { AutocompleteItem, AutocompleteProvider } from "@earendil-works/pi-tui";
import type { TeamConfig, WorkerRuntimeState } from "../types.js";
type TeamAutocompleteKind = "worker" | "role";
export interface TeamAutocompleteToken {
    kind: TeamAutocompleteKind;
    query: string;
    prefix: string;
}
export interface TeamAutocompleteSources {
    getWorkers: () => WorkerRuntimeState[];
    getProfiles: () => TeamConfig["profiles"];
}
export interface TeamAutocompleteHost {
    hasUI?: boolean;
    ui?: {
        addAutocompleteProvider?: (factory: (current: AutocompleteProvider) => AutocompleteProvider) => void;
    };
}
export declare function extractTeamAutocompleteToken(textBeforeCursor: string): TeamAutocompleteToken | undefined;
export declare function buildWorkerAutocompleteItems(workers: WorkerRuntimeState[], query: string): AutocompleteItem[];
export declare function buildRoleAutocompleteItems(profiles: TeamConfig["profiles"], query: string): AutocompleteItem[];
export declare function createTeamAutocompleteProvider(current: AutocompleteProvider, sources: TeamAutocompleteSources): AutocompleteProvider;
export declare function registerTeamAutocomplete(host: TeamAutocompleteHost, sources: TeamAutocompleteSources): boolean;
export {};
