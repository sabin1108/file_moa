import { sourceDocuments } from "../prototype-data";
import { Icon } from "../../components/ui/Icon";
import { PreviewButton } from "./PreviewButton";
import styles from "../styles/sources.module.css";

export function SourcePanel() {
  return <aside className={styles.panel} aria-label="참고 자료 디자인 미리보기">
    <header className={styles.panelHeader}><div><Icon name="panel" size={17} /><h2>이 대화의 자료</h2></div><PreviewButton label="자료 패널 닫기"><Icon name="close" size={17} /></PreviewButton></header>
    <div className={styles.panelBody}>
      <div className={styles.sectionHeading}><h3>참고 중인 자료</h3><span>{sourceDocuments.length}개</span></div>
      <p className={styles.description}>선택한 자료 안에서 맥락을 찾아요.</p>
      <div className={styles.sourceList}>{sourceDocuments.map(source => <div className={source.selected ? styles.selectedFile : styles.fileRow} key={source.name}><Icon name="file" size={20} /><div><strong>{source.name}</strong><span>{source.folder}</span></div><Icon name="check" size={14} /></div>)}</div>
      <PreviewButton className={styles.addSource}><Icon name="plus" size={15} />참고 자료 추가</PreviewButton>
      <div className={styles.panelDivider} />
      <div className={styles.previewHeading}><h3>문서 미리보기</h3><PreviewButton label="문서 크게 보기"><Icon name="external" size={14} /></PreviewButton></div>
      <div className={styles.document}>
        <div className={styles.documentMeta}><span>Markdown</span><span>{sourceDocuments[0].size}</span></div>
        <h4>리액트 성능 향상</h4>
        <p className={styles.documentSubtitle}>더 빠른 화면을 위한 작은 원칙들</p>
        <div className={styles.documentRule} />
        <h5>추측보다 측정</h5>
        <p>최적화를 시작하기 전에 React DevTools로 렌더링 비용을 확인합니다.</p>
        <div className={styles.highlight}><span className={styles.highlightLabel}>답변에 참고한 부분</span><p>상태는 가능한 한 사용하는 곳 가까이에 유지하세요. 불필요한 리렌더링을 줄이는 가장 단순한 출발점입니다.</p></div>
        <h5>필요한 만큼의 최적화</h5><p>메모이제이션은 비용이 큰 연산이나 컴포넌트에 선택적으로 적용합니다.</p>
        <div className={styles.documentEnd}><span /><Icon name="file" size={13} /><span /></div>
      </div>
      <div className={styles.sourceLocation}><Icon name="folder" size={14} /><span>프론트엔드 공부</span><Icon name="chevron" size={11} /><span>예시 문서</span></div>
    </div>
    <footer className={styles.panelFooter}><Icon name="link" size={15} /><p>자료와 답변을 함께 살펴보세요.<br /><span>원본 파일은 내 컴퓨터에 그대로.</span></p></footer>
  </aside>;
}
