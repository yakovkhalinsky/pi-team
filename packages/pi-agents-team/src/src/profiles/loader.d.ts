import type { TeamProfileSpec } from "../types.js";
export declare const DEFAULT_PROFILES_DIR: string;
export declare function loadProfiles(profilesDir?: string): TeamProfileSpec[];
export declare function resolveProfile(profileName: string, profilesDir?: string): TeamProfileSpec;
