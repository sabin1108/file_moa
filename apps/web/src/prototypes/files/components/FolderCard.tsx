import type { ReactNode } from "react";
import { Icon } from "../../../components/ui/Icon";
import styles from "../styles/folder-canvas.module.css";

type FolderCardProps = {
  name: string;
  count: number;
  children?: ReactNode;
  root?: boolean;
  selected?: boolean;
  target?: boolean;
};

export function FolderCard({ name, count, children, root = false, selected = false, target = false }: FolderCardProps) {
  const className = [
    styles.folder, root ? styles.root : styles.child,
    selected && styles.selected, target && styles.target,
  ].filter(Boolean).join(" ");
  const Heading = root ? "h2" : "h3";

  return (
    <section className={className} aria-label={name + " 폴더"}>
      <header className={styles.folderHeading}>
        <Icon name="folder" size={root ? 23 : 34} />
        <div>
          <Heading>
            {name}
          </Heading>
          <span>파일 {count}개{target ? " · 도착 위치" : ""}</span>
        </div>
      </header>
      {children && <div className={root ? styles.rootContents : styles.documents}>
        {children}
      </div>}
      {selected && <p className={styles.selectionNote}>안의 파일 {count}개 선택됨</p>}
    </section>
  );
}
