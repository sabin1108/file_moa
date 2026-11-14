import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Workbook, SpreadsheetFile } from "@oai/artifact-tool";

// Run with the bundled artifact runtime linked into this script's node_modules; no app dependency.

const out = resolve("tests/fixtures/classification/business-v1");

await mkdir(out, { recursive: true });

const groups = [
  ["company", "source-company", "finance", [
    ["분기 영업 요약", "가상기업A 3분기 매출 보고서. 온라인 판매 8400만원, 오프라인 판매 6100만원이다. 채널별 매출과 반품을 구분하고 영업이익 계산에는 원가를 별도로 반영한다."],
    ["월별 비용 메모", "가상기업A 8월 비용은 인건비 3200만원, 임차료 800만원, 배송비 420만원이다. 판매량이 증가해도 고정비와 변동비를 구분해야 손익 변화 원인을 설명할 수 있다."],
    ["재고 수불 기록", "가상기업B 창고의 기초 재고는 120개, 입고 80개, 출고 95개이다. 기말 재고는 105개다. 반품 3개는 검사 대기라 판매 가능 수량에서 제외했다."],
    ["채권 확인", "가상기업B 거래처별 미수금 점검 자료. 계약A 450만원은 8월 말 지급 예정이고 계약B 280만원은 검수 후 청구한다. 매출 인식과 현금 입금 시점이 다르다."],
    ["채널 변경안", "가상기업C의 판매 전략 회의. 방문 유입은 늘었지만 구매 전환율이 낮아 상품 설명을 개선한다. 확정 실적이 아니라 다음 분기 실험 계획이며 영업 성과로 집계하지 않는다."],
    ["반품 원인 분류", "가상기업C 9월 반품 45건 중 크기 불일치 21건, 배송 파손 14건, 기타 10건이다. 고객 상담 기록의 원문과 개인정보는 넣지 않은 합성 통계다."],
  ]],
  ["research", "source-research", "learning", [
    ["학기말 연구 초록", "가상학교A 교육 연구 논문 초록. 간격 반복 학습이 회상 정확도에 주는 영향을 조사했다. 실험군 24명과 비교군 24명을 가정한 모의 연구이며 실제 사람을 모집하지 않았다."],
    ["선행 연구 정리", "가상학교A 논문 작성 연습. 검색 키워드, 포함 기준, 제외 기준을 먼저 정하고 초록과 방법을 비교한다. 실제 논문이나 DOI를 인용하지 않은 문헌 검토 절차 샘플이다."],
    ["실험 설계 초안", "가상학교B 연구 설계. 가설은 주당 복습 횟수와 퀴즈 점수 사이의 양의 관계이다. 사전 점수 차이와 중도 이탈이 교란 요인이 될 수 있어 무작위 배정과 결측 처리 규칙을 기록한다."],
    ["졸업 보고서 구성", "가상학교B 졸업 보고서 목차는 문제 정의, 관련 연구, 방법, 실험, 한계 순서다. 학습용 예시이며 데이터의 출처와 재현 절차를 방법 절에 명시하도록 검토한다."],
    ["연구실 회의 기록", "가상학교C 연구실 회의. 표본 크기 60개가 확보될 때까지 결론을 보류하고 이상치 제거 기준을 분석 전에 정한다. 유의한 결과만 남기는 선택적 보고를 피한다."],
    ["논문 제출 점검", "가상학교C 논문 제출 체크리스트. 표와 본문의 단위 일치, 익명화, 참고문헌 형식, 코드와 데이터의 재현 가능성을 확인한다. 현재 상태는 초안이며 심사 통과 기록이 아니다."],
  ]],
  ["statistics", "source-statistics", "learning", [
    ["표본 조사 설계", "가상 설문 통계 자료. 모집단 1200명에서 학년별 층화 표본 120명을 가정한다. 응답률과 선택 편향을 함께 보고하며 응답자 비율을 모집단 전체의 확정 비율로 해석하지 않는다."],
    ["기초 통계 계산", "합성 측정값 12, 15, 18, 15, 20의 평균은 16이고 중앙값은 15이다. 표본 분산과 모집단 분산은 분모가 다르므로 수치의 정의를 함께 적는다."],
    ["결측 처리 규칙", "모의 통계 분석에서 결측값은 0으로 바꾸지 않는다. 미응답과 실제 0을 구분하고 완전 사례 수, 제외 사유, 대체 방법을 남겨 분석 결과를 재현한다."],
    ["상관 해석 메모", "합성 자료의 공부 시간과 시험 점수 상관을 살펴본다. 상관계수만으로 인과관계를 말할 수 없고 사전 지식과 수면 시간이 두 변수에 함께 영향을 줄 수 있다."],
    ["지표 정의서", "가상 조직 통계 정의. 재구매율은 기간 내 구매자 중 과거 구매 이력이 있는 사람의 비율이다. 분모가 전체 방문자인 전환율과 혼동하지 않도록 집계 기간을 통일한다."],
    ["조사 결과 보고", "가상 만족도 조사 보고서. 응답 80건 중 만족 52건, 보통 20건, 불만족 8건이다. 비응답 40건은 분모에 넣지 않았으며 선택 편향 가능성을 한계로 기록한다."],
  ]],
  ["visits", "source-visits", "finance", [
    ["주간 유입 분석", "가상 웹서비스A 방문 분석 보고서. 검색 유입 1200회, 직접 유입 650회, 소셜 유입 420회이다. 세션은 중복 사용자를 포함하며 고유 방문자 수와 다르다."],
    ["전환 퍼널 정의", "가상 쇼핑몰의 방문 2400세션, 상품 조회 1500세션, 장바구니 240세션, 구매 96세션이다. 방문 대비 구매 전환율은 4퍼센트이고 단계별 이탈 원인을 구분한다."],
    ["캠페인 회고", "가상 웹서비스B 메일 캠페인의 방문 480회와 가입 36건을 집계했다. 중복 가입과 내부 직원 접속은 제외했다. 매출은 추적하지 않아 광고 수익률을 확정할 수 없다."],
    ["방문수 집계 규칙", "페이지뷰는 페이지 로드 횟수이고 방문수는 세션 수다. 합성 봇 트래픽 90건과 내부 접속 32건을 제외한 방문 지표를 사용한다. 실제 사용자 식별 정보는 없다."],
    ["유입 경로 점검", "가상 웹서비스C 분석 태그의 누락으로 일부 추천 유입이 직접 방문으로 집계됐다. 9월 자료는 수정 전후를 구분하며 누락된 원천 데이터를 추정해 덮어쓰지 않는다."],
    ["방문 분석 인수인계", "가상 서비스 방문 대시보드 인수인계. 매주 월요일 동일 시간대에 집계하고 신규 방문과 재방문을 따로 본다. 성능 속도 측정 자료가 아니라 사용량과 전환 지표 설명이다."],
  ]],
  ["study", "source-study", "learning", [
    ["운영체제 복습", "개인 공부 노트. 프로세스는 독립 주소 공간을 사용하고 스레드는 같은 프로세스의 자원을 공유한다. 동기화가 필요한 공유 상태와 문맥 교환 비용을 예제로 복습한다."],
    ["자료구조 과제", "개인 학습 과제. 배열과 연결 리스트의 탐색과 삽입 비용을 비교하고 입력 크기를 고정해 설명한다. 아직 실행한 벤치마크가 아니라 계산 복잡도를 공부한 내용이다."],
    ["영어 학습 기록", "가상 개인 학습 기록. 월요일 읽기 40분, 수요일 듣기 35분, 금요일 쓰기 45분을 수행했다. 주간 합계 120분이며 다음 복습은 어려웠던 표현을 중심으로 계획한다."],
    ["확률 강의 필기", "개인 확률 공부. 조건부 확률과 독립 사건을 구분한다. 주사위 두 번의 결과는 독립이지만 비복원 추출은 앞선 선택이 뒤의 확률에 영향을 준다."],
    ["자격시험 오답", "가상 자격시험 학습 오답 노트. 네트워크 서브넷 계산 4문제 중 2문제를 틀렸다. 공식 암기보다 주소 범위와 호스트 수를 직접 계산하는 연습이 필요하다."],
    ["학습 계획 조정", "개인 공부 계획. 주당 학습 목표 8시간 중 실제 6.5시간을 수행했다. 놓친 강의를 모두 다음 날로 미루기보다 핵심 복습과 과제를 먼저 배치한다."],
  ]],
  ["developer", "source-webdocs", "engineering", [
    ["라우팅 메모", "가상 개발 프로젝트A 웹사이트 문서. 화면 URL과 상태의 관계를 정의하고 새로고침으로 파일 변경 작업이 다시 실행되지 않게 읽기와 쓰기 동작을 분리한다."],
    ["접근성 점검표", "개발자 웹사이트 학습 문서. 버튼에는 이름을 제공하고 키보드 초점과 오류 안내를 연결한다. 애니메이션은 reduced motion 설정을 따르며 색상만으로 상태를 구분하지 않는다."],
    ["폼 처리 규약", "가상 개발 프로젝트B 입력 폼 설계. 한국어 조합 중 Enter는 전송하지 않고 Shift Enter는 줄바꿈으로 처리한다. 중복 제출과 늦은 응답이 상태를 덮어쓰는 경우를 검사한다."],
    ["API 응답 설명", "가상 개발 프로젝트B API 문서. 목록 조회는 읽기 전용이며 변경 요청에는 사용자 범위와 멱등 키가 필요하다. 비밀키는 브라우저 번들로 보내지 않는다."],
    ["성능 지표 공부", "개발자 학습 노트. LCP는 주요 콘텐츠 표시, INP는 상호작용 응답, CLS는 레이아웃 이동 지표다. 정의만 공부했으며 실제 사이트 성능 테스트나 측정 결과는 없다."],
    ["컴포넌트 계약", "가상 개발 프로젝트C 화면 컴포넌트 문서. 공통 사이드바는 메뉴와 표시를 맡고 파일 핸들과 서버 요청은 별도 연결부가 맡는다. 실제 반복 책임이 있을 때 재사용한다."],
  ]],
  ["operations", "source-company", "meeting", [
    ["입사 안내", "가상기업A 신규 입사 교육 자료. 장비 신청, 권한 확인, 보안 교육, 팀 소개 순서로 진행한다. 계정 비밀번호와 실제 직원 정보는 포함하지 않는다."],
    ["고객 지원 집계", "가상기업B 고객 상담 통계. 문의 180건 중 배송 72건, 결제 54건, 계정 36건, 기타 18건이다. 해결 건수와 접수 건수는 기준 시점을 맞춰 비교한다."],
    ["공급 일정", "가상기업C 구매 계획. 포장재 300개는 9월 둘째 주, 라벨 500개는 셋째 주에 입고할 예정이다. 예정 수량이므로 실제 재고와 혼합하지 않는다."],
    ["학교 행사 운영", "가상학교A 행사 운영 보고서. 신청 160명 중 참석 132명이며 설문 응답은 90명이다. 신청 대비 참석률과 참석 대비 설문 응답률은 서로 다른 지표다."],
    ["팀 업무 인계", "가상 조직 주간 인수인계. 완료한 일, 진행 중인 일, 의사결정이 필요한 일을 나눈다. 담당자 실명과 외부 문서 링크 없이 업무 유형만 보여 주는 합성 자료다."],
    ["회의와 결정", "가상기업D 업무 회의록. 월별 매출 보고서와 방문 분석의 담당 부서를 정했다. 이 문서는 보고서 본문이 아니라 작성 책임과 일정을 정한 회의 기록이다."],
  ]],
];
const documents = [];
const hash = bytes => createHash("sha256").update(bytes).digest("hex");

for (const [group, sourceFolderId, folderId, entries] of groups) for (const [i, [title, body]] of entries.entries()) {
  const format = i % 2 ? "txt" : "md";
  const excerpt = `${format === "md" ? "# " : ""}${title}\n작성일: 2026-09-${String(i + 3).padStart(2, "0")}\n${body}\n출처: MOA 원본 합성 샘플 business-v1. 실제 기관·개인 자료가 아닙니다.`;
  const bytes = Buffer.from(excerpt + "\n");
  const name = `${title}.${format}`;

  await writeFile(resolve(out, `${group}-${name}`), bytes);
  documents.push({
    id: `business-${group}-${i + 1}`,
    name,
    format,
    excerpt,
    sourceFolderId,
    proposal: { folderId, reason: "준비된 샘플 제안입니다. 대화에서는 요청과 본문 근거를 다시 확인합니다.", reviewRequired: false },
    assetBase64: bytes.toString("base64"),
    sha256: hash(bytes)
  });
}

const sheets = [
  ["sales", "채널별 매출", "source-company", "finance", ["채널", "매출(만원)", "원가(만원)", "이익(만원)"], [["온라인", 8400, 5100], ["오프라인", 6100, 3900], ["도매", 4200, 3100]], "B-C"],
  ["visits", "방문과 구매", "source-visits", "finance", ["유입", "방문(세션)", "구매(건)", "전환율"], [["검색", 1200, 60], ["직접", 650, 39], ["소셜", 420, 21]], "C/B"],
  ["statistics", "학년별 설문", "source-statistics", "learning", ["학년", "응답(명)", "만족(명)", "만족 비율"], [["1학년", 30, 21], ["2학년", 28, 18], ["3학년", 22, 13]], "C/B"],
  ["study", "과목별 공부 시간", "source-study", "learning", ["과목", "목표(시간)", "실제(시간)", "부족(시간)"], [["운영체제", 3, 2.5], ["영어", 2, 2], ["확률", 3, 2]], "B-C"],
  ["research", "연구 진행 현황", "source-research", "learning", ["단계", "계획(건)", "완료(건)", "진행률"], [["문헌검토", 12, 9], ["모의실험", 6, 4], ["표검토", 8, 3]], "C/B"],
  ["operations", "문의 처리 통계", "source-company", "meeting", ["유형", "접수(건)", "해결(건)", "해결률"], [["배송", 72, 60], ["결제", 54, 48], ["계정", 36, 30]], "C/B"],
  ["budget", "부서별 예산", "source-company", "finance", ["부서", "예산(만원)", "집행(만원)", "잔액(만원)"], [["교육", 450, 320], ["개발", 1200, 960], ["운영", 800, 700]], "B-C"],
  ["service", "웹서비스 오류 집계", "source-webdocs", "engineering", ["구간", "요청(건)", "오류(건)", "오류율"], [["로그인", 2400, 12], ["목록", 3800, 19], ["검색", 1600, 16]], "C/B"],
];
const manifest = [];

for (const [id, title, sourceFolderId, folderId, headers, inputs, operation] of sheets) {
  const wb = Workbook.create();
  const sheet = wb.worksheets.add("요약");

  sheet.showGridLines = false;
  sheet.getRange("A2").values = [[title]];
  sheet.getRange("A3").values = [["2026년 9월 · MOA 합성 자료 · 실제 기관 데이터 아님"]];
  sheet.getRange("A5:D5").values = [headers];
  sheet.getRange("A6:C8").values = inputs;
  sheet.getRange("D6:D8").formulas = inputs.map((_row, i) => [operation === "B-C" ? `=B${i + 6}-C${i + 6}` : `=C${i + 6}/B${i + 6}`]);
  sheet.getRange("A9").values = [["합계"]];
  sheet.getRange("B9:C9").formulas = [["=SUM(B6:B8)", "=SUM(C6:C8)"]];
  sheet.getRange("D9").formulas = [[operation === "B-C" ? "=B9-C9" : "=C9/B9"]];
  sheet.getRange("A2:D9").format.font.name = "Arial";
  sheet.getRange("A2:D9").format.font.size = 11;
  sheet.getRange("A2").format.font.size = 15;
  sheet.getRange("A5:D5").format.fill = "#E9EEEB";
  sheet.getRange("A5:D5").format.font.bold = true;
  sheet.getRange("A5:D5").format.horizontalAlignment = "center";
  sheet.getRange("A9:D9").format.font.bold = true;
  sheet.getRange("A5:D9").format.rowHeight = 26;
  sheet.getRange("A:A").format.columnWidth = 26;
  sheet.getRange("B:D").format.columnWidth = 19;
  sheet.getRange("B6:D9").format.horizontalAlignment = "right";
  sheet.getRange("B6:D9").setNumberFormat("#,##0.0");

  if (operation === "C/B") sheet.getRange("D6:D9").setNumberFormat("0.0%");

  wb.recalculate();

  const rows = sheet.getRange("A5:D9").values;

  assert.equal(rows.length, 5);

  for (const row of rows.slice(1)) for (const cell of row.slice(1)) assert.equal(typeof cell, "number");

  const expectedB = inputs.reduce((sum, row) => sum + row[1], 0);
  const expectedC = inputs.reduce((sum, row) => sum + row[2], 0);

  assert.ok(Math.abs(rows[4][3] - (operation === "B-C" ? expectedB - expectedC : expectedC / expectedB)) < 1e-9);

  const name = `${title}.xlsx`;
  const file = await SpreadsheetFile.exportXlsx(wb);

  await file.save(resolve(out, name));

  const bytes = await readFile(resolve(out, name));

  if (id === "sales" || id === "visits") {
    const preview = await wb.render({ sheetName: "요약", range: "A1:D10", scale: 1.5, format: "png" });

    await writeFile(
      resolve("test-results", `business-${id}.png`),
      new Uint8Array(await preview.arrayBuffer())
    );
  }

  const excerpt = `${title}\n기준월: 2026년 9월. MOA 원본 합성 수치 자료.\n${rows.map(row => row.join(" | ")).join("\n")}\nD열은 ${operation === "B-C" ? "B열에서 C열을 뺀 값" : "C열을 B열로 나눈 비율"}이며 합계는 원자료를 합산한 뒤 계산한다.${id === "service" ? " 요청 건수와 오류 비율 통계이며 사이트 속도 측정이나 성능 테스트 결과가 아니다." : ""}`;

  documents.push({
    id: `business-xlsx-${id}`,
    name,
    format: "xlsx",
    excerpt,
    sourceFolderId,
    sheet: { name: "요약", rows },
    proposal: { folderId, reason: "준비된 수치 자료 제안입니다. 내용과 단위를 확인하세요.", reviewRequired: false },
    assetBase64: bytes.toString("base64"),
    sha256: hash(bytes)
  });
  manifest.push({
    id: `business-xlsx-${id}`,
    name,
    sha256: hash(bytes),
    rows,
    totalFormula: operation === "B-C" ? "=B9-C9" : "=C9/B9"
  });
}

assert.equal(documents.length, 50);
await writeFile(
  resolve("apps/web/src/server/demo/sample-data/business-documents.json"),
  JSON.stringify(documents, null, 2) + "\n"
);
await writeFile(
  resolve(out, "manifest.json"),
  JSON.stringify(
    {
      version: "business-v1",
      seed: "manual-business-v1",
      provenance: "Original synthetic documents; no external/private data; no evaluation answers",
      spreadsheets: manifest,
      documents: documents.map(({ id, name, format, sha256 }) => ({ id, name, format, sha256 }))
    },
    null,
    2
  ) + "\n"
);
console.log(JSON.stringify({ documents: documents.length, spreadsheets: sheets.length, output: out }));
