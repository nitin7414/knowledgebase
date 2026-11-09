export interface EmbeddingProvider {
  readonly name: string;
  readonly dimension: number;
  /**
   * Embeds an array of document chunks in batches.
   */
  embedTexts(texts: string[]): Promise<number[][]>;
  /**
   * Embeds a single user query optimized for retrieval.
   */
  embedQuery(text: string): Promise<number[]>;
}

