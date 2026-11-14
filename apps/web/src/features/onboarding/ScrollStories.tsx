import { OrganizationScene, SearchScene } from "./ProductScenes";
import styles from "./onboarding-motion.module.css";
import { KnowledgeExamples } from "./KnowledgeExamples";
import { OrganizationDemo } from "./OrganizationDemo";

export function KnowledgeStory() {
  return (
    <section id="find" className={`${styles.story} ${styles.knowledgeFlow}`} aria-labelledby="find-heading">
      <div className={styles.storyHeading}>
        <h2 id="find-heading">자료에서 답변까지,<br />생각이 이어지도록.</h2>
        <p>찾고, 확인하고, 물어보세요.<br />하나의 자료에서 다음 생각이 시작돼요.</p>
      </div>
      <KnowledgeExamples><SearchScene includeAnswer /></KnowledgeExamples>
    </section>
  );
}

export function OrganizationStory() {
  return (
    <section
      id="organize"
      className={`${styles.story} ${styles.organization}`}
      aria-labelledby="organize-heading"
    >
      <p className="sr-only">정리할 자료와 목적지를 검토하고 직접 확인한 뒤 적용합니다. 이동 전 복구용 보존본을 준비해요. 아래는 실제 파일을 바꾸지 않는 예시입니다.</p>
      <OrganizationDemo
        heading={
          <div className={styles.storyHeading}>
            <h2 id="organize-heading">정리는 가볍게.<br />결정은 내 손으로.</h2>
            <p>바뀔 모습을 먼저 보고,<br />내가 확인한 계획대로 정리해요.</p>
          </div>
        }
        scene={<OrganizationScene />}
      />
    </section>
  );
}
