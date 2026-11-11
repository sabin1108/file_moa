import { PrototypeDialog } from "../../demo/PrototypeDialog";
import { Icon } from "../../../components/ui/Icon";
import { studyFolder, portfolioFolder, studyGroups, portfolioGroups, selectedNames } from "../folder-groups";
import { FolderCard } from "./FolderCard";
import styles from "../styles/folder-canvas.module.css";

function DocumentTile({ name }: { name: string }) {
  return (
    <PrototypeDialog
      initial="document"
      documentName={name}
      className={styles.document}
      label={name + " 미리보기"}
    >
      <span className={styles.paper}>
        <Icon name="file" size={30} />
        <Icon name="check" size={14} />
      </span>
      <span>
        {name}
      </span>
    </PrototypeDialog>
  );
}

export function FolderCanvas() {
  return (
    <section className={styles.canvas} aria-label="폴더 안의 폴더 보기">
      <FolderCard
        name={studyFolder}
        count={studyGroups.reduce((sum, group) => sum + group.files.length, 0)}
        root
      >
        {studyGroups.map(group => {
          const selected = group.files.some(name => selectedNames.has(name));

          return (
            <FolderCard key={group.name} name={group.name} count={group.files.length} selected={selected}>
              {selected ? group.files.map(name => <DocumentTile key={name} name={name} />) : undefined}
            </FolderCard>
          );
        })}
      </FolderCard>
      <FolderCard
        name={portfolioFolder}
        count={portfolioGroups.reduce((sum, group) => sum + group.files.length, 0)}
        root
      >
        {portfolioGroups.map(group => (
          <FolderCard key={group.name} name={group.name} count={group.files.length} target={group.target} />
        ))}
      </FolderCard>
    </section>
  );
}
