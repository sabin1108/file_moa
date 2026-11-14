"use client";

import { SettingRow } from "../../../components/ui/SettingRow";
import { actionClasses } from "../../../components/ui/action-classes";
import { UsageView } from "./UsageView";
import type { UsageSummary } from "../../../shared/ai-usage";
import styles from "../conversation-options.module.css";

export function ConversationSettingsPanel({ includeMemory, onIncludeMemory, projectId, onProjectId, canUseMemory, disabled, provider, temporary, onStorage, onReplayTour, readUsage }: {
  includeMemory: boolean;
  onIncludeMemory: (enabled: boolean) => void;
  projectId: string;
  onProjectId: (value: string) => void;
  canUseMemory: boolean;
  disabled: boolean;
  provider: string | null;
  temporary: boolean;
  onStorage: () => void;
  onReplayTour?: () => void;
  readUsage?: () => Promise<UsageSummary | null>;
}) {
  return <div className={styles.settings} aria-label="대화 설정 내용">
    <section>
      <SettingRow
        title={temporary ? "대화 저장 꺼짐" : "대화 저장 켜짐"}
        description={temporary ? "새로고침하면 이 대화는 사라집니다." : "연결한 저장 폴더에서 다시 열 수 있어요."}
      >
        <button type="button" className={actionClasses("secondary")} onClick={onStorage}>저장 설정</button>
      </SettingRow>
    </section>
    <section>
      <label className={styles.toggle}>
        <span>
          <strong>내 정보 참고</strong>
          <small>{canUseMemory ? "프로필과 직접 승인한 기억을 AI에 함께 보냅니다." : "기록 저장을 연결하면 사용할 수 있어요."}</small>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={includeMemory}
          disabled={disabled || !canUseMemory}
          onChange={event => onIncludeMemory(event.target.checked)}
        />
      </label>
    </section>
    {onReplayTour && <button type="button" className={actionClasses("secondary")} disabled={disabled} onClick={onReplayTour}>사용 방법 다시 보기</button>}
    <details className={styles.advanced}>
      <summary>고급 설정 및 이용 정보</summary>
      <section>
        <h3>프로젝트별 기억</h3>
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
        <p>같은 식별자를 지정한 기억만 추가로 참고합니다. 비워 두면 공통 기억만 사용합니다.</p>
      </section>
      <h3>AI 전송·보관 안내</h3>
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
      {readUsage && <><h3>사용량·요청 내역</h3><UsageView read={readUsage} /></>}
    </details>
  </div>;
}
