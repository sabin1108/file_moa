import { Icon } from "../../../components/ui/Icon";
import { PrototypeDialog } from "../../demo/PrototypeDialog";
import {
  selectedNames,
  studyFolder,
  portfolioFolder,
  sourceFolder,
  targetFolder,
  studyGroups,
  portfolioGroups
} from "../folder-groups";
import styles from "../styles/move-plan.module.css";

export function MovePlanPreview() {
  const sourceCount = studyGroups.find(group => group.name === sourceFolder)?.files.length ?? 0;
  const targetCount = portfolioGroups.find(group => group.name === targetFolder)?.files.length ?? 0;

  return (
    <aside className={styles.selection} aria-labelledby="selection-heading">
      <header className={styles.heading}>
        <h2 id="selection-heading">파일 이동</h2>
        <span>{selectedNames.size}개 선택</span>
      </header>

      <section className={styles.section} aria-labelledby="selected-files-heading">
        <h3 id="selected-files-heading">선택한 파일</h3>
        <p className={styles.origin}>{studyFolder} / {sourceFolder}</p>
        <ul className={styles.fileList}>
          {[...selectedNames].map(name => (
            <li key={name}>
              <Icon name="file" size={16} />
              <span>
                {name}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="destination-heading">
        <div className={styles.sectionHeading}>
          <h3 id="destination-heading">이동할 폴더</h3>
          <PrototypeDialog initial="destination" className={styles.changeTarget}>변경</PrototypeDialog>
        </div>
        <div className={styles.destination}>
          <Icon name="folder" size={25} />
          <div>
            <span>
              {portfolioFolder}
            </span>
            <strong>
              {targetFolder}
            </strong>
          </div>
        </div>
        <p className={styles.explanation}>선택한 파일이 이 폴더로 옮겨집니다.</p>
        <details className={styles.details}>
          <summary>이동 후 파일 수</summary>
          <dl>
            <div>
              <dt>
                {sourceFolder}
              </dt>
              <dd>{sourceCount} → {sourceCount - selectedNames.size}개</dd>
            </div>
            <div>
              <dt>
                {targetFolder}
              </dt>
              <dd>{targetCount} → {targetCount + selectedNames.size}개</dd>
            </div>
          </dl>
        </details>
      </section>

      <footer className={styles.footer}>
        <PrototypeDialog initial="move-progress" variant="primary">{selectedNames.size}개 파일 이동</PrototypeDialog>
        <PrototypeDialog initial="copy-result" variant="secondary">
          <Icon name="copy" size={15} />
          원본을 남기고 복사
        </PrototypeDialog>
        <p>디자인 시안 · 실제 실행되지 않습니다.</p>
      </footer>
    </aside>
  );
}
