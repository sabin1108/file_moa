import { Icon } from "../../../components/ui/Icon";
import layout from "../scene-layout.module.css";

type FolderLocation = {
  root: string;
  name: string
};

export function FolderRoute({ from, to, copy = false }: {
  from: FolderLocation;
  to: FolderLocation;
  copy?: boolean
}) {
  return <div className={layout.route} aria-label={copy ? "복사 경로" : "이동 경로"}>
    <div className={layout.routeFolder}>
      <span>{copy ? "원본 보관" : "출발"} · {from.root}</span>
      <strong>
        <Icon name="folder" size={18} />
        {from.name}
      </strong>
    </div>
    <span className={layout.arrow} aria-hidden="true">→</span>
    <div className={layout.routeFolder}>
      <span>도착 · {to.root}</span>
      <strong>
        <Icon name="folder" size={18} />
        {to.name}
      </strong>
    </div>
  </div>;
}
