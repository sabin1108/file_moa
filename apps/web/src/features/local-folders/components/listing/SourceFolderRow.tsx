import { Icon } from "../../../../components/ui/Icon";
import { useLongPressSelection } from "../../hooks/use-long-press-selection";
import { useSelectionRow } from "../../hooks/use-selection-row";
import styles from "./source-folder-browser.module.css";
import selectionStyles from "./file-selection.module.css";

export function SourceFolderRow({ name, selected, selecting, disabled, selectionDisabled, onOpen, onToggle, onLongSelect }: {
  name: string;
  selected: boolean;
  selecting: boolean;
  disabled: boolean;
  selectionDisabled: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onLongSelect: () => void;
}) {
  const press = useLongPressSelection(selectionDisabled, onLongSelect);
  const keyboard = useSelectionRow(selecting, selectionDisabled, onToggle);

  return <div
    className={selectionStyles.fileRow}
    data-selected={selected}
    data-selecting={selecting}
    {...press}
    {...keyboard}
  >
    <label className={selectionStyles.check} hidden={!selecting}>
      <input
        type="checkbox"
        aria-label={`${name} 폴더 선택`}
        checked={selected}
        disabled={selectionDisabled}
        onChange={onToggle}
      />
    </label>
    <button
      type="button"
      className={`${styles.entry} ${selectionStyles.fileAction}`}
      disabled={disabled}
      onClick={onOpen}
      aria-label={`${name} 폴더 열기`}
    >
      <Icon name="folder" size={22} /><span className={styles.name}>{name}</span><span className={styles.kind}>{selected ? "선택됨" : "폴더"}</span><Icon name="chevron" size={16} />
    </button>
  </div>;
}
