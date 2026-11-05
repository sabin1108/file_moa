import { Icon } from "../../components/ui/Icon";
import { DemoButton } from "./DemoButton";
import { SceneBody } from "./SceneBody";
import { scenes, type SceneId, type SceneProps } from "./scene-data";
import ui from "../../styles/workspace-ui.module.css";

export function sceneLayout(scene: SceneId) {
  if (scene === "document") return "reader";
  if (["conflict", "search", "empty", "error", "login-error", "delete-confirm", "deleted"].includes(scene)) return "compact";
  return "standard";
}

// Shared presentation; page and modal retain their own navigation/focus lifecycles.
export function SceneSurface({ headingId, ...props }: SceneProps & { headingId?: string }) {
  const Heading = headingId ? "h2" : "h1";
  const title = props.scene === "document" && props.documentName ? props.documentName : scenes[props.scene].title;
  return <>
    <header className={ui.surfaceHeader}>
      <div>
        <Heading id={headingId}>{title}</Heading>
        {props.scene !== "document" && <p>{scenes[props.scene].description}</p>}
      </div>
      {props.dismiss && <DemoButton variant="ghost" aria-label="닫기" onClick={props.dismiss}><Icon name="close" size={18} /></DemoButton>}
    </header>
    <div className={ui.surfaceBody} aria-live={scenes[props.scene].group === "로딩과 작업 상태" || props.scene === "folder-connection" ? undefined : "polite"}><SceneBody {...props} /></div>
    <footer className={ui.surfaceFooter}>디자인 시안 · 실제 파일 작업과 전송은 실행하지 않습니다.</footer>
  </>;
}
