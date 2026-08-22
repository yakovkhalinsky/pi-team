import type { TeamPathScope } from "../types.js";
export declare function normalizePathScope(pathScope: TeamPathScope | undefined, cwd: string): TeamPathScope | undefined;
export declare function isPathWithinScope(targetPath: string, pathScope: TeamPathScope, cwd: string): boolean;
export declare function isPathWithinProjectRoot(targetPath: string, projectRoot: string, cwd: string): boolean;
export declare function isPathScopeWithinProjectRoot(pathScope: TeamPathScope | undefined, projectRoot: string, cwd: string): boolean;
export declare function isPathScopeNarrowerOrEqual(candidate: TeamPathScope | undefined, baseline: TeamPathScope | undefined, cwd: string): boolean;
export declare function ensureWriteScope(pathScope: TeamPathScope | undefined, cwd: string): TeamPathScope;
