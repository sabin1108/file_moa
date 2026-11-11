import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { stats, summarize } from "./metrics.mjs";

const input = process.argv[2];
const raw = JSON.parse(readFileSync(input, "utf8"));
const output = dirname(input);
const records = raw.records;
const completed = records.filter(row => row.kind === "done");
const cases = completed.map((done, index) => {
  const rows = records.filter(row => row.kind === "browser" && row.run === done.run);

  assert.equal(rows.length, 20);
  assert.equal(new Set(rows.map(row => row.step)).size, 20);

  for (const row of rows) {
    assert.equal(row.variant, done.variant);
    assert.ok(Number.isFinite(row.elapsedMs) && row.elapsedMs >= 0);
  }

  const home = rows.find(row => row.step === 0).elapsedMs;
  const settings = rows.find(row => row.step === 1).elapsedMs;

  return {
    case: index + 1,
    variant: done.variant,
    run: done.run,
    homeMs: home,
    firstSettingsMs: settings,
    initialJourneyMs: home + settings,
    repeat: stats(rows.filter(row => row.phase === "settings" && row.step > 1).map(row => row.elapsedMs))
  };
});

assert.ok(cases.filter(row => row.variant === "before").length >= 2);
assert.ok(cases.filter(row => row.variant === "after").length >= 2);

const summary = summarize(records);

writeFileSync(join(output, "summary.json"), JSON.stringify(summary, null, 2));

const browserRows = records.filter(row => row.kind === "browser" && cases.some(item => item.run === row.run));
const serverRows = records.filter(row => row.kind === "server" && cases.some(item => item.run === row.run));
const beforeReads = serverRows.filter(row => row.variant === "before" && row.label.startsWith("settings-"));
const afterReads = serverRows.filter(row => row.variant === "after" && row.label.startsWith("settings-"));
const preparation = serverRows.filter(row => row.variant === "after" && row.label === "prepare");

assert.equal(beforeReads.length, 20);
assert.equal(afterReads.length, 20);
assert.equal(afterReads.reduce((sum, row) => sum + row.callbackCalls, 0), 0);
assert.equal(preparation.length, 2);
assert.ok(preparation.every(row => row.callbackCalls === 1));
writeFileSync(
  join(output, "browser-samples.csv"),
  "variant,case,step,phase,elapsed_ms,viewport_width\n" + browserRows.map(row => [row.variant, cases.find(item => item.run === row.run).case, row.step, row.phase, row.elapsedMs.toFixed(3), row.viewport].join(",")).join("\n") + "\n"
);
writeFileSync(
  join(output, "server-samples.csv"),
  "variant,case,label,elapsed_ms,cache_callback_calls\n" + serverRows.map(row => [row.variant, cases.find(item => item.run === row.run).case, row.label, row.elapsedMs.toFixed(3), row.callbackCalls].join(",")).join("\n") + "\n"
);

const format = ms => (ms / 1000).toFixed(3) + "초";
const names = {
  initialWorkspace: "첫 작업 공간 진입",
  firstSettings: "첫 설정 진입",
  initialJourney: "첫 작업 공간 + 첫 설정 합계",
  repeatedSettings: "반복 설정 진입"
};
const table = Object.entries(names).map(([key, title]) => {
  const before = summary.before[key].medianMs;
  const after = summary.after[key].medianMs;

  return `| ${title} | ${format(before)} | ${format(after)} | ${((after / before - 1) * 100).toFixed(1)}% |`;
}).join("\n");
const report = `# 설정 캐시의 실제 로그인 속도 비교\n\n2026-11-08, 사용자 브라우저에서 before→after→after→before 순서로 완료한 네 번의 실행이다. 각 실행에서 작업 공간 10회·설정 10회를 오갔다. 설정 40개, 전체 화면 준비 80개 표본을 기록했다.\n\n## 핵심 결과\n\n반복 설정 진입의 중앙값은 **${format(summary.before.repeatedSettings.medianMs)} → ${format(summary.after.repeatedSettings.medianMs)}**, **${summary.repeatedMedianReductionPercent.toFixed(1)}% 감소**했다. 절약된 시간은 약 ${Math.round(summary.before.repeatedSettings.medianMs - summary.after.repeatedSettings.medianMs)}ms다.\n\n| 구간 | 이전 조회 방식 복원 | 현재 캐시 방식 | 시간 변화 |\n| --- | ---: | ---: | ---: |\n${table}\n\n첫 진입의 합계는 거의 같았다. 사전 준비로 대기가 작업 공간 첫 진입으로 옮겨갔고, 이후 설정 화면에서 기다리는 시간이 줄어든 결과다. 전체 첫 진입이나 서비스 전체가 56% 빨라졌다고 해석하지 않는다.\n\n## 원자료와 표본 수\n\n| 순서 | 방식 | 첫 작업 공간 | 첫 설정 | 합계 | 반복 설정 중앙값 |\n| --- | --- | ---: | ---: | ---: | ---: |\n${cases.map(row => `| ${row.case} | ${row.variant} | ${format(row.homeMs)} | ${format(row.firstSettingsMs)} | ${format(row.initialJourneyMs)} | ${format(row.repeat.medianMs)} |`).join("\n")}\n\n첫 진입 지표는 방식별 2개, 반복 설정은 방식별 18개다. 반복 범위는 이전 ${format(summary.before.repeatedSettings.minMs)}~${format(summary.before.repeatedSettings.maxMs)}, 현재 ${format(summary.after.repeatedSettings.minMs)}~${format(summary.after.repeatedSettings.maxMs)}였다. 작은 표본의 p95는 참고용 원자료에만 남겼다. 모든 브라우저 표본의 너비는 ${[...new Set(browserRows.map(row => row.viewport))].join(",")}px다.\n\n## 서버에서 확인한 변화\n\n설정 표시 reader 중앙값은 ${summary.before.settingsReader.medianMs.toFixed(3)}ms → ${summary.after.settingsReader.medianMs.toFixed(3)}ms였다. 현재 방식은 두 번의 첫 준비에서 callback을 각각 1회 실행했고, 이후 설정 조회 20개에서는 callback 실행이 0회였다. 첫 준비 구간의 중앙값은 ${stats(preparation.map(row => row.elapsedMs)).medianMs.toFixed(1)}ms였다.\n\n이것은 reader 호출/캐시 callback 증거이며 실제 SQL round-trip 개수는 측정하지 않았다. 인증은 계속 실행된다. readSettingsDisplay 안의 인증 시간은 같은 렌더의 memoization을 포함하므로 전체 인증 비용으로 표현하지 않는다. reader가 빨라져도 탐색·인증·렌더링 등 다른 구간이 남는다. 브라우저와 서버 시간을 빼서 네트워크 시간이라고 계산하지 않았다.\n\n## 재현 범위와 한계\n\n- 정확한 옛 빌드는 보존되어 있지 않아 현재 UI에 캐시 전 세션 기반 조회 방식을 복원했다. 옛 전체 버전의 실행 결과가 아니다.\n- 이전은 프로필을 세션에서 얻고 현재의 cache miss에는 프로필 DB 조회가 추가된다. 사전 준비·조회 방식 변화 전체의 비교이며 캐시 API 하나만의 효과가 아니다.\n- 같은 로컬 production, 실제 인증·DB, 한 사용자 브라우저다. 현재 서비스의 Vercel 속도나 사용자 집단을 대표하지 않는다.\n- 각 시행 전 해당 측정 서버를 재시작하고 그 복사본의 fetch-cache만 비웠다. 원래 3034 앱은 그대로 두었다. 브라우저 HTTP 캐시는 유지했다.\n- Link prefetch를 끄고 고유 query로 router.push를 실행했다. 일반 메뉴의 같은 URL·prefetch/Router Cache 탐색과 다를 수 있다.\n- 서버 결과가 반영된 실제 화면의 준비를 두 frame 뒤 확인했다. 물리적 체감·LCP·INP를 직접 측정한 값은 아니다. 수집 시각은 결과가 수집기에 도착한 시각이다.\n- 모델 API 키를 전달하지 않아 이번 측정의 AI 호출은 0회다. 계정 정보·쿠키·토큰·파일 본문을 측정 파일에 기록하지 않았다.\n\n## 기록\n\n[브라우저 CSV](browser-samples.csv), [서버 CSV](server-samples.csv), [원자료 JSON](raw.json), [요약 JSON](summary.json), [환경 차단으로 제외한 초기 시도](attempt-sandbox-blocked.json). 빌드·소스 해시는 raw.json의 manifest에 있으며 조건과 도구는 [검증 설명](../README.md)을 따른다.\n`;

writeFileSync(join(output, "report.md"), report);
console.log(JSON.stringify({
  cases: cases.length,
  browserSamples: browserRows.length,
  beforeSettingSamples: beforeReads.length,
  afterSettingSamples: afterReads.length,
  repeatedReductionPercent: summary.repeatedMedianReductionPercent
}));
