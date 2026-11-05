"use client";
import { useState } from "react";
import { ActionLink } from "../../components/ui/ActionLink";
import { WorkspaceSidebar } from "../components/WorkspaceSidebar";
import { SceneSurface, sceneLayout } from "./SceneSurface";
import { scenes, type SceneId } from "./scene-data";
import ui from "../../styles/workspace-ui.module.css";

export function ScenePreview({ initial }: { initial: SceneId }) {
  const [scene, setScene] = useState(initial);
  if (scene === "startup") return <div className={`${ui.system} ${ui.entryPreview}`}>
    <header className={ui.topbar}><span>모아 · 첫 접속 시안</span><nav><ActionLink href="/preview">전체 시안</ActionLink></nav></header>
    <main className={ui.canvas}><section className={ui.sheet} data-scene={scene}><SceneSurface scene={scene} navigate={setScene} /></section></main>
  </div>;
  return <div className={`${ui.system} ${ui.workspace}`}>
    <WorkspaceSidebar showHistory={false} active={scenes[scene].group === "계정과 데이터" ? "settings" : scene === "search" ? "chat" : "files"} />
    <main className={ui.main}>
      <header className={ui.topbar}><span>{scenes[scene].group}</span><nav><ActionLink href="/preview">전체 시안</ActionLink><ActionLink href="/files">내 폴더</ActionLink></nav></header>
      <div className={ui.canvas}><section className={ui.sheet} data-layout={sceneLayout(scene)} data-scene={scene}><SceneSurface scene={scene} navigate={setScene} /></section></div>
    </main>
  </div>;
}
