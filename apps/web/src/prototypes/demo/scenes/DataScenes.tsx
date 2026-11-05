"use client";
import { useState } from "react";
import { ActionLink } from "../../../components/ui/ActionLink";
import { Icon } from "../../../components/ui/Icon";
import { DemoButton } from "../DemoButton";
import type { SceneProps } from "../scene-data";
import styles from "../demo.module.css";
import layout from "../scene-layout.module.css";
import { ImpactComparison, RiskNotice } from "../RiskSummary";
import risk from "../risk-summary.module.css";

const exportContents = [
  { title: "대화 기록", detail: "나눈 질문과 답변", file: "conversations/" },
  { title: "프로필과 답변 설정", detail: "표시 이름과 답변 선호", file: "settings.json" },
  { title: "자료 목록과 참조 정보", detail: "문서 목록과 대화의 출처 연결", file: "references.json" },
] as const;

export function DataScenes({ scene, navigate }: SceneProps) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [included, setIncluded] = useState<readonly string[]>(exportContents.map(item => item.title));
  const [ready, setReady] = useState(false);
  if (scene === "export" || scene === "export-ready") {
    const isReady = scene === "export-ready" || ready;
    const contents = exportContents.filter(item => included.includes(item.title));
    return <div className={layout.decision}>
      <section className={layout.archive}><h3><Icon name="file" size={24} />moa-export.zip</h3><p>{isReady ? "파일 구성 예시" : "선택한 자료의 보관 형태"}</p>
        <ul className={layout.scopeList}>{contents.map(item => <li key={item.title}>{item.title}<small>{item.file}</small></li>)}</ul>
        {!contents.length && <p>내보낼 자료를 선택해 주세요.</p>}
      </section>
      <div className={layout.decisionSide}>
        {isReady ? <><h3>보관할 자료가 모였어요</h3><p>실제 다운로드는 기능 구현 단계에서 연결됩니다. 이 화면은 준비 완료 상태를 보여줍니다.</p><div className={styles.actions}><ActionLink href="/settings" variant="primary">설정으로 돌아가기</ActionLink></div></> : <>
          <fieldset className={styles.choices}><legend>포함할 자료</legend>{exportContents.map(item => <label className={styles.choice} key={item.title}><input type="checkbox" checked={included.includes(item.title)} onChange={event => setIncluded(event.target.checked ? [...included, item.title] : included.filter(title => title !== item.title))} /><span>{item.title}</span></label>)}</fieldset>
          <p className={styles.note}>인증 정보와 기기의 폴더 권한은 포함하지 않아요.</p>
          <div className={styles.actions}><DemoButton variant="primary" disabled={!included.length} onClick={() => setReady(true)}>내보내기 준비</DemoButton></div>
        </>}
      </div>
    </div>;
  }
  if (scene === "deleted") return <div className={layout.recovery}><div><h3>새 작업을 멈추고 자료를 정리해요</h3><p>삭제 요청 후에는 계정의 새 작업을 중단하고, 서버 자료 정리 상태를 안내합니다.</p><p className={styles.note}>처리 상태 예시입니다. 실제 계정·세션·문서를 삭제하지 않았습니다.</p></div><div><h3>기기 원본은 그대로</h3><p>내 컴퓨터의 폴더와 파일은 삭제 대상에 포함되지 않습니다.</p><div className={styles.actions}><ActionLink href="/login" variant="primary">로그인 화면으로</ActionLink></div></div></div>;
  return <div className={styles.stack}>
    <RiskNotice tone="danger" label="계정과 서버 자료 삭제" title="삭제가 완료되면 이 자료를 사용할 수 없어요">대화 기록과 서버 문서 복사본이 삭제 대상입니다. 보관할 자료가 있다면 먼저 내보내기를 확인해 주세요.</RiskNotice>
    <ImpactComparison tone="danger" affected={{ title: "서버에서 삭제되는 자료", items: ["계정 정보와 대화 기록", "서버에 보관한 문서 복사본"] }} preserved={{ title: "내 컴퓨터에 남는 자료", items: ["연결했던 원본 폴더와 파일", "기기에 따로 보관한 내보내기 파일"] }} />
    <div className={styles.actions}><DemoButton onClick={() => navigate("export")}>삭제 전 자료 내보내기</DemoButton></div>
    <div className={layout.ledgerFooter}><label className={styles.check}><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} />삭제 범위를 확인했어요.</label><div className={styles.actions}><ActionLink href="/settings">취소</ActionLink><DemoButton disabled={!acknowledged} variant="primary" className={risk.dangerAction} onClick={() => navigate("deleted")}>삭제 요청 화면 보기</DemoButton></div></div>
  </div>;
}
