import { DEFAULT_TEAM_CONFIG } from "../config.js";
export const DEFAULT_PROFILE_SPECS = DEFAULT_TEAM_CONFIG.profiles.map((profile) => ({ ...profile }));
export function getDefaultProfile(profileName) {
    return DEFAULT_PROFILE_SPECS.find((profile) => profile.name === profileName);
}
