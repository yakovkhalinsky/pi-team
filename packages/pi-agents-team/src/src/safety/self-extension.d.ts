/**
 * Derive self-entry candidates from this module's source or compiled location.
 * Source modules live at <package>/src/safety; published modules live at
 * <package>/dist/src/safety. The module extension distinguishes those verified
 * forms without treating a source package directory named `dist` as emitted
 * output. Keeping both layouts in the candidate set lets a source checkout
 * reject its generated dist entry without requiring dist to exist, while an
 * installed package rejects its compiled entry.
 */
export declare function getOrchestratorSelfEntryPaths(modulePath?: string): ReadonlySet<string>;
export declare function isRecursiveOrchestratorExtensionSource(source: string, baseDir: string, modulePath?: string): boolean;
