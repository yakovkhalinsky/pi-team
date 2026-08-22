export interface FinalAnswerSummaryFields {
    headline?: string;
    risks?: string[];
    nextRecommendation?: string;
}
export declare function extractFinalAnswer(text: string): string | undefined;
export declare function parseFinalAnswerSummaryFields(text: string): FinalAnswerSummaryFields;
