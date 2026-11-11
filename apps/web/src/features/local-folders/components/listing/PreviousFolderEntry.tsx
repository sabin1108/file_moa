import { Icon } from "../../../../components/ui/Icon";
import { useLongPressSelection } from "../../hooks/use-long-press-selection";

export function PreviousFolderEntry({ name, kind, current, disabled, onOpen, onSelect }: {
  name: string;
  kind: "file" | "directory";
  current: boolean;
  disabled: boolean;
  onOpen: () => void;
  onSelect: () => void;
}) {
  const press = useLongPressSelection(disabled, onSelect);

  return <li {...press} data-long-press-selection>
    <button
      type="button"
      data-kind={kind}
      title={name}
      aria-current={current ? "location" : undefined}
      disabled={disabled}
      onKeyDown={event => {
        if (event.key === " " && !event.repeat && !event.nativeEvent.isComposing) {
          event.preventDefault();
          onSelect();
        }
      }}
      onClick={onOpen}
    >
      <Icon name={kind === "directory" ? "folder" : "file"} />
      <span>
        {name}
      </span>
      {current ? <small>열린 폴더</small> : kind === "directory" ? <Icon name="chevron" size={14} /> : null}
    </button>
  </li>;
}
