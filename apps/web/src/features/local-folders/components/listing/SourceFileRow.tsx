import { checkDocumentCandidate } from "@personal-ai/domain";
import { Icon } from "../../../../components/ui/Icon";
import styles from "./source-folder-browser.module.css";
import selectionStyles from "./file-selection.module.css";
import { useLongPressSelection } from "../../hooks/use-long-press-selection";
import { useSelectionRow } from "../../hooks/use-selection-row";

type Props = {
  name: string;
  selected: boolean;
  previewing: boolean;
  selecting: boolean;
  selectionDisabled: boolean;
  previewDisabled: boolean;
  onToggle: () => void;
  onPreview: () => void;
  onLongSelect: () => void;
};
/** checkbox와 미리보기는 형제 조작이다. 파일 선택이 본문 읽기를 유발하지 않는다. */
export function SourceFileRow({ name, selected, previewing, selecting, selectionDisabled, previewDisabled, onToggle, onPreview, onLongSelect }: Props) {
  const press = useLongPressSelection(selectionDisabled, onLongSelect);
  const keyboard = useSelectionRow(selecting, selectionDisabled, onToggle);
  const contents = <><Icon name="file" size={20} /><span className={styles.name}>{name}{previewing && <small className={styles.rowState}>미리보기 중</small>}</span></>;
  const className = `${styles.entry} ${selectionStyles.fileAction}`;
  const kind = selected ? "선택됨" : name.includes(".") ? name.split(".").at(-1)!.toUpperCase() : "파일";

  return <div
    className={selectionStyles.fileRow}
    data-selected={selected}
    data-selecting={selecting}
    data-previewing={previewing}
    {...press}
    {...keyboard}
  >
    <label className={selectionStyles.check} hidden={!selecting}>
      <input
        type="checkbox"
        aria-label={`${name} 선택`}
        checked={selected}
        disabled={selectionDisabled}
        onChange={onToggle}
      />
    </label>
    {checkDocumentCandidate(name, 0) === null
      ? <button
        type="button"
        className={className}
        disabled={previewDisabled}
        onClick={onPreview}
        aria-current={previewing ? "true" : undefined}
        aria-label={`${name} 미리보기`}
      >
        {contents}<span className={styles.kind}>{kind}</span>
      </button>
      : <div
        className={className}
        tabIndex={selectionDisabled ? -1 : 0}
        aria-label={`${name} · Space로 선택`}
      >{contents}<span className={styles.kind}>{kind}</span></div>}
  </div>;
}
