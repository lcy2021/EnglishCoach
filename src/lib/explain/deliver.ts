/** Deliver key for one paragraph's Chinese line — keeps TextThrow scoped to that node. */
export function explainDeliverKey(paragraphIndex: number): string {
  return `explain-${paragraphIndex}`;
}
