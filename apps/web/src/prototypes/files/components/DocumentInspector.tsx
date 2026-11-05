import { Icon } from "../../../components/ui/Icon";
import { PreviewButton } from "../../components/PreviewButton";
import { selectedFile } from "../library-data";
import styles from "../styles/inspector.module.css";

export function DocumentInspector() {
  return <aside className={styles.inspector} aria-label="선택 문서 미리보기">
    <header className={styles.header}><span>선택한 파일</span><PreviewButton label="미리보기 메뉴"><Icon name="more" size={18} /></PreviewButton></header>
    <div className={styles.fileHeading}><div className={styles.format}><Icon name="file" size={20} /><span>Markdown</span></div><h2>{selectedFile.name}</h2><p><Icon name="folder" size={13} />프론트엔드 공부</p></div>
    <div className={styles.tabs}><span>미리보기</span><PreviewButton>파일 정보</PreviewButton><PreviewButton label="문서 확대"><Icon name="external" size={15} /></PreviewButton></div>
    <div className={styles.readingPane} role="region" aria-label="예시 문서 본문" tabIndex={0}>
      <article className={styles.document}><span className={styles.documentEyebrow}>나의 공부 노트</span><h3>리액트 성능 향상</h3><p className={styles.documentLead}>빠르게 만드는 것보다,<br />느린 이유를 먼저 이해하기.</p><div className={styles.documentRule} /><h4>성능을 바라보는 순서</h4><p>화면이 느려졌다고 느낄 때, 모든 컴포넌트를 최적화할 필요는 없다. 먼저 측정하고 가장 큰 비용부터 줄인다.</p><h4>상태는 가까이에</h4><blockquote>상태는 가능한 한 사용하는 곳 가까이에 유지한다. 작은 상태 변경이 전체 화면으로 번지지 않도록.</blockquote><p>컴포넌트는 함께 바뀌는 것끼리 묶고, 서로 다른 책임은 나눈다.</p><h4>메모이제이션은 선택적으로</h4><p>memo와 useMemo는 도구다. 실제 렌더링 비용과 props 변화를 확인한 다음 적용한다.</p><div className={styles.documentSignature}><span>React</span><span>성능</span><span>기록</span></div></article>
    </div>
    <div className={styles.metadata}><div><span>수정일</span><span>{selectedFile.modified}</span></div><div><span>파일 크기</span><span>{selectedFile.size.toFixed(1)} KB</span></div><div><span>파일 권한</span><span>읽기 전용</span></div></div>
    <footer className={styles.footer}><div className={styles.referenceNotice}><Icon name="link" size={14} /><span>현재 대화에서 참고 중인 예시 자료</span></div><PreviewButton className={styles.chatAction}><Icon name="chat" size={16} />이 자료로 대화하기<Icon name="chevron" size={14} /></PreviewButton><p>예시 문서 · 실제 파일 접근 없음</p></footer>
  </aside>;
}
