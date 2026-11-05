import { Icon } from "../../../components/ui/Icon";
import { PreviewButton } from "../../components/PreviewButton";
import { StatusLabel } from "../../../components/ui/StatusLabel";
import { libraryFiles, selectedFiles } from "../library-data";
import styles from "../styles/file-list.module.css";

export function FileList() {
  const visibleFiles = libraryFiles.slice(0, 6);
  return <section className={styles.files} aria-labelledby="files-heading">
    <div className={styles.toolbar}><h2 id="files-heading"><Icon name="folder" size={17} />프론트엔드 공부<Icon name="chevron" size={12} /><span>전체 파일</span></h2><div className={styles.search}><Icon name="search" size={16} /><label htmlFor="file-search" className="sr-only">파일 이름 검색 미리보기</label><input id="file-search" readOnly placeholder="파일 검색" /></div></div>
    <div className={styles.bulkToolbar} aria-label="선택한 파일 관리">
      <div className={styles.selectionCount}><span className={styles.checked}><Icon name="check" size={12} /></span><strong>{selectedFiles.length}개 선택</strong><span>무엇을 할까요?</span></div>
      <div className={styles.bulkActions}><PreviewButton variant="secondary"><Icon name="folder" size={16} />이동</PreviewButton><PreviewButton variant="secondary"><Icon name="copy" size={16} />복사</PreviewButton><PreviewButton variant="secondary">분류</PreviewButton><PreviewButton label="이름 변경 등 더 많은 정리 작업"><Icon name="more" size={18} /></PreviewButton></div>
    </div>
    <div className={styles.tableViewport} role="region" aria-label="예시 파일 목록" tabIndex={0}><table className={styles.table}>
      <caption className="sr-only">8개 파일 중 6개를 보여주는 예시 목록. 첫 3개가 선택된 디자인입니다.</caption>
      <thead><tr><th scope="col" className={styles.checkColumn}><span className={styles.unchecked} role="img" aria-label="전체 선택 예시" /></th><th scope="col">파일 이름<Icon name="down" size={12} /></th><th scope="col" className={styles.state}>위치 / 상태</th><th scope="col" className={styles.size}>크기</th><th scope="col" className={styles.rowAction}><span className="sr-only">작업</span></th></tr></thead>
      <tbody>{visibleFiles.map((file, index) => {
        const selected = index < selectedFiles.length;
        return <tr key={file.name} className={selected ? styles.selectedRow : undefined}><td className={styles.checkColumn}><span className={selected ? styles.checked : styles.unchecked} role="img" aria-label={selected ? "선택된 파일 예시" : "선택하지 않은 파일 예시"}>{selected && <Icon name="check" size={12} />}</span></td><td><div className={styles.fileIdentity}><Icon name="file" size={18} /><span>{file.name}</span></div></td><td className={styles.state}><StatusLabel>{selected ? "정리 대상" : "이 폴더"}</StatusLabel></td><td className={styles.size}>{file.size.toFixed(1)} KB</td><td className={styles.rowAction}><PreviewButton label={file.name + " 작업"}><Icon name="more" size={16} /></PreviewButton></td></tr>;
      })}</tbody>
    </table></div>
    <div className={styles.listFooter}><span>{libraryFiles.length}개 중 {visibleFiles.length}개 표시 · 예시 자료</span><PreviewButton>나머지 {libraryFiles.length - visibleFiles.length}개 보기<Icon name="down" size={13} /></PreviewButton></div>
  </section>;
}
