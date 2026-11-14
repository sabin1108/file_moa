"use client";

import { SettingRow } from "../../../components/ui/SettingRow";
import { actionClasses } from "../../../components/ui/action-classes";
import { UsageView } from "./UsageView";
import type { UsageSummary } from "../../../shared/ai-usage";
import styles from "../conversation-options.module.css";

export function ConversationSettingsPanel({ includeMemory, onIncludeMemory, projectId, onProjectId, canUseMemory, disabled, provider, temporary, onStorage, readUsage }: {
  includeMemory: boolean;
  onIncludeMemory: (enabled: boolean) => void;
  projectId: string;
  onProjectId: (value: string) => void;
  canUseMemory: boolean;
  disabled: boolean;
  provider: string | null;
  temporary: boolean;
  onStorage: () => void;
  readUsage?: () => Promise<UsageSummary | null>;
}) {
  return <div className={styles.settings} aria-label="대화 설정 내용">
    <section>
      <h3>대화 저장</h3>
      <SettingRow
        title={temporary ? "저장하지 않는 대화" : "이 기기에 저장 중"}
        description={temporary ? "새로고침하면 이 대화는 사라집니다." : "연결한 저장 폴더에서 다시 열 수 있어요."}
      >
        <button type="button" className={actionClasses("secondary")} onClick={onStorage}>저장 설정</button>
      </SettingRow>
    </section>
    <section>
      <h3>답변에 참고할 정보</h3>
      <label className={styles.toggle}>
        <span>
          <strong>내 프로필과 기억 사용</strong>
          <small>내가 승인한 기억만 질문과 함께 전송합니다.</small>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={includeMemory}
          disabled={disabled || !canUseMemory}
          onChange={event => onIncludeMemory(event.target.checked)}
        />
      </label>
      {!canUseMemory && <p>기록함의 저장 위치를 연결하면 사용할 수 있어요.</p>}
      <details className={styles.advanced}>
        <summary>프로젝트별 기억 · 고급 설정</summary>
        <label>
          프로젝트 식별자
          <input
            value={projectId}
            maxLength={64}
            disabled={disabled}
            placeholder="비워 두면 공통 기억만 사용"
            onChange={event => onProjectId(event.target.value)}
          />
        </label>
        <p>기억에 지정한 프로젝트 식별자와 같아야 적용됩니다. 프로젝트 이름 목록은 아직 제공하지 않습니다.</p>
      </details>
    </section>
    <details className={styles.advanced}>
      <summary>AI 전송·보관 안내</summary>
      <dl className={styles.facts}>
        <div>
          <dt>일반 질문</dt>
          <dd>{provider ?? "연결 안 됨"} · 최근 완료된 일반 대화 최대 3회</dd>
        </div>
        <div>
          <dt>내 자료</dt>
          <dd>선택한 발췌를 확인하고 동의한 뒤 전송</dd>
        </div>
        <div>
          <dt>프로필·기억</dt>
          <dd>사용을 켜면 최대 10개·6,000자 전송</dd>
        </div>
        <div>
          <dt>요청 한도</dt>
          <dd>자료 정리와 합쳐 계정·작업 공간별 1시간 10회</dd>
        </div>
      </dl>
      <p>서버 공유 한도로 더 일찍 제한될 수 있습니다. 중지·실패도 횟수에 포함되고 이미 발생한 비용은 남을 수 있어요. 기억을 자동 추출하지 않습니다.</p>
    </details>
    {readUsage && <details className={styles.advanced}>
      <summary>사용량·요청 내역</summary>
      <UsageView read={readUsage} />
    </details>}
  </div>;
}
