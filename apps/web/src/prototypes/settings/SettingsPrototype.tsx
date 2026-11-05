"use client";
import { useState } from "react";
import { WorkspaceSidebar } from "../components/WorkspaceSidebar";
import { ActionLink } from "../../components/ui/ActionLink";
import { PrototypeDialog } from "../demo/PrototypeDialog";
import { DemoButton } from "../demo/DemoButton";
import { SettingRow } from "../../components/ui/SettingRow";
import styles from "./settings.module.css";
import shared from "../demo/demo.module.css";
import { ReplyPreview, DataScope } from "./SettingsContext";
import { FolderConnectionDemo } from "../demo/scenes/FolderConnectionDemo";
import ui from "../../styles/workspace-ui.module.css";

export function SettingsPrototype() {
  const [tab, setTab] = useState("기본");
  const [name, setName] = useState("sabin");
  const [saved, setSaved] = useState(false);
  const [length, setLength] = useState("보통");
  const [sources, setSources] = useState(true);
  return <div className={`${ui.system} ${ui.workspace}`}><WorkspaceSidebar active="settings" /><main className={ui.main}>
    <header className={ui.topbar}><h1>설정</h1><ActionLink href="/preview">전체 시안</ActionLink></header>
    <div className={ui.canvas}><div className={`${ui.sheet} ${styles.content}`} data-layout="reader">
      <nav className={styles.tabs} aria-label="설정 영역">{["기본", "연결", "데이터"].map(item => <button type="button" key={item} aria-current={tab === item ? "page" : undefined} onClick={() => { setTab(item); setSaved(false); }}>{item}</button>)}</nav>
      {tab === "기본" && <section>
        <div className={styles.identity}><div><span>나의 작업 공간</span><h2>{name || "표시 이름"}</h2><p>Google로 연결한 예시 계정</p></div><ActionLink href="/preview/screens/login">로그인 화면 보기 →</ActionLink></div>
        <div className={styles.preferences}><div><h2>대화 환경</h2>
        <SettingRow title="표시 이름" description="대화와 작업 공간에 표시합니다."><label className={shared.field}><span className="sr-only">표시 이름</span><input value={name} maxLength={40} onChange={event => { setName(event.target.value); setSaved(false); }} /></label></SettingRow>
        <SettingRow title="답변 길이" description="대화마다 다르게 요청할 수도 있어요."><label className={shared.field}><span className="sr-only">답변 길이</span><select value={length} onChange={event => { setLength(event.target.value); setSaved(false); }}><option>간결하게</option><option>보통</option><option>자세하게</option></select></label></SettingRow>
        <SettingRow title="참고 자료 표시" description="답변에서 사용한 자료를 함께 표시합니다."><label className={shared.check}><input type="checkbox" checked={sources} onChange={event => { setSources(event.target.checked); setSaved(false); }} />출처 함께 보기</label></SettingRow>
        <div className={styles.save}><span role="status">{saved ? "미리보기에만 반영했어요. 서버에는 저장되지 않습니다." : ""}</span><DemoButton variant="primary" onClick={() => setSaved(true)}>변경사항 확인</DemoButton></div>
        </div><ReplyPreview length={length} sources={sources} /></div>
      </section>}
      <section hidden={tab !== "연결"}><div className={styles.sectionHeader}><div><h2>이 기기에 연결한 자료 폴더</h2><p>자료 폴더 한 개를 읽기 전용으로 연결합니다.</p></div></div>
        <FolderConnectionDemo />
        <h2>자료 사용 시안</h2><SettingRow title="대화에 보낼 자료 예시" description="아래는 합성 자료 시안입니다. 연결한 폴더의 파일을 읽거나 보내지 않습니다."><PrototypeDialog initial="transfer" variant="secondary">선택 자료 예시</PrototypeDialog></SettingRow>
      </section>
      {tab === "데이터" && <section><h2>내 데이터</h2>
        <DataScope />
        <SettingRow title="자료 내보내기" description="대화·설정·자료 목록을 보관합니다."><PrototypeDialog initial="export" variant="secondary">내보내기</PrototypeDialog></SettingRow>
        <SettingRow title="사용량" description="실제 모델과 연결한 뒤 표시됩니다."><span>미측정</span></SettingRow>
        <SettingRow title="계정 삭제" description="서버 자료와 기기 원본의 차이를 먼저 확인합니다."><PrototypeDialog initial="delete-confirm" variant="secondary">삭제 범위 확인</PrototypeDialog></SettingRow>
      </section>}
      <p className={styles.notice}>모든 값과 동작은 화면 검토용 시안입니다. 실제 계정·폴더 연결·설정은 변경하지 않습니다.</p>
    </div></div>
  </main></div>;
}
