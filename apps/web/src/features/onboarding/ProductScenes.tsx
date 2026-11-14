import { Icon, MoaMark } from "../../components/ui/Icon";
import type { ReactNode } from "react";
import styles from "./onboarding.module.css";

const documents = [
  { name: "프로젝트 회의록.md", kind: "회의 기록", content: "다음 주에는 자료 검색과 정리 흐름을 함께 검토한다." },
  { name: "리서치 노트.pdf", kind: "참고 자료", content: "흩어진 정보를 연결하면 새로운 관점이 보이기 시작한다." },
  { name: "아이디어 메모.txt", kind: "나의 생각", content: "좋은 생각은 기록에서 시작되고, 다음 작업으로 이어진다." },
] as const;

export function FolderScene({ children }: { children?: ReactNode }) {
  return (
    <div
      className={styles.folderScene}
      role="img"
      aria-label="회의록, 리서치 노트, 아이디어 메모가 모아 폴더로 모이는 소개 그림"
      data-intro-folder
    >
      <div className={styles.folderBack} data-folder-back />
      <div className={styles.papers}>
        {documents.map(document => (
          <div className={styles.paper} key={document.name} data-intro-paper>
            <Icon name="file" size={30} />
            <span>
              {document.kind}
            </span>
            <strong>
              {document.name}
            </strong>
            <p>
              {document.content}
            </p>
          </div>
        ))}
      </div>
      {children}
      <div className={styles.folderFront} data-folder-front>
        <MoaMark size={52} />
        <span>나의 자료, 다음 생각으로.</span>
        <strong>모아.</strong>
      </div>
      <div className={styles.folderCaption} data-folder-caption><Icon name="folder" /> 내 컴퓨터의 자료에서 시작해요</div>
    </div>
  );
}

export function SearchScene({ includeAnswer = false }: { includeAnswer?: boolean }) {
  return (
    <div className={styles.searchScene} data-ui data-guided-example={includeAnswer ? "true" : undefined}>
      <div className={styles.sceneTop}>
        <span>내 자료</span>
        <span>프로젝트 / 회의</span>
      </div>
      <div className={styles.searchQuery} data-search-query>
        <Icon name="search" size={22} />
        <span>정리 흐름</span>
      </div>
      <div className={styles.searchResult} data-search-result>
        <Icon name="file" size={25} />
        <div>
          <strong>프로젝트 회의록.md</strong>
          <p>다음 주에는 <mark>자료 검색과 정리 흐름</mark>을 함께 검토한다.</p>
          <span>프로젝트 / 회의 / 프로젝트 회의록.md</span>
        </div>
      </div>
      <div className={styles.sourceExcerpt} data-source-excerpt>
        <span>원문에서 확인</span>
        <p>자료 검색과 정리 흐름을 함께 검토한다.</p>
        {includeAnswer && <p data-source-context>검색한 문장 앞뒤의 회의 맥락을 함께 확인해요.</p>}
        <Icon name="external" />
      </div>
      {includeAnswer && (
        <div data-knowledge-answer>
          <p data-example-question>회의에서 결정한 내용은?</p>
          <strong>자료를 근거로 이어지는 답변</strong>
          <p>자료 검색과 정리 흐름을 검토하고, 필요한 변경을 계획에 반영하기로 했어요.</p>
        </div>
      )}
      <p className={styles.sceneNote}>키워드로 찾고, 원문으로 확인해요.</p>
    </div>
  );
}

export function ConversationScene() {
  return (
    <div className={styles.conversationScene} data-ui>
      <div className={styles.sceneTop}>
        <span><MoaMark size={23} /> 모아와 대화</span>
        <span>선택한 자료 2개</span>
      </div>
      <p className={styles.question} data-conversation-question>이 회의에서 결정한 내용을 정리해 줘.</p>
      <div className={styles.answer} data-conversation-answer>
        <MoaMark size={27} />
        <div>
          <strong>다음 작업은 이렇게 이어져요.</strong>
          <p>자료 검색과 정리 흐름을 검토하고, 필요한 변경을 계획에 반영하기로 했어요.</p>
          <span><Icon name="file" size={15} /> 프로젝트 회의록.md</span>
        </div>
      </div>
      <div className={styles.composerExample}>
        <span>궁금한 내용을 이어서 물어보세요</span>
        <Icon name="arrow" size={22} />
      </div>
    </div>
  );
}

export function PlanScene() {
  return (
    <div className={styles.planScene} data-ui>
      <div className={styles.sceneTop}>
        <span>정리 계획 검토</span>
        <span>아직 적용하지 않았어요</span>
      </div>
      <div className={styles.planLocation} data-plan-location>
        <Icon name="folder" size={24} />
        <span>흩어진 자료</span>
      </div>
      {documents.map(document => (
        <div className={styles.planRow} key={document.name} data-plan-row>
          <Icon name="file" />
          <span>
            {document.name}
          </span>
          <Icon name="chevron" />
          <span>
            {document.kind}
          </span>
        </div>
      ))}
      <div className={styles.planReview}>
        <Icon name="check" />
        <span>위치와 변경 내용을 확인한 뒤 적용해요.</span>
      </div>
    </div>
  );
}

export function DirectoryScene({ arranged = false }: { arranged?: boolean }) {
  return (
    <div className={styles.directoryScene} data-ui data-directory={arranged ? "after" : "before"}>
      <div className={styles.sceneTop}>
        <span><Icon name="folder" /> {arranged ? "정리한 자료" : "정리할 자료"}</span>
        <span>{arranged ? "확인 후 적용한 모습" : "내 폴더"}</span>
      </div>
      {documents.map(document => (
        <div className={styles.directoryGroup} key={document.name}>
          {arranged && <div className={styles.directoryHeading}><Icon name="folder" /><span>{document.kind}</span></div>}
          <div className={styles.directoryFile}><Icon name="file" /><span>{document.name}</span>{arranged && <Icon name="check" size={16} />}</div>
        </div>
      ))}
      <p className={styles.sceneNote}>{arranged ? "찾기 쉬운 위치에, 필요한 자료끼리." : "회의록과 참고 자료, 메모가 함께 쌓여 있어요."}</p>
    </div>
  );
}

export function OrganizationScene() {
  return (
    <div data-ui data-organization-scene>
      <div data-organization-header><strong>정리할 자료</strong><span>내 폴더</span></div>
      {documents.map(document => (
        <div data-organization-row key={document.name}>
          <div data-organization-file><Icon name="file" /><span>{document.name}</span></div>
          <span data-organization-arrow><Icon name="chevron" size={20} /></span>
          <div data-organization-destination><Icon name="folder" size={19} /><span>{document.kind}</span></div>
          <span data-organization-check><Icon name="check" size={18} /></span>
        </div>
      ))}
      <p data-organization-note>회의록과 참고 자료, 메모가 함께 쌓여 있어요.</p>
      <p data-organization-confirmation><Icon name="check" size={18} /> 확인 후 정리되는 모습을 보여주는 예시예요.</p>
    </div>
  );
}

export function RecordScene() {
  return (
    <div className={styles.recordScene} data-ui>
      <div className={styles.sceneTop}>
        <span>나의 기록함</span>
        <span>위키</span>
      </div>
      <div className={styles.recordBody}>
        <Icon name="file" size={32} />
        <strong>프로젝트의 다음 방향</strong>
        <p>대화에서 정리한 생각과 참고한 자료를 한 문서에 모았어요.</p>
        <dl>
          <div>
            <dt>결정한 내용</dt>
            <dd>자료를 찾고, 계획을 확인한 뒤 정리하기</dd>
          </div>
          <div>
            <dt>참고한 원문</dt>
            <dd>프로젝트 회의록.md</dd>
          </div>
        </dl>
        <span className={styles.saved}><Icon name="check" size={17} /> 내 기록으로 저장</span>
      </div>
    </div>
  );
}

export function MaterialExample() {
  return (
    <div className={styles.materialExample}>
      <fieldset className={styles.materialChoice}>
        <legend>자료를 골라 내용을 살펴보세요</legend>
        {documents.map((document, index) => (
          <label key={document.name}>
            <input type="radio" name="introduction-document" value={index} defaultChecked={index === 0} />
            <Icon name="file" />
            <span>
              {document.kind}
            </span>
          </label>
        ))}
      </fieldset>
      <div className={styles.materialPages}>
        {documents.map((document, index) => (
          <article className={styles.materialPage} key={document.name} data-document={index}>
            <span>
              {document.name}
            </span>
            <h3>
              {document.kind}
            </h3>
            <p>
              {document.content}
            </p>
            <p className={styles.sceneNote}>기능을 설명하기 위해 준비한 예시 자료예요.</p>
          </article>
        ))}
      </div>
    </div>
  );
}
