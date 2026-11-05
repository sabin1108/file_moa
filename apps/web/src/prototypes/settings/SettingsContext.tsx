import { Icon } from "../../components/ui/Icon";
import { PrototypeDialog } from "../demo/PrototypeDialog";
import { studyFolder, studyGroups, portfolioFolder, portfolioGroups } from "../files/folder-groups";
import styles from "./settings.module.css";

export function ReplyPreview({ length, sources }: { length: string; sources: boolean }) {
  return <aside className={styles.replyPreview}><span>답변 미리보기 · {length}</span><h3>리액트 화면이 느릴 때는?</h3><p>먼저 Profiler로 시간이 걸리는 부분을 확인해 보세요.</p>{length !== "간결하게" && <p>입력 상태는 사용하는 컴포넌트 가까이에 두고, 큰 목록은 측정한 뒤 개선하면 좋아요.</p>}{length === "자세하게" && <p>같은 데이터와 기기에서 변경 전후를 비교하고, 파일 수와 대화 길이도 함께 기록하세요.</p>}{sources && <div className={styles.source}><Icon name="file" size={16} />리액트 성능 향상.md</div>}<small>선택한 설정에 따른 예시입니다.</small></aside>;
}

export function ConnectedFolders() {
  const folders = [
    { name: studyFolder, groups: studyGroups, scene: "permission" as const, action: "권한 확인" },
    { name: portfolioFolder, groups: portfolioGroups, scene: "connect" as const, action: "다시 연결" },
  ];
  return <div className={styles.folderPair}>{folders.map(folder => <section className={styles.folder} key={folder.name}><header><Icon name="folder" size={22} /><h3>{folder.name}</h3><span>{folder.groups.reduce((sum, group) => sum + group.files.length, 0)}개 문서</span></header><ul>{folder.groups.map(group => <li key={group.name}><span>{group.name}</span><small>{group.files.length}개</small></li>)}</ul><footer><span>이 기기 · 읽기 연결 예시</span><PrototypeDialog initial={folder.scene} variant="secondary">{folder.action}</PrototypeDialog></footer></section>)}</div>;
}

export function DataScope() {
  return <div className={styles.dataScope}><section><h3>작업 공간에 보관</h3><p>대화 기록 · 프로필과 답변 설정<br />선택해 보낸 문서 복사본</p><span>내보내기와 삭제 범위를 확인할 수 있어요.</span></section><section><h3>내 컴퓨터에 보관</h3><p>연결한 폴더의 원본 문서<br />이 기기의 폴더 접근 권한</p><span>계정을 삭제해도 원본 파일은 남습니다.</span></section></div>;
}
