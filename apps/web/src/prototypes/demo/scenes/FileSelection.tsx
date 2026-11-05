import { Icon } from "../../../components/ui/Icon";
import layout from "../scene-layout.module.css";

type FileSummary = { name: string; topic: string; size: number };

export function FileSelection({ files, status }: { files: readonly FileSummary[]; status?: (index: number) => string }) {
  return <ul className={layout.fileRows}>{files.map((file, index) => {
    const label = status?.(index);
    const needsAttention = label === "미처리";
    return <li key={file.name} data-attention={needsAttention || undefined}>
      <Icon name={needsAttention ? "warning" : label === "완료" || label === "준비됨" ? "check" : "file"} size={18} />
      <div><strong>{file.name}</strong><small>{file.topic}</small></div>
      <span>{label ?? `${file.size} KB`}</span>
    </li>;
  })}</ul>;
}
