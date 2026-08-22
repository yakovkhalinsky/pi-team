export interface SuggestOptions {
    limit?: number;
    maxDistance?: number;
}
export declare function suggestTargets(input: string, candidates: Iterable<string>, options?: SuggestOptions): string[];
export declare function formatUnknownWorker(input: string, suggestions: string[]): string;
