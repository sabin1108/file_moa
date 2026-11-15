import fixture from "../../../../tests/fixtures/local-rag-search-v3.json";
import { evaluateSemanticFixture } from "./semantic-evaluation-v2";
import type { SemanticModelController } from "../../src/features/local-folders/search/semantic/semantic-model-controller";

export async function evaluateSemanticDevelopment(model: SemanticModelController) {
  const dev = { ...fixture, queries: fixture.queries.filter(query => query.split === "dev") };
  const metadata = await evaluateSemanticFixture(model, dev);
  const bodyOnly = await evaluateSemanticFixture(model, dev, "body-only");
  const before = metadata.metrics.optional.dev;
  const after = bodyOnly.metrics.optional.dev;
  const safe = after.recallAt5 >= before.recallAt5 && after.mrr >= before.mrr && after.forbidden <= before.forbidden && after.emptyFalsePositives <= before.emptyFalsePositives;
  const better = after.recallAt5 > before.recallAt5 || after.mrr > before.mrr || after.forbidden < before.forbidden || after.emptyFalsePositives < before.emptyFalsePositives;
  return { metadata, bodyOnly, choice: safe && better ? "body-only" as const : "metadata" as const, decisionAt: new Date().toISOString(), rule: "No metric regression and at least one strict improvement on dev; no holdout tuning" };
}

export async function evaluateSemanticHoldout(model: SemanticModelController, choice: "metadata" | "body-only") {
  const holdout = { ...fixture, queries: fixture.queries.filter(query => query.split === "holdout") };
  const metadata = await evaluateSemanticFixture(model, holdout);
  const selected = choice === "metadata" ? metadata : await evaluateSemanticFixture(model, holdout, choice);
  return { metadata, selected, choice, evaluatedAt: new Date().toISOString() };
}
